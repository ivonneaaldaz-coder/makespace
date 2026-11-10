import type { AuthConfig } from "convex/server";

// Set CLERK_JWT_ISSUER_DOMAIN on the Convex development deployment
// before deploying this file. Use Clerk's Convex integration Frontend API URL.
export default {
  providers: [
    {
      domain: process.env.CLERK_JWT_ISSUER_DOMAIN!,
      applicationID: "convex",
    },
  ],
} satisfies AuthConfig;
