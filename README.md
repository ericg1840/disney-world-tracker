# Disney World Trip Tracker 🏰

A family-focused Disney World trip planner for organizing park days, attractions, restaurants, shows, weather, resort details, and packing.

## Current features

- Trip dates and day planning
- Disney World park selection and park hopping
- Attractions, restaurants, and shows
- Height requirements
- Live wait times/showtimes where available
- Daily itinerary view
- Weather forecast
- Resort and reservation information
- Packing list
- Local browser storage with optional Supabase cloud sync
- Mobile-friendly responsive UI

## Tech stack

- HTML
- CSS
- Vanilla JavaScript
- Supabase
- Open-Meteo weather API

## Development roadmap

The project is being improved incrementally rather than rewritten. Planned work includes:

1. Safer account-based cloud sync and better sync status/error handling
2. Modularize the large `app.js` file
3. Sync the packing list across devices
4. Add family profiles and height-aware ride recommendations
5. Build a richer daily timeline and automatic itinerary builder
6. Improve mobile navigation and add PWA/offline support
7. Add automated tests and CI validation

## Security note

The current cloud-sync implementation uses a share-code model. It is suitable for the current personal-use workflow but is intentionally being replaced with authenticated, member-based access before the app is treated as a broader family-sharing application.

Never put a Supabase service-role or secret key in browser code.
