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
  featured: v.boolean(),
  notes: v.string(),
};

function validateEvent(e: {
  title: string; slug: string; date: string; time: string;
  duration: number; priceCents: number; capacity: number;
  timezone: string; imageExternalUrl?: string; checkoutUrl?: string;
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
  for (const url of [e.imageExternalUrl, e.checkoutUrl]) {
    if (url) {
      try { if (new URL(url).protocol !== "https:") throw Error(); }
      catch { throw new ConvexError("URLs must use HTTPS"); }
    }
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
    imageUrl: event.imageStorageId
      ? await ctx.storage.getUrl(event.imageStorageId)
      : event.imageExternalUrl ?? null,
    // NEVER return checkout URL until verified against Square configuration.
    // NEVER return internal notes or backend storage identifiers.
  };
}

export const listPublic = query({
  args: {},
  handler: async (ctx) => {
    const published = await ctx.db.query("events")
      .withIndex("by_status_date", q => q.eq("status", "published")).collect();
    const soldOut = await ctx.db.query("events")
      .withIndex("by_status_date", q => q.eq("status", "sold_out")).collect();
    const all = [...published, ...soldOut].sort((a,b) => a.date.localeCompare(b.date));
    return await Promise.all(all.map(e => publicEvent(ctx, e)));
  },
});

export const getPublicBySlug = query({
  args: { slug: v.string() },
  handler: async (ctx, args) => {
    const event = await ctx.db.query("events")
      .withIndex("by_slug", q => q.eq("slug", args.slug)).unique();
    return event && event.status !== "draft" ? publicEvent(ctx, event) : null;
  },
});

export const listAdmin = query({
  args: {},
  handler: async (ctx) => {
    await requireAdmin(ctx);
    return await ctx.db.query("events").withIndex("by_date").collect();
  },
});

export const upsert = mutation({
  args: { id: v.optional(v.id("events")), event: v.object(eventFields) },
  handler: async (ctx, { id, event }) => {
    await requireAdmin(ctx);
    validateEvent(event);
    const existing = await ctx.db.query("events")
      .withIndex("by_slug", q => q.eq("slug", event.slug)).unique();
    if (existing && existing._id !== id) throw new ConvexError("Slug already used");
    if (id) {
      const old = await ctx.db.get(id);
      if (!old) throw new ConvexError("Event not found");
      await ctx.db.patch(id, { ...event, updatedAt: Date.now() });
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
    // Do not delete stored images automatically: they may be referenced by other records.
    await ctx.db.delete(id);
  },
});
