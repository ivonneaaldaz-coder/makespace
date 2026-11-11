# MAKE SPACE — Square attendee automation (development)

## Current state
The code is deployed to Convex development. **Payment syncing and custom confirmation emails are OFF until the following secrets are configured and the webhook is tested.** Do not paste keys into ChatGPT, GitHub files, or browser JavaScript.

The public checkout button already takes guests to Square. Square handles card information and ticket capacity. The new Convex functions only count a payment as an attendee after verifying it is COMPLETED using Square's Payments API and retrieving its order.

## Browser-only configuration

1. Go to https://developer.squareup.com/apps and create a MAKE SPACE application in the **same Square seller account that owns the payment links**.
2. Under **Credentials**, obtain a production Access Token for this application's production environment (never paste the token in chat).
3. Open Convex development environment variables:
   https://dashboard.convex.dev/t/ivonne-aldaz/makespace/deafening-clam-741
   Settings → Environment Variables.
4. Add:

   - `SQUARE_ACCESS_TOKEN`: your Square application **production** access token.
   - `SQUARE_ENVIRONMENT`: `production`.
   - `SQUARE_WEBHOOK_NOTIFICATION_URL`: `https://deafening-clam-741.convex.site/square/webhook`.

5. In the Square Developer Console → **Webhooks → Subscriptions → Production**, add a subscription using exactly this notification URL:
   `https://deafening-clam-741.convex.site/square/webhook`
   Select `payment.created` and `payment.updated`. The endpoint must use the production environment because the existing Square payment links are production links. Square's **Sandbox** is recommended for simulated card testing but its resources are entirely separate; a sandbox token will not recognize production payment links.
6. Copy the subscription's **Signature Key** into the Convex environment variable `SQUARE_WEBHOOK_SIGNATURE_KEY`. This is **not** the Square Access Token or your Square application secret. Don't share it.
7. In Studio Manager, open an existing event, paste its Square payment link, click **Verify with Square**, then **Save to Cloud**. This action validates that exactly one Square catalog item variation backs the link. Use a unique item/variation for each event.
8. Open the event again and select **Attendees**. This page lists paid registrations. It remains empty until verified payment webhooks are delivered.

## Critical limitations for v1
- Square itself should enforce event capacity. Convex's displayed `seatsRemaining` is based only on successful webhook sync; if Square webhooks are missed, it can temporarily differ from Square inventory.
- Checkout completion redirects are not proof of payment. A payment must be `COMPLETED`.
- For now an order must contain **exactly one catalog line item variation**, which matches one event. Mixed-cart purchases are deliberately ignored rather than attributed to the wrong workshop.
- Refunds, partial refunds, disputes, and cancellations do **not yet** update Convex; use Square as the source of truth and reconcile attendee counts before the first live event.
- The UI doesn't automatically create or send tickets; Square remains responsible for receipts.
- Real payment testing must not happen until you've verified subscription, API token, checkout URL, mapping and merchant account.
- The system cannot recover old paid purchases before the webhook was enabled. A backfill/reconciliation feature is still needed.
- The webhook's signature key and notification URL must match the configured Square subscription exactly; unsigned webhook calls are rejected.
- If a Square API call fails during processing, the scheduled action fails and an admin needs to reconcile it; automatic job retry and Square missed-event replay are pending.

## Custom confirmation emails (Resend)
A MAKE SPACE confirmation email is sent after a verified COMPLETED payment **only if** you configure both:
- `RESEND_API_KEY`: from https://resend.com/api-keys
- `MAKE_SPACE_FROM_EMAIL`: e.g. `MAKE SPACE <events@makespace.social>` **only after verifying ownership of makespace.social with Resend**.

When those variables are absent, the email action does not send anything. Registrations stay in `pending` confirmation state and must be followed up in Square. When the buyer's email isn't provided by Square, status is `no_email` and no message is sent. `sent` means the email provider accepted the request, not that it was delivered.

Before enabling email, verify the actual purchased domain, DNS records, and sending address. Do not invent a sending email address.

## Developer verification
In the GitHub repo, edit backend code and inspect GitHub Actions `Deploy MAKE SPACE Convex (development)`; it auto-deploys on `backend/**`. Check Convex Functions and Logs for any failed webhook actions. No Terminal is needed.

Docs:
- https://developer.squareup.com/docs/webhooks/overview
- https://developer.squareup.com/docs/webhooks/step3validate
- https://developer.squareup.com/reference/square/checkout-api/ListPaymentLinks
- https://developer.squareup.com/reference/square/orders-api/retrieve-order
- https://docs.convex.dev/functions/http-actions
