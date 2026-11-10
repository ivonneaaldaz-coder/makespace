import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  // Enrollment is performed privately through the Convex dashboard.
  // Never offer a public "make me admin" mutation.
  admins: defineTable({
    tokenIdentifier: v.string(),
    displayName: v.string(),
    role: v.union(v.literal("owner"), v.literal("editor")),
    active: v.boolean(),
  }).index("by_token", ["tokenIdentifier"]),

  events: defineTable({
    title: v.string(),
    slug: v.string(),
    category: v.union(
      v.literal("Ceramics"), v.literal("Social"),
      v.literal("Collaboration"), v.literal("Private event")
    ),
    status: v.union(
      v.literal("draft"), v.literal("published"), v.literal("sold_out")
    ),
    date: v.string(), // ISO local calendar date, YYYY-MM-DD
    time: v.string(), // local 24h time, HH:MM
    timezone: v.string(), // America/Chicago
    duration: v.number(), // minutes
    venue: v.string(),
    priceCents: v.number(),
    capacity: v.number(),
    description: v.string(),
    imageStorageId: v.optional(v.id("_storage")),
    imageExternalUrl: v.optional(v.string()),
    checkoutUrl: v.optional(v.string()),
    featured: v.boolean(),
    notes: v.string(), // admin-only; NEVER return from public queries
    updatedAt: v.number(),
  })
    .index("by_status_date", ["status", "date"])
    .index("by_slug", ["slug"])
    .index("by_date", ["date"]),
});
