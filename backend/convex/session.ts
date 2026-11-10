import { query } from "./_generated/server";

// Safe authenticated account identity for manual, private admin enrollment.
// Reveals only the caller's token identifier; grants no permissions.
export const whoAmI = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return null;
    const admin = await ctx.db.query("admins")
      .withIndex("by_token", q => q.eq("tokenIdentifier", identity.tokenIdentifier))
      .unique();
    return {
      tokenIdentifier: identity.tokenIdentifier,
      authorized: !!admin?.active,
      role: admin?.active ? admin.role : null,
    };
  },
});
