# Run Route Lab

**Your miles and health, mapped.** A responsive running atlas with Garmin export import, an interactive map, accelerated route replay, date/search filters, weekly distance, and elevation profiles.

The project is ready to upload to GitHub. **It has not yet been connected to your Garmin account or deployed.** The initial dataset is empty. Use **Explore demo** to see six clearly labelled illustrative Singapore routes.

## Preview locally

Requires Python 3.12+; Node 22+ is used only for JavaScript tests.

```bash
python -m venv .venv
source .venv/bin/activate
python -m pip install -r requirements.txt
python -m http.server 8000 --directory site
```

Open http://localhost:8000. On Windows, activate with `.venv\Scripts\activate` instead. Always serve via HTTP; opening `index.html` directly cannot load the JSON datasets.

## 1. Put the source on GitHub

Suggested repository: **run-route-lab**. Create an empty repository, then run these commands from the extracted project directory. Replace `YOUR_USERNAME` with your GitHub username.

```bash
git init -b main
git add .
git commit -m "Add running atlas with Garmin sync"
git remote add origin https://github.com/YOUR_USERNAME/run-route-lab.git
git push -u origin main
```

The ZIP includes `.github/` and `.gitignore`; preserve both. A public repository supports GitHub Pages on GitHub Free. Private-repository Pages requires an eligible paid GitHub plan; the resulting Pages site is ordinarily public. The workflow publishes only `dist/`.

In **Settings → Pages → Build and deployment → Source**, select **GitHub Actions**. The workflow publishes only from the repository's default branch (normally `main`). If yours differs, make sure the Pages environment permits it.

## 2. Authenticate Garmin on your own computer

This integration uses the **unofficial python-garminconnect client**, independently of Fitness AI Connector. It does not require that connector's subscription. Garmin can change its login/export interfaces, so reauthentication or a client update may occasionally be necessary.

