import { action, internalAction, internalMutation, internalQuery, query } from "./_generated/server";
import { api, internal } from "./_generated/api";
import { v } from "convex/values";

const VERSION = "2026-09-16";
type SquarePayment = {id?:string;status?:string;order_id?:string;buyer_email_address?:string;amount_money?:{amount?:number;currency?:string};location_id?:string};
type SquareLine = {catalog_object_id?:string;quantity?:string;name?:string;total_money?:{amount?:number};base_price_money?:{amount?:number}};
type SquareOrder = {id?:string;line_items?:SquareLine[];fulfillments?:Array<{pickup_details?:{recipient?:{display_name?:string;email_address?:string}}}>};
type PaymentLink = {url?:string;long_url?:string;id?:string;order_id?:string};

async function squareGet(path:string):Promise<any>{
  const access=process.env.SQUARE_ACCESS_TOKEN;
  if(!access) throw Error("Square is not connected: set SQUARE_ACCESS_TOKEN in Convex");
  const sandbox=process.env.SQUARE_ENVIRONMENT==="sandbox";
  const url=(sandbox?"https://connect.squareupsandbox.com":"https://connect.squareup.com")+path;
  const response=await fetch(url,{headers:{"Authorization":"Bearer "+access,"Square-Version":VERSION,"Accept":"application/json"}});
  if(!response.ok)throw Error("Square API request failed: HTTP "+response.status+" ("+path.split("?")[0]+")");
  return await response.json();
}

function safeSquareUrl(value:string){
  try{
    const u=new URL(value);
    return u.protocol==="https:"&&!u.username&&!u.password&&
      ["square.link","checkout.square.site","sandbox.square.link"].includes(u.hostname.toLowerCase());
  }catch{return false;}
}

// Verify the admin's configured Square link maps to exactly one catalog variation.
// This prevents attributing unrelated Square payments to MAKE SPACE events.

// Dashboard-created Square links aren't exposed by the Checkout API list endpoint.
// Read the merchant's catalog instead; the admin explicitly chooses the ticket variation.
// Never infer or claim that a catalog selection proves ownership of a specific URL.
async function catalogTickets(){
  let cursor:string|undefined;
  const options:Array<{variationId:string;name:string;priceCents:number|null;currency:string}>=[];
  for(let page=0;page<25;page++){
    const qs=new URLSearchParams({types:"ITEM",limit:"100"});
    if(cursor)qs.set("cursor",cursor);
    const result=await squareGet("/v2/catalog/list?"+qs.toString());
    const objects=result.objects as Array<{id:string;item_data?:{name?:string;variations?:Array<{id:string;item_variation_data?:{name?:string;price_money?:{amount?:number;currency?:string}}}>}}>|undefined;
    for(const item of objects||[]){
      for(const variation of item.item_data?.variations||[]){
        if(!variation.id)continue;
        const money=variation.item_variation_data?.price_money;
        options.push({variationId:variation.id,
          name:(item.item_data?.name||"Untitled item")+(variation.item_variation_data?.name&&variation.item_variation_data.name!=="Regular"?" — "+variation.item_variation_data.name:""),
          priceCents:typeof money?.amount==="number"?money.amount:null,
          currency:money?.currency||"USD"});
      }
    }
    cursor=result.cursor;
    if(!cursor)break;
  }
  return options.sort((a,b)=>a.name.localeCompare(b.name));
}

export const inspectLink=action({
  args:{url:v.string()},
  handler:async(ctx,{url})=>{
    const identity=await ctx.runQuery(api.session.whoAmI,{});
    if(!identity?.authorized)throw Error("Not authorized");
    if(!safeSquareUrl(url))throw Error("Enter a valid Square checkout link");
    let cursor:string|undefined,match:PaymentLink|undefined;
    for(let page=0;page<25;page++){
      const qs=new URLSearchParams({limit:"100"});
      if(cursor)qs.set("cursor",cursor);
      const result=await squareGet("/v2/online-checkout/payment-links?"+qs.toString());
      match=(result.payment_links as PaymentLink[]|undefined)?.find(link=>link.url===url || link.long_url===url);
      if(match)break;
      cursor=result.cursor;
      if(!cursor)break;
    }
    if(!match?.order_id)return {mode:"catalog" as const, tickets:await catalogTickets()};
    const template:SquareOrder=(await squareGet("/v2/orders/"+encodeURIComponent(match.order_id))).order;
    const lines=template?.line_items||[];
    if(lines.length!==1||!lines[0].catalog_object_id)
      throw Error("Square link must contain exactly one catalog item variation");
    return {mode:"link" as const,variationId:lines[0].catalog_object_id,itemName:lines[0].name||"Square ticket",linkId:match.id||""};
  }
});

