import { v, ConvexError } from "convex/values";
import { query, mutation } from "./_generated/server";
import { requireAdmin } from "./access";

const category = v.union(
  v.literal("Ceramics"), v.literal("Social"),
  v.literal("Collaboration"), v.literal("Private event")
);
const status = v.union(v.literal("draft"), v.literal("published"), v.literal("sold_out"));
const eventFields = {
  title: v.string(),
  slug: v.string(),
  category,
  status,
  date: v.string(),
  time: v.string(),
  timezone: v.string(),
  duration: v.number(),
  venue: v.string(),
  priceCents: v.number(),
  capacity: v.number(),
  description: v.string(),
  imageStorageId: v.optional(v.id("_storage")),
  imageExternalUrl: v.optional(v.string()),
  checkoutUrl: v.optional(v.string()),
  squareVariationId: v.optional(v.string()),
  featured: v.boolean(),
  historical: v.optional(v.boolean()),
  ticketsSold: v.optional(v.number()),
  attendeesActual: v.optional(v.number()),
  actualRevenueCents: v.optional(v.number()),
  expensesCents: v.optional(v.number()),
  notes: v.string(),
};

function validateEvent(e: {
  title: string; slug: string; date: string; time: string;
  duration: number; priceCents: number; capacity: number;
  timezone: string; imageExternalUrl?: string; checkoutUrl?: string;
  historical?: boolean; ticketsSold?: number; attendeesActual?: number; actualRevenueCents?: number; expensesCents?: number;
}) {
  if (!e.title.trim() || e.title.length > 120) throw new ConvexError("Invalid title");
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(e.slug)) throw new ConvexError("Invalid slug");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(e.date)) throw new ConvexError("Invalid date");
  const date = new Date(e.date + "T12:00:00Z");
  if (Number.isNaN(date.valueOf()) || date.toISOString().slice(0, 10) !== e.date) {
    throw new ConvexError("Invalid calendar date");
  }
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(e.time)) throw new ConvexError("Invalid time");
  if (e.timezone !== "America/Chicago") throw new ConvexError("Unsupported timezone");
  if (!Number.isInteger(e.capacity) || e.capacity < 1 || e.capacity > 10000) throw new ConvexError("Invalid capacity");
  if (!Number.isInteger(e.priceCents) || e.priceCents < 0) throw new ConvexError("Invalid ticket price");
  if (!Number.isInteger(e.duration) || e.duration < 15 || e.duration > 1440) throw new ConvexError("Invalid duration");
  for(const n of [e.ticketsSold,e.attendeesActual,e.actualRevenueCents,e.expensesCents]){
    if(n !== undefined && (!Number.isSafeInteger(n) || n < 0))throw new ConvexError("Event financial values must be nonnegative whole numbers");
  }
  if(e.historical && e.checkoutUrl)throw new ConvexError("Historical events cannot use Square checkout");
  for (const url of [e.imageExternalUrl, e.checkoutUrl]) {
    if (url) {
      try { if (new URL(url).protocol !== "https:") throw Error(); }
      catch { throw new ConvexError("URLs must use HTTPS"); }
    }
  }
}

/** Only Square-hosted checkout URLs are allowed for public booking. */
function safeSquareCheckoutUrl(value: string | undefined) {
  if (!value) return null;
  try {
    const u = new URL(value);
    const host = u.hostname.toLowerCase();
    if (u.protocol !== "https:" || u.username || u.password) return null;
    if (host === "square.link" || host === "checkout.square.site") return u.href;
    return null;
  } catch {
    return null;
  }
}

async function publicEvent(ctx: { storage: { getUrl: (id: any) => Promise<string | null> } }, event: any) {
  return {
    _id: event._id,
    title: event.title,
    slug: event.slug,
    category: event.category,
    status: event.status,
    date: event.date,
    time: event.time,
    timezone: event.timezone,
    duration: event.duration,
    venue: event.venue,
    priceCents: event.priceCents,
    capacity: event.capacity,
    description: event.description,
    featured: event.featured,
    checkoutUrl: event.status === "published" ? safeSquareCheckoutUrl(event.checkoutUrl) : null,
    imageUrl: event.imageStorageId
      ? await ctx.storage.getUrl(event.imageStorageId)
      : event.imageExternalUrl ?? null,
    // Public checkout links are restricted to Square-hosted HTTPS domains.
    // Never return internal notes or backend storage identifiers.
  };
}

export const listPublic = query({
  args: {},
  handler: async (ctx) => {
    const published = await ctx.db.query("events")
      .withIndex("by_status_date", q => q.eq("status", "published")).collect();
    const soldOut = await ctx.db.query("events")
      .withIndex("by_status_date", q => q.eq("status", "sold_out")).collect();
    const all = [...published, ...soldOut].filter(e=>!e.historical).sort((a,b) => a.date.localeCompare(b.date));
    return await Promise.all(all.map(e => publicEvent(ctx, e)));
  },
});

