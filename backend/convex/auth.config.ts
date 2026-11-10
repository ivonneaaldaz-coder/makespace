import type { AuthConfig } from "convex/server";

// In Convex Dashboard → Settings → Environment Variables, configure
// CLERK_FRONTEND_API_URL with the URL shown in Clerk's Convex integration.
// This value is not a secret; the backend validates the JWT's issuer.
export default {
  providers: [
    {
      domain: process.env.CLERK_FRONTEND_API_URL!,
      applicationID: "convex",
    },
  ],
} satisfies AuthConfig;
