# Run Route Lab Implementation Plan

> **For agentic workers:** Use superpowers:executing-plans to implement task-by-task in this isolated project.

**Goal:** Deliver the map, export processing, scheduled Garmin sync, and Pages deployment as a runnable source package.

**Architecture:** Python converts FIT/GPX to normalized activities and produces a whitelisted public JSON file. Garmin session and original records remain encrypted in a state branch. Static Leaflet UI consumes public JSON.

**Tech Stack:** Python 3.12, garminconnect 0.3.15, fitdecode 0.11.0, cryptography, defusedxml, vanilla JavaScript, Leaflet 1.9.4, GitHub Actions.

**Spec:** `docs/superpowers/specs/2026-09-15-running-map-design.md`

## Global Constraints
- Python 3.12; Garmin client pinned to 0.3.15.
- Synthetic data must be opt-in and labelled.
- Secrets/raw records never enter Pages output.
- Fail closed on sync/parsing/persistence errors.
- Preserve interactive local MFA; no noninteractive password fallback.

### Task 1: Processing and privacy
Files: `scripts/routes.py`, `scripts/import_exports.py`, `tests/test_routes.py`.
Interfaces: `parse_export(bytes, filename) -> list[dict]`, `public_activity(dict, trim_m) -> dict`, `write_public(activities, output, trim_m)`.
- [x] Write regression cases for GPX segments, malformed coordinates, FIT records, ZIP safety, endpoint re-entry, and too-short routes.
- [x] Run `python -m unittest discover -s tests -v` to establish missing behavior.
- [x] Implement parsers, coordinate validation, public whitelist, and atomic output.
- [x] Run the tests and import a generated fixture end-to-end.

### Task 2: Authentication and sync
Files: `scripts/auth.py`, `scripts/state.py`, `scripts/sync.py`, `tests/test_sync.py`.
Interfaces: encrypted JSON state containing `tokens`, `activities`, `signatures`; sync uses `Garmin.login(token_json)` and `client.dumps()`.
- [x] Test encryption integrity and incremental sync behavior with a fake external client.
- [x] Implement local MFA bootstrap that writes secret files with owner-only permissions.
- [x] Implement paginated summaries and original FIT downloads; retain saved data on failures and save refreshed session in `finally`.
- [x] Verify real installed client signatures and run tests.

### Task 3: Interactive dashboard
Files: `site/index.html`, `site/styles.css`, `site/app.js`, `site/model.js`, `site/demo.js`, `tests/model.test.mjs`, `tests/browser.cjs`.
- [x] Test date filters, duration/pace formatting, and weekly buckets.
- [x] Implement accessible responsive map/list, playback, profile, overview, and empty/error states.
- [x] Verify interactions in desktop/mobile Playwright and inspect screenshot.

### Task 4: Delivery
Files: `.github/workflows/publish.yml`, `.github/workflows/test.yml`, `scripts/persist_state.sh`, `README.md`, `requirements.txt`.
- [x] Implement serialized scheduled workflow, encrypted state restoration/persistence, scoped Pages upload, and deployment.
- [x] Write setup steps including secret creation, Pages settings, and manual import.
- [x] Run tests, validate workflows, inspect output for raw/private fields, package ZIP, and save deliverable.
