import { httpRouter } from "convex/server";
import { httpAction } from "./_generated/server";
import { internal } from "./_generated/api";

const http=httpRouter();

// Exact notification URL used in Square's signature must match byte-for-byte.
http.route({path:"/square/webhook",method:"POST",handler:httpAction(async(ctx,request)=>{
  const key=process.env.SQUARE_WEBHOOK_SIGNATURE_KEY;
  const url=process.env.SQUARE_WEBHOOK_NOTIFICATION_URL;
  if(!key||!url)return new Response("Not configured",{status:503});
  const raw=await request.text();
  if(raw.length>100_000)return new Response("Payload too large",{status:413});
  const header=request.headers.get("x-square-hmacsha256-signature")||"";
  if(!header)return new Response("Missing signature",{status:403});
  const bytes=new TextEncoder();
  const secret=await crypto.subtle.importKey("raw",bytes.encode(key),{name:"HMAC",hash:"SHA-256"},false,["sign"]);
  const calculated=new Uint8Array(await crypto.subtle.sign("HMAC",secret,bytes.encode(url+raw)));
  // Timing-independent verification: cryptographic verify with the actual signature bytes.
  let supplied:Uint8Array;
  try{
    const binary=atob(header);
    supplied=Uint8Array.from(binary,c=>c.charCodeAt(0));
  }catch{return new Response("Invalid signature",{status:403});}
  if(supplied.length!==calculated.length)return new Response("Invalid signature",{status:403});
  const valid=await crypto.subtle.verify("HMAC",secret,supplied,bytes.encode(url+raw));
  if(!valid)return new Response("Invalid signature",{status:403});
  let payload:any;
  try{payload=JSON.parse(raw)}catch{return new Response("Invalid JSON",{status:400});}
  if(typeof payload.event_id!=="string")return new Response("Invalid event",{status:400});
  if(payload.type==="payment.created"||payload.type==="payment.updated"){
    const paymentId=payload.data?.object?.payment?.id;
    if(typeof paymentId==="string"&&paymentId.length<200){
      // Keep the webhook response fast; Square retries deliveries, and recording is idempotent.
      await ctx.scheduler.runAfter(0,internal.square.processPayment,{paymentId});
    }
  }
  return new Response("OK",{status:200});
})});
export default http;
