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
    squareVariationId: v.optional(v.string()),
    featured: v.boolean(),
    notes: v.string(), // admin-only; NEVER return from public queries
    updatedAt: v.number(),
  })
    .index("by_status_date", ["status", "date"])
    .index("by_slug", ["slug"])
    .index("by_date", ["date"])
    .index("by_square_variation", ["squareVariationId"]),
  registrations: defineTable({
    eventId: v.id("events"),
    squarePaymentId: v.string(),
    squareOrderId: v.string(),
    buyerEmail: v.optional(v.string()),
    buyerName: v.optional(v.string()),
    quantity: v.number(),
    amountCents: v.number(),
    currency: v.string(),
    status: v.union(v.literal("paid"), v.literal("refunded")),
    confirmationStatus: v.union(v.literal("pending"), v.literal("sent"), v.literal("no_email"), v.literal("failed")),
    confirmationSentAt: v.optional(v.number()),
    ownerNotificationStatus: v.optional(v.union(v.literal("pending"),v.literal("sent"),v.literal("failed"))),
    ownerNotificationSentAt: v.optional(v.number()),
    createdAt: v.number(),
  }).index("by_payment", ["squarePaymentId"]).index("by_event", ["eventId"]),
  squareWebhooks: defineTable({
    eventId: v.string(),
    type: v.string(),
    receivedAt: v.number(),
  }).index("by_event", ["eventId"]),
});
