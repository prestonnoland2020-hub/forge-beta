# Forge public-platform UI prototype

This is the account-safe replacement foundation for the current Apps Script/Google Sheets app. It intentionally lives beside the working app until data migration is verified.

The frontend starts in `VITE_DEMO_MODE=true`, so every account screen can be reviewed with realistic sample data before Supabase, Google OAuth, or Stripe is connected. The current live Apps Script app is not changed.

## Included

- React + TypeScript + Vite frontend
- Supabase Google OAuth sessions
- Optional Authenticator-app TOTP enrollment helpers
- Protected application routes
- Profiles and onboarding model
- Username-based friend requests
- Per-friend comparison permissions
- User-owned “Build Your Split” model
- Workout days, top sets, cardio, and goals
- Duplicate-entry database constraints
- Row-level security with private-by-default raw fitness data
- Stripe Checkout, Billing Portal, and signed webhook structure
- Finished responsive UI for desktop and mobile
- Three-option Forge cardio recommendations with a preferred Steady, Interval, or Circuit session
- Fast interval actuals with copy/prefill actions and first-class active recovery
- Athlete dashboard and incremental top-set recommendation context
- Workout logging with last-comparable-set feedback
- Three-step profile onboarding
- Profile-owned Build Your Split editor
- Friend requests and privacy-aware comparison UI
- Security and future billing screens

## Security rules

- The browser receives only the Supabase public anon key.
- Stripe keys and the Supabase service-role key are Edge Function secrets only.
- Card information never touches this app or database.
- Raw workout records are self-only.
- Future friend comparisons must use a controlled aggregate RPC; they must not expose another user’s raw rows.
- New profiles start private.
- The initial public launch is modeled as 18+.

## Local setup

1. Install dependencies with `npm install`.
2. Run the UI prototype with `npm run dev`.
3. Leave `VITE_DEMO_MODE=true` while reviewing the screens.
4. When the UI is approved, create a free Supabase project.
5. Run `supabase/migrations/0001_account_foundation.sql` in the Supabase SQL Editor.
6. Enable Google in Supabase Authentication and add the Google OAuth credentials.
7. Copy `.env.example` to `.env`, set the Supabase URL and anon key, and change `VITE_DEMO_MODE=false`.

## Google OAuth URLs

Use the callback URLs shown by Supabase’s Google provider setup. Add both the local URL and eventual production URL to Supabase’s redirect allow list:

- http://localhost:5173/
- https://YOUR_PUBLIC_DOMAIN/

The review build uses hash-based application routes so every screen works on GitHub Pages without server rewrite rules. For Pages, use the repository root URL as the OAuth redirect; the app completes the session and then owns navigation inside `/#/…`.

## Stripe test-mode secrets

Do not configure live payments yet. When the account/profile migration is stable, set these Edge Function secrets using Stripe test-mode values:

- STRIPE_SECRET_KEY
- STRIPE_WEBHOOK_SECRET
- STRIPE_PRO_MONTHLY_PRICE_ID
- STRIPE_PRO_ANNUAL_PRICE_ID
- PUBLIC_APP_URL

Supabase provides SUPABASE_URL, SUPABASE_ANON_KEY, and SUPABASE_SERVICE_ROLE_KEY to deployed Edge Functions.

## Forge Coach API

The frontend never receives an OpenAI API key. When Supabase is connected, Coach requests call the authenticated `forge-coach` Edge Function, which then uses the OpenAI Responses API. Demo mode intentionally falls back to labeled local guidance.

Deploy and configure it after creating the Supabase project:

1. Set the Edge Function secret `OPENAI_API_KEY`.
2. Optionally set `OPENAI_MODEL`; the prepared default is `gpt-5.6-terra`.
3. Deploy `supabase/functions/forge-coach`.
4. Set `VITE_DEMO_MODE=false` only after authentication and the function are available.

The server prompt treats formulas, recorded results, and unit conversions as read-only facts. AI interprets context and recommends next actions; it does not silently rewrite deterministic calculations or infer event results from unrelated workouts.

## Migration sequence

1. Accounts and onboarding
2. Profile and Build Your Split
3. Friends and requests
4. Private comparison RPC
5. Import each legacy athlete's Sheets data into their own Forge account
6. Move workout writes from Apps Script to Supabase
7. Run both systems in comparison mode
8. Retire person-named Sheets only after totals and histories match
9. Enable Stripe test mode
10. Complete privacy, account-deletion, backup, and production launch checks

## Proposed routes

- /login
- /onboarding
- /
- /profile/:username
- /profile/edit
- /profile/split
- /friends
- /insights/compare
- /settings/security
- /settings/billing

## What stays unchanged today

The currently deployed Apps Script app remains the working production copy. This starter does not modify its Index or Code.gs files.
# Forge AI launch

Before enabling live Forge AI, follow [FORGE_GO_LIVE.md](./FORGE_GO_LIVE.md). It is the canonical bookmark for protected API keys, Edge Functions, structured workout generation, validation, and launch testing.

# Daily-use beta

Use [BETA_DEPLOYMENT.md](./BETA_DEPLOYMENT.md) for the one-athlete-at-a-time legacy import and GitHub Pages beta workflow.
