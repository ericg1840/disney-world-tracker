# Disney World Trip Tracker 🏰

A family-focused Disney World trip planner for organizing park days, attractions, restaurants, shows, weather, resort details, packing, and a smarter family itinerary.

## Current features

- Trip dates and day planning
- Disney World park selection and park hopping
- Attractions, restaurants, and shows
- Ride height requirements
- Family profiles with height-aware ride guidance
- Live wait times/showtimes where available
- Smart trip dashboard and timeline
- Automatic day-planner suggestions
- Weather forecast
- Resort and reservation information
- Packing list
- Local browser storage with optional Supabase cloud sync
- Synced family/packing metadata migration
- Optional Supabase Auth magic-link account sync
- PWA manifest and offline app-shell caching
- Mobile-friendly responsive UI

## Tech stack

- HTML
- CSS
- Vanilla JavaScript
- Supabase
- Open-Meteo weather API
- ThemeParks Wiki API

## Supabase setup

The existing `supabase-setup.sql` supports the original share-code workflow.

For the enhanced family/packing sync, run:

```text
supabase-metadata.sql
```

For secure account-based cloud sync, also run:

```text
supabase-auth.sql
```

Then configure the Supabase project URL and publishable/anon key through the existing Cloud Sync setup. The browser must only ever use a publishable/anon key; never place a service-role or secret key in the app.

The account sync uses Supabase Auth magic links and stores the authenticated user's trip in `public.user_trips`, protected by RLS.

## Architecture direction

The application is intentionally being improved incrementally rather than rewritten. The original trip data model remains compatible while new modules provide:

- `family.js` — family profiles and heights
- `enhancements.js` — smart dashboard, timeline and family-fit guidance
- `metadata-sync.js` — family/packing cloud metadata
- `auth.js` — optional authenticated cloud sync
- `planner.js` — automatic itinerary suggestions

The large legacy `app.js` remains the source of truth for existing trip behavior while these modules are gradually extracting responsibilities.

## Roadmap

1. Finish migrating users from share-code sync to authenticated accounts
2. Add member invitations/read-only sharing
3. Split `app.js` into data/state/UI/API modules
4. Add offline mutation queue and conflict detection
5. Add richer mobile navigation and install polish
6. Add automated JavaScript/HTML validation and CI

## Security

The legacy share-code system is retained for backward compatibility. It should be considered a migration path, not the final authorization model.

The authenticated path uses `auth.uid()` + RLS so users can only access their own `user_trips` row.

Never put a Supabase service-role or secret key in browser code.
