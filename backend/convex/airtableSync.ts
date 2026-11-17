import { action, internalAction, internalMutation, internalQuery, query } from "./_generated/server";
import { internal } from "./_generated/api";
import { v, ConvexError } from "convex/values";
import { requireAdmin } from "./access";

const BASE="appphCtnqFUvjDsZd";
const EVENTS="tblOSo45KnNIXosD7";
const EXPENSES="tbleZXwneyuw6iLJK";
type AirtableRow={id:string;fields:Record<string,unknown>};
const asNum=(v:unknown)=>typeof v==="number"&&Number.isFinite(v)?v:0;
const asText=(v:unknown)=>typeof v==="string"?v.trim():"";
const cents=(n:number)=>Math.round(Math.max(0,n)*100);
async function loadTable(token:string,table:string,fields:string[]):Promise<AirtableRow[]>{
  const result:AirtableRow[]=[];
  let offset="";
  do{
    const u=new URL("https://api.airtable.com/v0/"+BASE+"/"+table);
    u.searchParams.set("pageSize","100");
    for(const field of fields)u.searchParams.append("fields[]",field);
    if(offset)u.searchParams.set("offset",offset);
    const response=await fetch(u,{headers:{Authorization:"Bearer "+token}});
    if(!response.ok)throw Error("Airtable sync failed (HTTP "+response.status+")");
    const json=await response.json() as {records?:AirtableRow[];offset?:string};
    result.push(...(json.records||[]));
    if(result.length>1000)throw Error("Too many Airtable records; sync safely limited to 1,000");
    offset=json.offset||"";
  }while(offset);
  return result;
}
function monthOf(fields:Record<string,unknown>):string{
 const date=asText(fields["Transaction Date"]);
 if(/^\d{4}-\d{2}-\d{2}$/.test(date))return date.slice(0,7);
 const title=asText(fields["Expense"]);
 const months=["January","February","March","April","May","June","July","August","September","October","November","December"];
 const m=title.match(/(January|February|March|April|May|June|July|August|September|October|November|December)\s+(20\d\d)/i);
 if(!m)return "";
 return m[2]+"-"+String(months.findIndex(x=>x.toLowerCase()===m[1].toLowerCase())+1).padStart(2,"0");
}
const eventRow=v.object({
 sourceId:v.string(),title:v.string(),date:v.string(),venue:v.string(),
 category:v.string(),capacity:v.number(),ticketsSold:v.number(),attendeesActual:v.number(),
 priceCents:v.number(),revenueCents:v.number(),expensesCents:v.number()
});
const expenseRow=v.object({sourceId:v.string(),title:v.string(),month:v.string(),amountCents:v.number()});

export const authorized=internalQuery({
 args:{tokenIdentifier:v.string()},
 handler:async(ctx,{tokenIdentifier})=>{
  const admin=await ctx.db.query("admins").withIndex("by_token",q=>q.eq("tokenIdentifier",tokenIdentifier)).unique();
  return !!(admin&&admin.active);
 }
});