export const listAttendees=query({
  args:{eventId:v.id("events")},
  handler:async(ctx,{eventId})=>{
    const identity=await ctx.auth.getUserIdentity();
    if(!identity)throw Error("Unauthorized");
    const admin=await ctx.db.query("admins").withIndex("by_token",q=>q.eq("tokenIdentifier",identity.tokenIdentifier)).unique();
    if(!admin?.active)throw Error("Unauthorized");
    const event=await ctx.db.get(eventId);
    if(!event)throw Error("Event missing");
    const records=await ctx.db.query("registrations").withIndex("by_event",q=>q.eq("eventId",eventId)).collect();
    const paid=records.filter(r=>r.status==="paid");
    const quantity=paid.reduce((sum,r)=>sum+r.quantity,0);
    return {
      eventTitle:event.title,capacity:event.capacity,
      seatsSold:quantity,seatsRemaining:Math.max(0,event.capacity-quantity),
      revenueCents:paid.reduce((sum,r)=>sum+r.amountCents,0),
      rows:records.map(r=>({_id:r._id,buyerName:r.buyerName||"",buyerEmail:r.buyerEmail||"",
        quantity:r.quantity,amountCents:r.amountCents,status:r.status,
        confirmationStatus:r.confirmationStatus,createdAt:r.createdAt,squarePaymentId:r.squarePaymentId}))
    };
  }
});

export const eventForVariation=internalQuery({
  args:{variationId:v.string()},
  handler:async(ctx,{variationId})=>
    await ctx.db.query("events").withIndex("by_square_variation",q=>q.eq("squareVariationId",variationId)).unique()
});

export const registrationForEmail=internalQuery({
  args:{id:v.id("registrations")},
  handler:async(ctx,{id})=>{
    const r=await ctx.db.get(id);if(!r)return null;
    const event=await ctx.db.get(r.eventId);
    return event?{registration:r,event}:null;
  }
});

export const setConfirmation=internalMutation({
  args:{id:v.id("registrations"),status:v.union(v.literal("pending"),v.literal("sent"),v.literal("no_email"),v.literal("failed"))},
  handler:async(ctx,{id,status})=>{
    const r=await ctx.db.get(id);if(!r||r.confirmationStatus==="sent")return;
    await ctx.db.patch(id,{confirmationStatus:status,...(status==="sent"?{confirmationSentAt:Date.now()}: {})});
  }
});

export const recordPayment=internalMutation({
  args:{
    squarePaymentId:v.string(),squareOrderId:v.string(),variationId:v.string(),
    email:v.optional(v.string()),name:v.optional(v.string()),
    quantity:v.number(),amountCents:v.number(),currency:v.string()
  },
  handler:async(ctx,args)=>{
    const existing=await ctx.db.query("registrations").withIndex("by_payment",q=>q.eq("squarePaymentId",args.squarePaymentId)).unique();
    if(existing)return existing._id; // webhook retries never create duplicates or duplicate emails
    const event=await ctx.db.query("events").withIndex("by_square_variation",q=>q.eq("squareVariationId",args.variationId)).unique();
    if(!event||event.status==="draft")return null;
    if(!Number.isInteger(args.quantity)||args.quantity<1||args.quantity>100)return null;
    if(args.currency!=="USD")return null;
    const id=await ctx.db.insert("registrations",{
      eventId:event._id,squarePaymentId:args.squarePaymentId,squareOrderId:args.squareOrderId,
      ...(args.email?{buyerEmail:args.email}:{}),...(args.name?{buyerName:args.name}:{}),
      quantity:args.quantity,amountCents:args.amountCents,currency:args.currency,
      status:"paid",confirmationStatus:args.email?"pending":"no_email",createdAt:Date.now()
    });
    if(args.email)await ctx.scheduler.runAfter(0,internal.confirmations.send,{registrationId:id});
    return id;
  }
});

export const processPayment=internalAction({
  args:{paymentId:v.string()},
  handler:async(ctx,{paymentId})=>{
    const payment:SquarePayment=(await squareGet("/v2/payments/"+encodeURIComponent(paymentId))).payment;
    if(payment?.status!=="COMPLETED"||!payment.id||!payment.order_id)return;
    const order:SquareOrder=(await squareGet("/v2/orders/"+encodeURIComponent(payment.order_id))).order;
    const lines=order?.line_items||[];
    if(lines.length!==1||!lines[0].catalog_object_id)return; // fail closed on ambiguous carts
    const quantity=Number(lines[0].quantity);
    if(!Number.isInteger(quantity)||quantity<1)return;
    const event=await ctx.runQuery(internal.square.eventForVariation,{variationId:lines[0].catalog_object_id});
    if(!event)return; // unrelated Square purchase
    const recipient=order.fulfillments?.find(f=>f.pickup_details?.recipient)?.pickup_details?.recipient;
    const email=payment.buyer_email_address||recipient?.email_address;
    await ctx.runMutation(internal.square.recordPayment,{
      squarePaymentId:payment.id,squareOrderId:payment.order_id,variationId:lines[0].catalog_object_id,
      quantity,amountCents:payment.amount_money?.amount||0,currency:payment.amount_money?.currency||"",
      ...(email?{email}:{}),...(recipient?.display_name?{name:recipient.display_name}:{})
    });
  }
});