export const getPublicBySlug = query({
  args: { slug: v.string() },
  handler: async (ctx, args) => {
    const event = await ctx.db.query("events")
      .withIndex("by_slug", q => q.eq("slug", args.slug)).unique();
    return event && event.status !== "draft" && !event.historical ? publicEvent(ctx, event) : null;
  },
});

/** Public seat count reflects verified Square payments recorded so far.
 * Square checkout must separately enforce inventory; this query does not reserve seats.
 */
export const availability = query({
  args: { slug: v.string() },
  handler: async (ctx,{slug}) => {
    const event=await ctx.db.query("events").withIndex("by_slug",q=>q.eq("slug",slug)).unique();
    if(!event||event.status==="draft"||event.historical)return null;
    const paid=await ctx.db.query("registrations").withIndex("by_event",q=>q.eq("eventId",event._id)).collect();
    const sold=paid.filter(r=>r.status==="paid").reduce((n,r)=>n+r.quantity,0);
    return {capacity:event.capacity,sold,remaining:Math.max(0,event.capacity-sold),status:event.status};
  }
});

export const listAdmin = query({
  args: {},
  handler: async (ctx) => {
    await requireAdmin(ctx);
    return await ctx.db.query("events").withIndex("by_date").collect();
  },
});

/** Admin-only event performance. Historical totals are manually recorded; Square totals
 * come from verified, non-refunded payment registrations, never the ticket-price estimate.
 */
export const performance = query({
  args:{},
  handler:async(ctx)=>{
    await requireAdmin(ctx);
    const entries=await ctx.db.query("events").collect();
    const rows=await Promise.all(entries.map(async(e)=>{
      const transactions=e.historical?[]:await ctx.db.query("registrations")
        .withIndex("by_event",q=>q.eq("eventId",e._id)).collect();
      const paid=transactions.filter(t=>t.status==="paid");
      const tickets=e.historical?(e.ticketsSold??0):paid.reduce((n,t)=>n+t.quantity,0);
      const revenueCents=e.historical?(e.actualRevenueCents??tickets*e.priceCents):
        paid.reduce((n,t)=>n+t.amountCents,0);
      const expensesCents=e.expensesCents??0;
      const attendees=e.historical?(e.attendeesActual??tickets):null;
      return {id:e._id,title:e.title,date:e.date,venue:e.venue,
        historical:!!e.historical,tickets,attendees,priceCents:e.priceCents,
        revenueCents,expensesCents,profitCents:revenueCents-expensesCents,
        hasFinancialData:!!e.historical||paid.length>0||expensesCents>0};
    }));
    return rows;
  }
});

export const upsert = mutation({
  args: { id: v.optional(v.id("events")), event: v.object(eventFields) },
  handler: async (ctx, { id, event }) => {
    await requireAdmin(ctx);
    validateEvent(event);
    if(event.historical){ event.featured=false; event.status="draft"; event.checkoutUrl=undefined; event.squareVariationId=undefined; }
    if (event.checkoutUrl && !safeSquareCheckoutUrl(event.checkoutUrl)) {
      throw new ConvexError("Use a Square payment link from square.link or checkout.square.site");
    }
    if (event.squareVariationId) {
      if (!event.checkoutUrl) throw new ConvexError("A Square item mapping requires a checkout link");
      const mapped = await ctx.db.query("events")
        .withIndex("by_square_variation", q => q.eq("squareVariationId", event.squareVariationId!)).unique();
      if (mapped && mapped._id !== id) throw new ConvexError("Square ticket already linked to another event");
    }
    const existing = await ctx.db.query("events")
      .withIndex("by_slug", q => q.eq("slug", event.slug)).unique();
    if (existing && existing._id !== id) throw new ConvexError("Slug already used");
    if (id) {
      const old = await ctx.db.get(id);
      if (!old) throw new ConvexError("Event not found");
      if(event.historical && !old.historical){
        const payment=await ctx.db.query("registrations").withIndex("by_event",q=>q.eq("eventId",id)).first();
        if(payment)throw new ConvexError("This event has Square payment history and cannot be converted to manual historical tracking.");
      }
      await ctx.db.patch(id, {
        ...event,
        // Deleting or changing the link invalidates the prior mapping.
        squareVariationId: event.checkoutUrl === old.checkoutUrl
          ? event.squareVariationId
          : event.squareVariationId || undefined,
        updatedAt: Date.now()
      });
      return id;
    }
    return await ctx.db.insert("events", { ...event, updatedAt: Date.now() });
  },
});

export const remove = mutation({
  args: { id: v.id("events") },
  handler: async (ctx, { id }) => {
    const admin = await requireAdmin(ctx);
    if (admin.role !== "owner") throw new ConvexError("Owner permission required");
    const event = await ctx.db.get(id);
    if (!event) throw new ConvexError("Event not found");
    const booked = await ctx.db.query("registrations").withIndex("by_event", q => q.eq("eventId", id)).first();
    if (booked) throw new ConvexError("This event has payment records and cannot be deleted. Keep it for booking history.");
    // Do not delete stored images automatically: they may be referenced by other records.
    await ctx.db.delete(id);
  },
});
