# MAKE SPACE

Creative workshops, gatherings, and hands-on experiences in San Antonio, Texas.

## Site

This repository contains the current **editorial concept prototype**, exported from the Vercel MAKE SPACE preview in November 2026.

- `/` — homepage
- `/calendar/` — 2027 event concept calendar
- `/events/clay-intention/` — sample event detail and registration UI
- `/events/vision-board-social/` — sample event detail and registration UI

## Deployments

Static HTML, CSS and vanilla JavaScript; no build command or package dependencies. Connect this repository to Vercel with Framework Preset **Other**, and use the repository root as the output directory. Changes to the production branch then deploy automatically.

## Current limitations

**Not live ticketing.** Square payment checkout is not connected; pricing, locations, and 2027 event dates are proposals. The event registration buttons intentionally do not accept payments. The homepage email field is demo-only and does not store addresses. Photography currently uses external stock placeholder URLs; replace with original MAKE SPACE media before launch.

## Planned next phase

Build a protected `/admin` Studio Manager with Convex for persistent event editing, staff authentication, media storage, and publication status. Add Square Checkout and signed webhook handling before enabling tickets or claiming live availability.