If you have [GitHub CLI](https://cli.github.com/) installed, sign in with `gh auth login`, then run:

```bash
python -m scripts.auth --repo YOUR_USERNAME/run-route-lab
```

Enter your Garmin email, password, and MFA code into the local prompts. The script saves session tokens and an encryption key in the ignored `.secrets/` directory, and sends them directly to your repository's Actions secrets through GitHub CLI. It never prints the secrets. Keep a private backup of this folder, particularly the encryption key.

Without GitHub CLI:

```bash
python -m scripts.auth
```

Open **Settings → Secrets and variables → Actions → New repository secret** and add:

| Secret | Value |
| --- | --- |
| `GARMIN_TOKENS` | Complete contents of `.secrets/GARMIN_TOKENS.json` |
| `GARMIN_STATE_KEY` | Complete contents of `.secrets/GARMIN_STATE_KEY.txt` |

Do not paste these into chat, commit them, or upload `.secrets/`. Session tokens provide account access. No Garmin password is stored by this project.

## 3. Turn on automatic syncing

Under the **Variables** tab in that same settings screen, add:

| Variable | Default | Purpose |
| --- | --- | --- |
| `GARMIN_SYNC_ENABLED` | disabled | Set to `true` after configuring secrets |
| `MAX_ACTIVITIES` | `1000` | Most recent running activities to scan; maximum `10000` |
| `ROUTE_TRIM_METERS` | `200` | Hide areas around each route's start and finish; `0` disables |
| `EXCLUDED_ACTIVITY_IDS` | empty | Comma-separated Garmin IDs to remove from synced output and saved collection |

Go to **Actions → Publish running atlas → Run workflow**. Leave `reset_session` and `redownload` unchecked on the first run. Open the URL shown by the deploy job after it completes, normally `https://YOUR_USERNAME.github.io/run-route-lab/`.

The workflow runs on `main` pushes, manual dispatch, and daily at **06:17 Singapore / 22:17 UTC the previous day**. The watch must first sync with Garmin Connect. GitHub scheduled jobs can run late, and public-repository schedules may be disabled after 60 days without repository activity; re-enable the workflow if that happens.

### How persistence works

- On the first run, the initial session comes from `GARMIN_TOKENS`.
- The sync scans the configured window, downloads new original FIT exports, and refreshes summary names/distance/duration for existing records.
- Original files are parsed in memory. Normalized GPS records and the refreshed session are compressed and encrypted with Fernet using `GARMIN_STATE_KEY`.
- A separate `garmin-state` branch stores **only `state.enc`**, never plaintext tokens or raw GPS. Each state revision uses the same encryption key.
- Subsequent runs restore this encrypted state instead of reusing potentially stale bootstrap tokens. Runs are serialized, and state is saved even if collection fails after login.
- Only the whitelisted, trimmed public JSON and static assets enter `dist/`. Deployment stops on sync or persistence failure; the prior site stays live.
- Disabling `GARMIN_SYNC_ENABLED` renders existing saved activity data without calling Garmin. Manual-only mode needs no Garmin secrets if there is no saved state.

Repository policy must allow the workflow's `contents: write` permission and creation/update of `garmin-state`. Do not merge that branch into `main`. Encrypted git history grows with repeated snapshots; this is intended for a personal running history, with a 90 MiB per-state guard. Large archives may need external encrypted storage.

### Renew an expired Garmin session

Keep your original `.secrets/GARMIN_STATE_KEY.txt`, then:

```bash
python -m scripts.auth --renew --repo YOUR_USERNAME/run-route-lab
```

Manually dispatch **Publish running atlas** with **reset_session=true**. This uses the renewed token secret while preserving the encrypted history. Do not generate a replacement encryption key for existing state. If your key is lost, the old state cannot be decrypted; recovering requires a deliberate fresh sync and removal of the inaccessible state branch.

### Edited/deleted activities

Summary edits within the scanned window are reflected automatically. If the recording itself changed, manually dispatch with **redownload=true**; this re-downloads every activity in the configured window and can take longer.

Deleting a run in Garmin does not automatically remove the saved copy: add its Garmin activity ID to `EXCLUDED_ACTIVITY_IDS` and run Publish. The ID appears in the Garmin activity URL and in the processed JSON. This avoids treating activities outside the scan window as deletions. Public data already downloaded or copied by someone cannot be recalled.

## Manual FIT / GPX / ZIP import

In Garmin Connect, open an activity → gear menu → **Export Original** for its FIT ZIP, or export GPX. Save these files inside the ignored `imports/` folder.

```bash
python -m scripts.import_exports imports/my-run.zip
# Multiple files are supported:
python -m scripts.import_exports imports/first.fit imports/second.gpx --trim 200
python -m http.server 8000 --directory site
```

The importer writes:

- `.state/manual.json`: untrimmed local collection, owner-only file, ignored by git. Keep this private.
- `site/data/manual.json`: public processed dataset. This is the only data file you commit for manual imports.

```bash
git add site/data/manual.json
git commit -m "Update imported running routes"
git push
```

Reimporting the same file is deduplicated by content hash. Use `--clear` with your chosen files to replace the manual collection. Avoid importing a run already supplied by automatic sync: manual files and Garmin activity IDs use different identities and can otherwise appear twice. Changed file exports may also have a different hash.

Manual route trimming is selected with the importer's `--trim`; the Actions variable applies to synced data only. Re-run manual import with all desired files and the new trim setting to update it. Running FIT files and GPX recorded tracks are supported; multi-session/multisport FIT and GPX route-only planning files are rejected. GPX without timestamps or elevation displays missing metrics as unavailable. GPX distance and climbing are derived from GPS rather than Garmin's summary, so they may differ.

## Public data and map behavior

Routes are public once deployed. The default processor removes points within 200 m of both endpoints, including later re-entry, and breaks line segments through those areas. This is a modest location-privacy feature, not anonymization. It does not hide other sensitive places along your route.

Public JSON omits private activity names, wall-clock start times, tokens, and device identifiers. It includes average/maximum run heart rate when recorded. Daily health publication is enabled by default as requested; see below. Titles use the activity date. Full-run statistics remain; the visible route is shortened. Replay follows visible GPS geometry in 30 seconds at 1× (15 seconds at 2×, 7.5 seconds at 4×); it is not a real-time pace simulation. Elevation is plotted across visible samples. Weekly totals use Monday-based weeks; FIT import dates use Singapore time, and synced dates use Garmin's local activity date.

The bundled Leaflet library works without a JavaScript CDN. The base map still needs network access to OpenStreetMap tiles. If tiles fail, the app reports that and route interactions remain available. Keep the map attribution visible. The browser test blocks external tiles to avoid repeated automated requests to community tile servers. See the [OSM tile usage policy](https://operations.osmfoundation.org/policies/tiles/) before changing map loading behavior.

## Tests and build

```bash
python -m unittest discover -s tests -v
node --test tests/model.test.mjs
python -m scripts.build
```

Browser interaction test (starts its own local server):

```bash
npm install --no-save playwright@1.51.1
npx playwright install chromium
mkdir -p test-results
node tests/browser.cjs
```

Tests cover parsing, coordinate validation, endpoint re-entry, ZIP safety, encryption integrity, incremental sync, token persistence after failures, and filtering/weekly totals. Browser checks cover demo, selection, playback, filters, overview, setup dialog, and mobile layout. Real Garmin authentication and hosted Actions/Pages deployment require your account and repository and were not exercised in this environment.

## Project layout

- `site/`: static app, vendored Leaflet, processed public datasets.
- `scripts/routes.py`: export parsing and public transformation.
- `scripts/auth.py`: local login/MFA and secret setup.
- `scripts/sync.py`: incremental Garmin export downloads.
- `scripts/state.py`: compressed encrypted state and private file writes.
- `scripts/import_exports.py`: local manual import.
- `scripts/build.py`: explicit public-file build allowlist.
- `.github/workflows/publish.yml`: sync, persist, build, deploy.
- `.github/workflows/test.yml`: credential-free checks on pushes and PRs.

## References

- [python-garminconnect](https://github.com/cyberjunky/python-garminconnect) and its authentication example; version 0.3.15 is pinned here.
- [GitHub Pages custom workflows](https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages).
- [GitHub Actions schedule behavior](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows#schedule).
- [Leaflet](https://leafletjs.com/), distributed under the included BSD license in `site/vendor/LEAFLET-LICENSE`.

## Health overview

Use **Health overview** in the header to see daily activity, full timestamped heart-rate and stress readings, Body Battery samples, sleep score and need, exact sleep window and stages, overnight heart rate/HRV/stress, respiration, SpO₂, skin temperature, and the measurements supported by your watch. Select a day using the date picker or any seven-day chart bar. Running filters do not change daily health metrics. All-day distance is separate from running distance. Today may be incomplete until the next watch sync.

Automatic syncing retrieves the last seven calendar days on each run, using Singapore time for the date window. Public output is `site/data/health.json`. It includes exact timestamps, so publishing it can reveal sleep and daily routines. Garmin account, profile, device, and internal record identifiers are excluded by an explicit build allowlist. Set repository variable `PUBLISH_HEALTH=false` to stop daily-health fetching and publish an empty daily dataset; previously downloaded copies cannot be recalled. Run average/max heart rate stays with activity statistics. Recorded samples are averaged without imputing missing readings; this is not necessarily Garmin Connect's own daily average. No clinical status or diagnosis is inferred.

FIT imports show session average/maximum heart rate when available. GPX imports in this version do not extract heart-rate extensions. Neither supplies all-day step totals or resting heart rate. Missing measurements display “—”. An empty daily response leaves its values unavailable rather than displaying zero. Connection, authentication, and rate-limit failures stop the sync and preserve the previous deployed site.

The updated standalone `run-route-lab-preview.html` includes labelled demo health readings. Real readings appear only after the full project is connected and deployed.
# run-route-lab
