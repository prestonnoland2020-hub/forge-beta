# Connections — API applications

Every watch and health app on the Connections screen
(`src/features/training/connectionCatalog.ts`) and what it takes to make it
live. Only Strava is connected today. Each application below has to be
submitted by Preston: they create a developer account, accept the
provider's terms, and attest to how Forge handles health data.

Developer portals change their addresses and rules, so check each link
before starting.

## Answers every form asks for

Have these ready before you start. Most of the forms ask the same questions:

- **App name / description:** Forge — adaptive strength and endurance
  coaching that adjusts the training plan from the athlete's workouts,
  sleep and recovery.
- **Data use:** read-only. Workouts, sleep, HRV, resting heart rate, and body
  weight are used to set training readiness and to log completed sessions.
  Forge never writes to the provider and never sells or shares the data.
- **Privacy policy URL** and **terms URL:** the `/legal/...` pages (these are
  public on purpose; see `App.tsx`).
- **OAuth redirect URI:** the Supabase edge function callback, following the
  pattern `strava-connect` already uses.
- **Company details:** legal entity name, website, and support email. Garmin,
  COROS, Suunto, and Wahoo ask for these.
- **Logo:** `brand/forge-mark.svg` (export a PNG if the form wants one).
- **User count / launch date:** current beta size and the planned App Store date.

## 1. Self-serve: register today, works right away for testing

| Provider | Where | Notes |
|---|---|---|
| **Fitbit / Pixel Watch** | dev.fitbit.com → Register an app (Google account) | Use the "Server" app type. Intraday heart rate needs a separate request. Google is moving Fitbit to the Google Health API, so check which one new apps should use. |
| **WHOOP** | developer.whoop.com | Create an app in the dashboard. It's limited to test users until WHOOP approves it for production. |
| **Oura** | cloud.ouraring.com/oauth/applications | OAuth app. Capped at a small number of users until Oura reviews it. |
| **Polar** | admin.polaraccesslink.com | AccessLink API. Users have to be registered with the app before data flows. |
| **Withings** | developer.withings.com | Public API. Scales, sleep, and body composition. |

## 2. Partner programs: apply and wait for approval (weeks)

| Provider | Where | Notes |
|---|---|---|
| **Garmin** | developer.garmin.com → Connect Developer Program | Business application for the Health API and Activity API. They review the business and the use case. Apply first because it takes the longest. |
| **COROS** | coros.com → API application form | Partner review. Activities only. |
| **Suunto** | apizone.suunto.com | Partner application. |
| **Wahoo** | developers.wahooligan.com | Cloud API. Approval required. |

All four of these brands already sync to Strava, so their users get activities
through Strava while the applications are in review.

## 3. Native builds: no application, but code is needed

| Provider | What it takes |
|---|---|
| **Apple Health / Apple Watch** | Turn on the HealthKit capability in Xcode (`npm run ios:open`), add `NSHealthShareUsageDescription` to Info.plist, and add a Capacitor HealthKit plugin. Apple reviews this as part of App Review, and the privacy policy has to cover health data (Guideline 5.1.3). |
| **Health Connect / Samsung Galaxy Watch** | Requires an Android build, which doesn't exist yet. Galaxy Watch data reaches Android apps through Health Connect. In Play Console, fill in the Health apps declaration for each data type the app reads. |

## Retiring Strava

The plan is to drop Strava once direct connections are live. Strava currently
carries workouts for Apple Watch, Fitbit, Polar, COROS, Suunto, and Wahoo, as
well as Garmin and WHOOP. Turn it off only after every watch your athletes
actually use has its own connection. Before switching it off:

- Check which device each connected Strava athlete records with, and make sure
  every one of those devices has a direct connection.
- Tell connected athletes ahead of time and point them to the direct connection.
- Keep the activities already imported from Strava. `disconnectStrava` already
  leaves past summaries in the account.
- Watch for duplicates while both connections run (for example, Garmin direct
  plus Garmin through Strava). `cardiodedupe` and `stravamerge` are the
  starting points.

## Garmin (approved, built)

Garmin is approved. The connector is built as two edge functions:

- `garmin-connect`: the athlete's side. It handles authorize (OAuth 2.0 with
  PKCE), callback, sync, disconnect, and status. Deploy it with JWT
  verification on.
- `garmin-webhook`: where Garmin pushes data. It handles activities, manually
  updated activities, dailies, sleeps, HRV, respiration, and deregistrations,
  in both push and ping mode. Deploy it with JWT verification **off**. It
  checks a `?key=` secret, and the `garmin-client-id` header when Garmin sends
  it. It answers 200 before processing, because Garmin times out after 30
  seconds and resends anything else hourly for 7 days.

Which data arrives depends on which Garmin APIs the program is approved for.
The **Activity API** brings activities. Sleep, HRV, resting heart rate and
daily stats come from the **Health API**, which is a separate approval. If the
program has only the Activity API, those requests are refused and Forge keeps
working with activities alone.

Setup:

1. Run the migration `20261031010000_garmin_connection.sql`.
2. Set these Supabase function secrets: `GARMIN_CLIENT_ID`,
   `GARMIN_CLIENT_SECRET`, and `GARMIN_WEBHOOK_KEY` (any long random string).
3. In the Garmin portal:
   - **Redirect URL:** `https://prestonnoland2020-hub.github.io/forge-beta/?garmin=callback`
     (add `http://localhost:5173/?garmin=callback` for local testing).
   - **Push endpoints**, set in Garmin's endpoint tool at
     https://apis.garmin.com/tools/endpoints (sign in with the client ID and
     secret). Enable Activities and Manually Updated Activities, plus Dailies,
     Sleeps, HRV, Respiration and Deregistration if the Health API is
     approved. Point every enabled type to
     `https://czefovdclflufixdpbnp.supabase.co/functions/v1/garmin-webhook?key=<GARMIN_WEBHOOK_KEY>`.

The Garmin row on the Connections screen turns into a Connect button only after
the secrets are set. Before that it keeps showing "Via Strava today". On
connect, Forge asks Garmin to backfill 30 days, the most one request allows
(Activity API §7). "Sync now" asks for the last 7 days. Garmin delivers both by push, so data shows up a few minutes later, not
right away. Activities merge into the log through the same import Strava uses.
A run that comes in from both Garmin and Strava (same kind of activity,
starting within 5 minutes) is kept only once. For multisport
activities, Forge stores each leg and skips the parent, so a triathlon isn't
counted twice.

The **Training API** (also approved) can send workouts and schedules *to* the
watch: `POST /workoutportal/workout/v2` and `POST /training-api/schedule/`.
Forge doesn't use it yet. It's the path for putting Forge's planned sessions
on the athlete's Garmin.

## Going live with one

When a provider is approved, add an edge function modeled on `strava-connect`
(authorize / callback / sync / disconnect). Then replace that row's pill on
the Connections screen with a Connect button, and map its data into
`normalizeWearableDay` (`wearableService.ts`).
