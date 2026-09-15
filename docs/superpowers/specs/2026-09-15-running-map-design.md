# Run Route Lab — approved design

Build a static running-route dashboard for GitHub Pages. Use vanilla JavaScript and Leaflet for a responsive map, activity selection, route playback, date/search filters, elevation profile, and weekly volume. Initial data is empty; synthetic Singapore demo routes are explicitly labelled and opt-in.

Python 3.12 processes Garmin FIT/GPX exports. The Garmin sync uses python-garminconnect 0.3.15 independently of Fitness AI Connector. Local interactive login handles MFA; GitHub Actions uses saved tokens only. Never ask for credentials in chat.

Persist tokens and normalized untrimmed activity records inside one Fernet-encrypted state file on a separate garmin-state branch. The encryption key and initial token JSON are GitHub Secrets. Serialize workflow runs to avoid token/state races. Preserve refreshed tokens even when activity fetching fails. Stop deployment on sync, parsing, or state-persistence failure; retain the previous live site.

Daily schedule at 22:17 UTC (06:17 Singapore), manual dispatch, and default-branch pushes run the build. The initial history window defaults to 1,000 most recent running activities, configurable to 10,000. Recheck summaries within that window; reuse already-downloaded recordings. Deletions are explicit via excluded activity IDs; do not infer deletions outside the history window.

Publish a whitelist of derived data only. Trim 200 metres at each route endpoint using exclusion circles around both endpoints, breaking lines across removed spans. Keep full-run distance/duration statistics; identify route coordinates as trimmed. Strip activity names by default (date-based public titles), do not publish start time or device identifiers. No credentials, raw exports, or untrimmed state enter the Pages artifact. Manual export imports run locally through the same processor, with explicit publish of processed JSON. A public route remains public even with trimming.

No GitHub repository was provided. Deliver a ready-to-upload source ZIP and explicit setup commands. Deployment and real Garmin download require the user's repository and local authentication. Do not claim either was tested without credentials.