async function fetchAndApply(ctx:any){
 const token=process.env.AIRTABLE_SYNC_TOKEN;
 if(!token)throw Error("Airtable sync is not configured: set AIRTABLE_SYNC_TOKEN in Convex environment.");
 const [events,expenses]=await Promise.all([
  loadTable(token,EVENTS,["Event","Date","Type","Status","Capacity","Attendees","Ticket Price","Gross Revenue","Venue Fee","Total Expenses"]),
  loadTable(token,EXPENSES,["Expense","Type","Cost","Transaction Date","Event","Net Cost After Expected Refund"])
 ]);
 const completed=events.filter(r=>asText(r.fields["Status"])==="Completed"&&/^\d{4}-\d{2}-\d{2}$/.test(asText(r.fields["Date"])));
 const mapped=completed.map(r=>{
  const f=r.fields,name=asText(f["Event"]),headcount=Math.floor(asNum(f["Attendees"]));
  const venue=name.includes("Casa D")?"Casa Dōson":name.split(" – ")[0]||"Not recorded";
  return {sourceId:r.id,title:name,date:asText(f["Date"]),venue,
    category:"Ceramics",capacity:Math.max(1,Math.floor(asNum(f["Capacity"]))||headcount),
    ticketsSold:headcount,attendeesActual:headcount,priceCents:cents(asNum(f["Ticket Price"])),
    revenueCents:cents(asNum(f["Gross Revenue"])),
    expensesCents:cents(asNum(f["Venue Fee"])+asNum(f["Total Expenses"]))};
 });
 const overhead=expenses.filter(r=>{
  const f=r.fields;
  return asText(f["Type"])==="Overhead" &&
   (!Array.isArray(f["Event"])||(f["Event"] as unknown[]).length===0)&&
   monthOf(f).length===7;
 }).map(r=>({sourceId:r.id,title:asText(r.fields["Expense"]),month:monthOf(r.fields),
  amountCents:cents(typeof r.fields["Net Cost After Expected Refund"]==="number"?asNum(r.fields["Net Cost After Expected Refund"]):asNum(r.fields["Cost"]))}));
 await ctx.runMutation(internal.airtableSync.apply,{events:mapped,expenses:overhead});
 return {events:mapped.length,overheadExpenses:overhead.length};
}
export const refresh=internalAction({args:{},handler:async(ctx)=>{
 if(!process.env.AIRTABLE_SYNC_TOKEN)return {events:0,overheadExpenses:0};
 return await fetchAndApply(ctx);
}});
export const syncNow=action({
 args:{},
 handler:async(ctx)=>{
  const identity=await ctx.auth.getUserIdentity();
  if(!identity||!(await ctx.runQuery(internal.airtableSync.authorized,{tokenIdentifier:identity.tokenIdentifier})))
   throw new ConvexError("Not authorized");
  return await fetchAndApply(ctx);
 }
});
export const apply=internalMutation({
 args:{events:v.array(eventRow),expenses:v.array(expenseRow)},
 handler:async(ctx,{events,expenses})=>{
  for(const e of events){
   let old=await ctx.db.query("events").withIndex("by_airtable_record",q=>q.eq("airtableRecordId",e.sourceId)).unique();
   if(!old){
    const same=await ctx.db.query("events").withIndex("by_date",q=>q.eq("date",e.date)).collect();
    old=same.find(r=>r.historical&&r.title===e.title&&!r.airtableRecordId)||null;
   }
   const data={
    title:e.title,date:e.date,venue:e.venue,category:"Ceramics" as const,
    status:"draft" as const,historical:true,featured:false,airtableRecordId:e.sourceId,
    priceCents:e.priceCents,capacity:e.capacity,ticketsSold:e.ticketsSold,
    attendeesActual:e.attendeesActual,actualRevenueCents:e.revenueCents,expensesCents:e.expensesCents,
    checkoutUrl:undefined,squareVariationId:undefined,updatedAt:Date.now()
   };
   if(old)await ctx.db.patch(old._id,data);
   else {
    const slug="airtable-"+e.sourceId.toLowerCase();
    await ctx.db.insert("events",{...data,slug,time:"",timezone:"America/Chicago",duration:0,
      description:"",notes:"Imported from Airtable. Time and duration not recorded."});
   }
  }
  // Airtable has authority over existing linked overhead; no unlinked expenses are imported.
  for(const o of expenses){
   const old=await ctx.db.query("operatingExpenses").withIndex("by_airtable_record",q=>q.eq("airtableRecordId",o.sourceId)).unique();
   const data={airtableRecordId:o.sourceId,title:o.title,month:o.month,amountCents:o.amountCents,updatedAt:Date.now()};
   if(old)await ctx.db.patch(old._id,data);
   else await ctx.db.insert("operatingExpenses",data);
  }
 }
});
export const operatingExpenses=query({
 args:{},
 handler:async(ctx)=>{
  await requireAdmin(ctx);
  return await ctx.db.query("operatingExpenses").collect();
 }
});
