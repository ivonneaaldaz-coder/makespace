import { internalAction } from "./_generated/server";
import { internal } from "./_generated/api";
import { v } from "convex/values";

// Both emails require a verified sender domain and a Resend API key.
// Guests and MAKE SPACE staff receive separate messages with separate idempotency keys.
const escapeHtml=(value:string)=>String(value).replace(/[&<>"']/g,ch=>({
  "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"
} as Record<string,string>)[ch]);

function formatDate(day:string){
  const date=new Date(day+"T12:00:00Z");
  return Number.isNaN(date.getTime())?day:
    new Intl.DateTimeFormat("en-US",{timeZone:"UTC",weekday:"long",month:"long",day:"numeric",year:"numeric"}).format(date);
}
function formatTime(time:string){
  const [hour,minute]=time.split(":").map(Number);
  if(!Number.isInteger(hour)||!Number.isInteger(minute))return time;
  const h=(hour%12)||12;
  return h+":" + String(minute).padStart(2,"0") + " "+(hour>=12?"PM":"AM")+" CT";
}
function shell(kicker:string,title:string,intro:string,rows:Array<[string,string]>,closing:string){
  const cells=rows.map(([label,value])=>
    '<tr><td style="padding:13px 8px 13px 0;border-bottom:1px solid #e4d5d1;color:#76545c;font:12px Arial,sans-serif;vertical-align:top;min-width:90px">'+escapeHtml(label)+'</td>'+
    '<td style="padding:13px 0;border-bottom:1px solid #e4d5d1;color:#501923;font:15px Georgia,serif;vertical-align:top">'+escapeHtml(value)+'</td></tr>').join("");
  return '<!doctype html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>'+
    '<body style="margin:0;padding:0;background:#f5eee4;color:#501923">'+
    '<div style="display:none;max-height:0;overflow:hidden;color:transparent">'+escapeHtml(intro)+'</div>'+
    '<table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="background:#f5eee4"><tr><td align="center" style="padding:36px 16px">'+
    '<table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="max-width:560px;background:#fffaf5">'+
    '<tr><td style="background:#501923;padding:33px 36px 28px"><a href="https://makespace-amber.vercel.app/" style="text-decoration:none;color:#f5eee4;font:bold 24px Arial,sans-serif;letter-spacing:-1px">make<br>SPACE</a></td></tr>'+
    '<tr><td style="padding:42px 36px 40px">'+
    '<p style="font:700 10px Arial,sans-serif;letter-spacing:2px;text-transform:uppercase;color:#875f69;margin:0 0 14px">'+escapeHtml(kicker)+'</p>'+
    '<h1 style="font:normal 45px/1.05 Georgia,serif;letter-spacing:-1px;margin:0 0 22px;color:#501923">'+escapeHtml(title)+'</h1>'+
    '<p style="font:16px/1.65 Georgia,serif;margin:0 0 25px;color:#493238">'+escapeHtml(intro)+'</p>'+
    '<table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="border-top:1px solid #e4d5d1">'+cells+'</table>'+
    '<p style="font:15px/1.65 Georgia,serif;color:#493238;margin:27px 0 0">'+escapeHtml(closing)+'</p>'+
    '</td></tr><tr><td style="border-top:1px solid #e4d5d1;padding:23px 36px 28px;font:11px/1.6 Arial,sans-serif;color:#806269">'+
    'MAKE SPACE · A Creative Social Club · San Antonio, Texas<br>'+
    '<a href="https://makespace-amber.vercel.app/" style="color:#501923;text-decoration:underline">Visit MAKE SPACE</a></td></tr></table>'+
    '</td></tr></table></body></html>';
}

async function sendEmail(to:string,subject:string,text:string,html:string,idempotencyKey:string){
  const key=process.env.RESEND_API_KEY;
  const sender=process.env.MAKE_SPACE_FROM_EMAIL;
  if(!key||!sender)return "not_configured" as const;
  const response=await fetch("https://api.resend.com/emails",{
    method:"POST",
    headers:{
      Authorization:"Bearer "+key,
      "Content-Type":"application/json",
      "Idempotency-Key":idempotencyKey
    },
    body:JSON.stringify({from:sender,to:[to],subject,text,html})
  });
  if(!response.ok){
    console.error("MAKE SPACE email provider request failed",response.status);
    return "failed" as const;
  }
  return "sent" as const;
}

