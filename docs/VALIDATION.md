# Verification — 15 September 2026

- 19 Python tests passed: real binary FIT decoding and CRC rejection; GPX and ZIP parsing; coordinate validation; endpoint re-entry filtering; encryption integrity; incremental collection; token preservation on collection and post-login profile errors; daily health normalization, date range, HR fallback, and connection failure propagation.
- 4 JavaScript model tests passed: pace/duration formatting, inclusive date/search filtering, and Monday-based weekly totals across year boundaries.
- Playwright desktop/mobile interaction checks passed using Chromium 134: demo, delayed-data-loading race, activity selection, replay, search/date filters, reset, overview, setup dialog, mobile width, health cards, seven-day history, day selection, and exit-to-empty state.
- Encrypted state branch integration verified against a temporary local bare git remote: initial write, update, restore, ciphertext-only branch tree, and unchanged source branch.
- Both workflow YAML files parsed; shell scripts pass bash syntax checks; Python/JavaScript syntax checks passed; public allowlisted build succeeded.
- Code review findings about post-auth token rotation, large-history timeout, and default branch publishing were resolved.

## Limits

Real Garmin authentication/downloads and hosted GitHub Actions/Pages deployment have not been tested: they require the user's own session and repository. Third-party map tile delivery remains network-dependent. The initial CARTO tiles required a provider key, so the delivered application uses standard OpenStreetMap tiles instead. Repeated automated browser tests block external tiles and exercise routes and the graceful map-unavailable state.

Demo routes and metrics are synthetic, labelled, and opt-in. No user fitness data is included.
