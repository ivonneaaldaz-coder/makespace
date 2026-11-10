# MAKE SPACE — Convex backend source (not yet connected)

This folder contains the **first integration milestone** for the existing static MAKE SPACE site. It adds an event schema, public read functions, protected admin mutations, and photo-upload functions, but it is not yet a live backend.

## State

- The public website is still deployed independently as static HTML.
- The `/admin/` page is currently a browser-only prototype and **must not be treated as a secure admin panel**.
- **No Convex deployment, authentication provider, live uploads, or Square payment processing has been connected.**
- Never expose the server-side secrets or a Convex deploy key in frontend code.
- The `published` and `sold_out` status values are placeholders until staff authentication and real public event pages are wired.
- Public queries intentionally omit admin-only notes and checkout links.

## Setup prerequisites

1. Bootstrap a dedicated Convex application in the team's actual account (do not use an anonymous throwaway deployment).
2. Choose and configure a supported auth provider and secure the `/admin/` route.
3. Configure the backend in this folder using the official Convex CLI so `convex/_generated/` types are generated. The source files here are designed to live inside the scaffold's `convex/` directory.
4. Enroll only authorized admins (Ivonne and Alicia) via a *private dashboard operation* into the `admins` table, using verified token identifiers. Never expose a public self-enrollment mutation.
5. Migrate the frontend to a client that can call Convex securely; port the existing admin UX and event calendar instead of discarding the current design.
6. Seed proposed events as **drafts** only. Do not publish pricing, dates, or checkout URLs until confirmed.
7. Upload and store images; validate size and MIME type on the upload path; add appropriate garbage collection for orphaned files.
8. Configure Square checkout and verify signed payment webhooks before enabling paid registration or live seat-count updates.
9. Set up newsletter and private-inquiry delivery; verify contact address and email ownership.
10. Connect the purchased domain after DNS ownership is confirmed and complete mobile/checkout QA.

## Operational requirements

- Only designated admins may create, modify, or delete event records.
- Owners can delete; editors can create and update.
- Event entries are stored in San Antonio local time (`America/Chicago`).
- Authentication is enforced **by Convex functions**, not merely by hiding an admin page.
- Keep capacity and registration-count separate; capacity alone is not availability.
- Do not let the initial static page's localStorage demo overwrite production events.

References: https://docs.convex.dev/auth/overview and https://docs.convex.dev/file-storage/upload-files