// Sent only after a Square payment is independently confirmed COMPLETED.
export const send=internalAction({
  args:{registrationId:v.id("registrations")},
  handler:async(ctx,{registrationId})=>{
    const result=await ctx.runQuery(internal.square.registrationForEmail,{id:registrationId});
    if(!result||result.registration.status!=="paid")return;
    const {registration:r,event:e}=result;
    if(r.confirmationStatus==="sent")return;
    if(!r.buyerEmail){
      await ctx.runMutation(internal.square.setConfirmation,{id:registrationId,status:"no_email"});
      return;
    }
    const rows:Array<[string,string]>=[
      ["Experience",e.title],
      ["Date",formatDate(e.date)],
      ["Time",formatTime(e.time)],
      ["Location",e.venue||"Venue details to follow"],
      ["Reserved seats",String(r.quantity)],
      ["Total paid","$"+(r.amountCents/100).toFixed(2)+" "+r.currency],
      ["Payment reference",r.squarePaymentId]
    ];
    const intro="Your spot is confirmed. We're so happy you're making space for something creative with us.";
    const closing="We'll share any additional event details before we gather. Questions? Reply to your Square receipt or reach out to MAKE SPACE.";
    const plain=["MAKE SPACE — YOU'RE ON THE LIST","",intro,"",
      ...rows.map(([k,value])=>k+": "+value),"",closing,"","MAKE SPACE · San Antonio, Texas"].join("\n");
    const resultEmail=await sendEmail(
      r.buyerEmail,"You're on the list — "+e.title,
      plain,shell("YOUR BOOKING IS CONFIRMED","You're on the list.",intro,rows,closing),
      "make-space-guest-"+r.squarePaymentId
    );
    if(resultEmail!=="not_configured"){
      await ctx.runMutation(internal.square.setConfirmation,{
        id:registrationId,status:resultEmail==="sent"?"sent":"failed"
      });
    }
  }
});

// Separate notification to the MAKE SPACE operations inbox, not the guest.
export const notifyOwner=internalAction({
  args:{registrationId:v.id("registrations")},
  handler:async(ctx,{registrationId})=>{
    const result=await ctx.runQuery(internal.square.registrationForEmail,{id:registrationId});
    if(!result||result.registration.status!=="paid")return;
    const {registration:r,event:e}=result;
    if(r.ownerNotificationStatus==="sent")return;
    const to=process.env.MAKE_SPACE_BOOKING_NOTIFY_EMAIL||"makespacesatx@gmail.com";
    const rows:Array<[string,string]>=[
      ["Experience",e.title],["Date",formatDate(e.date)],
      ["Buyer",r.buyerName||"Name not provided by Square"],
      ["Email",r.buyerEmail||"Email not provided by Square"],
      ["Tickets",String(r.quantity)],
      ["Paid","$"+(r.amountCents/100).toFixed(2)+" "+r.currency],
      ["Square payment",r.squarePaymentId],
      ["Guest confirmation",r.buyerEmail?"Queued separately":"Unavailable — no guest email"]
    ];
    const intro="A payment has been completed for a MAKE SPACE experience.";
    const closing="View the event in Studio Manager for the latest recorded attendee totals. Square remains the source of truth for transactions and capacity.";
    const plain=["MAKE SPACE — NEW BOOKING","",intro,"",
      ...rows.map(([k,value])=>k+": "+value),"",closing].join("\n");
    const outcome=await sendEmail(
      to,"New booking · "+e.title+" · "+r.quantity+" seat"+(r.quantity===1?"":"s"),
      plain,shell("NEW BOOKING","Someone made space.",intro,rows,closing),
      "make-space-owner-"+r.squarePaymentId
    );
    if(outcome!=="not_configured"){
      await ctx.runMutation(internal.square.setOwnerNotification,{
        id:registrationId,status:outcome==="sent"?"sent":"failed"
      });
    }
  }
});
