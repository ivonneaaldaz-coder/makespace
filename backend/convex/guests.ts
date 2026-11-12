import { query, mutation } from "./_generated/server";
import { v } from "convex/values";
import { requireAdmin } from "./access";

// Every guest seat belongs to a Square-verified paid registration.
// A seat is never created from a browser-provided payment identifier.
export const listForEvent = query({
  args: { eventId: v.id("events") },
  handler: async (ctx,{eventId})=>{
    await requireAdmin(ctx);
    const event=await ctx.db.get(eventId);
    if(!event)throw Error("Event not found");
    const bookings=await ctx.db.query("registrations")
      .withIndex("by_event",q=>q.eq("eventId",eventId)).collect();
    const rows=await Promise.all(bookings.map(async booking=>{
      const stored=await ctx.db.query("bookingGuests")
        .withIndex("by_registration",q=>q.eq("registrationId",booking._id)).collect();
      const map=new Map(stored.map(guest=>[guest.seatNumber,guest]));
      const seats=Array.from({length:booking.quantity},(_,i)=>{
        const n=i+1,guest=map.get(n);
        return {seatNumber:n,name:guest?.name||"",checkedInAt:guest?.checkedInAt??null};
      });
      return {
        registrationId:booking._id,
        buyerName:booking.buyerName||"",
        buyerEmail:booking.buyerEmail||"",
        quantity:booking.quantity,
        amountCents:booking.amountCents,
        status:booking.status,
        squarePaymentId:booking.squarePaymentId,
        createdAt:booking.createdAt,
        confirmationStatus:booking.confirmationStatus,
        seats
      };
    }));
    const active=rows.filter(r=>r.status==="paid");
    return {eventTitle:event.title,capacity:event.capacity,bookings:rows,
      paidSeats:active.reduce((acc,row)=>acc+row.quantity,0),
      identified:active.reduce((acc,row)=>acc+row.seats.filter(seat=>seat.name.trim()).length,0),
      checkedIn:active.reduce((acc,row)=>acc+row.seats.filter(seat=>seat.checkedInAt).length,0)};
  }
});

export const saveGuest = mutation({
  args:{
    registrationId:v.id("registrations"),
    seatNumber:v.number(),
    name:v.string()
  },
  handler:async(ctx,{registrationId,seatNumber,name})=>{
    await requireAdmin(ctx);
    const registration=await ctx.db.get(registrationId);
    if(!registration||registration.status!=="paid")throw Error("Active paid booking required");
    if(!Number.isInteger(seatNumber)||seatNumber<1||seatNumber>registration.quantity)
      throw Error("Invalid seat number");
    const clean=name.trim().replace(/\\s+/g," ");
    if(clean.length>100)throw Error("Name too long");
    const previous=await ctx.db.query("bookingGuests")
      .withIndex("by_registration_seat",q=>q.eq("registrationId",registrationId).eq("seatNumber",seatNumber)).unique();
    if(previous){
      await ctx.db.patch(previous._id,{name:clean,updatedAt:Date.now()});
      return;
    }
    if(!clean)return;
    await ctx.db.insert("bookingGuests",{registrationId,seatNumber,name:clean,updatedAt:Date.now()});
  }
});

export const setCheckIn = mutation({
  args:{
    registrationId:v.id("registrations"),
    seatNumber:v.number(),
    checkedIn:v.boolean()
  },
  handler:async(ctx,{registrationId,seatNumber,checkedIn})=>{
    await requireAdmin(ctx);
    const registration=await ctx.db.get(registrationId);
    if(!registration||registration.status!=="paid")throw Error("Active paid booking required");
    if(!Number.isInteger(seatNumber)||seatNumber<1||seatNumber>registration.quantity)
      throw Error("Invalid seat number");
    const previous=await ctx.db.query("bookingGuests")
      .withIndex("by_registration_seat",q=>q.eq("registrationId",registrationId).eq("seatNumber",seatNumber)).unique();
    if(previous){
      await ctx.db.patch(previous._id,{checkedInAt:checkedIn?Date.now():undefined,updatedAt:Date.now()});
      return;
    }
    await ctx.db.insert("bookingGuests",{registrationId,seatNumber,
      checkedInAt:checkedIn?Date.now():undefined,updatedAt:Date.now()});
  }
});
