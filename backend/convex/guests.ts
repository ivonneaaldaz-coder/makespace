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
    const clean=name.trim().replace(/\s+/g," ");
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

const hashValidator=v.string();
const validHash=(value:string)=>/^[a-f0-9]{64}$/.test(value);

// Admin issues or revokes an unguessable per-booking link. A new link invalidates the old one.
export const setGuestLink=mutation({
  args:{registrationId:v.id("registrations"),hash:v.optional(hashValidator)},
  handler:async(ctx,{registrationId,hash})=>{
    await requireAdmin(ctx);
    const r=await ctx.db.get(registrationId);
    if(!r||r.status!=="paid")throw Error("Paid booking required");
    if(hash!==undefined&&!validHash(hash))throw Error("Invalid guest link token");
    if(hash){
      const other=await ctx.db.query("registrations").withIndex("by_guest_link",q=>q.eq("guestLinkHash",hash)).unique();
      if(other&&other._id!==registrationId)throw Error("Duplicate registration link");
    }
    await ctx.db.patch(registrationId,{guestLinkHash:hash});
  }
});

// Public access is capability-based: possessing a 256-bit random token is required.
// Neither the purchaser email nor their payment details are returned to guests.
export const guestForm=query({
  args:{hash:hashValidator},
  handler:async(ctx,{hash})=>{
    if(!validHash(hash))return null;
    const r=await ctx.db.query("registrations")
      .withIndex("by_guest_link",q=>q.eq("guestLinkHash",hash)).unique();
    if(!r||r.status!=="paid")return null;
    const event=await ctx.db.get(r.eventId);
    if(!event)return null;
    const entries=await ctx.db.query("bookingGuests")
      .withIndex("by_registration",q=>q.eq("registrationId",r._id)).collect();
    const bySeat=new Map(entries.map(x=>[x.seatNumber,x]));
    return {
      eventTitle:event.title,eventDate:event.date,eventTime:event.time,
      quantity:r.quantity,
      seats:Array.from({length:r.quantity},(_,index)=>({
        seatNumber:index+1,name:bySeat.get(index+1)?.name||""
      }))
    };
  }
});

// Updating names here cannot alter the purchased ticket count or check-in status.
export const submitGuestNames=mutation({
  args:{hash:hashValidator,names:v.array(v.string())},
  handler:async(ctx,{hash,names})=>{
    if(!validHash(hash))throw Error("Link invalid");
    const r=await ctx.db.query("registrations")
      .withIndex("by_guest_link",q=>q.eq("guestLinkHash",hash)).unique();
    if(!r||r.status!=="paid")throw Error("Link expired or invalid");
    if(names.length!==r.quantity||r.quantity>100)throw Error("Names must match paid seats");
    const clean=names.map(x=>x.trim().replace(/\s+/g," "));
    if(clean.some(x=>!x||x.length>100))throw Error("Please enter each guest's first and last name");
    for(let index=0;index<clean.length;index++){
      const seatNumber=index+1;
      const existing=await ctx.db.query("bookingGuests")
        .withIndex("by_registration_seat",q=>q.eq("registrationId",r._id).eq("seatNumber",seatNumber)).unique();
      if(existing)await ctx.db.patch(existing._id,{name:clean[index],updatedAt:Date.now()});
      else await ctx.db.insert("bookingGuests",{
        registrationId:r._id,seatNumber,name:clean[index],updatedAt:Date.now()
      });
    }
    return {saved:clean.length};
  }
});
