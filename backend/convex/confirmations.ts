import { internalAction } from "./_generated/server";
import { internal } from "./_generated/api";
import { v } from "convex/values";

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
    const key=process.env.RESEND_API_KEY;
    const sender=process.env.MAKE_SPACE_FROM_EMAIL;
    // Disabled until email sender domain is verified; do not forge an address.
    if(!key||!sender)return;
    const date=e.date;
    const body=[
      "You're on the list!",
      "",
      "Thanks for joining MAKE SPACE.",
      "Experience: "+e.title,
      "Date: "+date,
      "Time: "+e.time+" (Central Time)",
      "Venue: "+(e.venue||"Details to follow"),
      "Seats reserved: "+r.quantity,
      "Square payment reference: "+r.squarePaymentId,
      "",
      "We're looking forward to making something with you.",
      "MAKE SPACE"
    ].join("\n");
    const response=await fetch("https://api.resend.com/emails",{
      method:"POST",headers:{Authorization:"Bearer "+key,"Content-Type":"application/json","Idempotency-Key":"make-space-"+r.squarePaymentId},
      body:JSON.stringify({
        from:sender,to:[r.buyerEmail],subject:"You're on the list — "+e.title,text:body,
        headers:{"Idempotency-Key":"make-space-"+r.squarePaymentId}
      })
    });
    if(!response.ok){
      console.error("Confirmation email failed",response.status);
      await ctx.runMutation(internal.square.setConfirmation,{id:registrationId,status:"failed"});
      return;
    }
    await ctx.runMutation(internal.square.setConfirmation,{id:registrationId,status:"sent"});
  }
});
