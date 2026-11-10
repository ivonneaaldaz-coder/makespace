import { QueryCtx, MutationCtx } from "./_generated/server";
import { ConvexError } from "convex/values";

export async function requireAdmin(ctx: QueryCtx | MutationCtx) {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) throw new ConvexError("Sign in required");
  const admin = await ctx.db
    .query("admins")
    .withIndex("by_token", (q) => q.eq("tokenIdentifier", identity.tokenIdentifier))
    .unique();
  if (!admin || !admin.active) throw new ConvexError("Not authorized");
  return admin;
}
