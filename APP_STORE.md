# Getting Forge into the App Store

Everything in this repository that could be done without a Mac is done. What
remains needs Xcode, an Apple Developer account, and your hands. This is the
runbook, in order, with the reasons attached — so when App Review pushes back
you know which rule is being cited.

Nothing here is guesswork about the app: it describes the code as it now
stands.

---

## 0. What is already done

| Requirement | Guideline | State |
|---|---|---|
| Sign in with Apple alongside Google | 4.8 | Built (`authService.ts`, `LoginPage.tsx`) — needs the provider enabled in Supabase and Apple |
| In-app account deletion | 5.1.1(v) | Built — Profile → Plan → Delete my account, backed by `delete_my_account()` |
| Privacy policy inside the app | 5.1.1(i) | Built — `/#/legal/privacy`, reachable without an account |
| Terms of use | — | Built — `/#/legal/terms` |
| Medical disclaimer before use | 1.4.1 | Built — the first onboarding screen, must be accepted to continue |
| Subscription sold through StoreKit, not our own mechanism | 3.1.1 | Server half built (`apple-iap` function); needs the StoreKit bridge and products |
| Restore purchases | 3.1.1 | Built in the UI; calls the bridge |
| App icon at every required size, opaque, no alpha | — | Built — `npm run icons` |
| Rate limiting so the AI endpoints cannot be drained | — | Built (migration 0021 + `_shared/guard.ts`) |
| Safe-area handling, no zoom-on-input, native touch behaviour | — | Built |

What is left is: an Apple account, the native project, the StoreKit bridge,
store metadata, and the submission itself.

---

## 1. Apple Developer Program — $99/year

Enrol at <https://developer.apple.com/programs/>. As an individual this is
usually approved within 24–48 hours; as an organisation you need a D-U-N-S
number and it takes longer. Do this first, because several later steps sit
behind it and none of them can be rushed.

While you wait, decide the **bundle ID**. The code assumes
`com.forgetraining.forge` (`capacitor.config.ts`, and the Apple product IDs in
`platform.ts`). It is permanent once used — changing it later means a new app
record — so if you want something else, change it now in both places.

---

## 2. Add the native project

On the Mac, in the repo:

```bash
npm install @capacitor/core @capacitor/cli @capacitor/ios
npm install @capacitor/splash-screen @capacitor/status-bar @capacitor/keyboard @capacitor/haptics
npx cap add ios
npm run ios:sync     # builds the web app, then copies it into the shell
npm run ios:open     # opens Xcode
```

`capacitor.config.ts` is already written and covers the dark background, the
splash, the keyboard resize behaviour and the URL schemes.

**App icons.** `npm run icons` regenerates everything. In Xcode, open
`App/Assets.xcassets/AppIcon.appiconset` and drop in the files from
`public/icons/ios/` plus `public/icons/icon-1024.png` for the App Store slot.
The 1024 must have no alpha channel — the generator already guarantees that,
which is the single most common upload rejection.

---

## 3. Sign in with Apple

Three places have to agree, and a mismatch shows up as a login that opens
Apple, succeeds, and returns to a signed-out app.

1. **Apple Developer → Certificates, Identifiers & Profiles**
   - Under Identifiers, enable **Sign In with Apple** on the App ID.
   - Create a **Services ID** (e.g. `com.forgetraining.forge.web`) for the web
     flow, and add the return URL Supabase gives you:
     `https://<project-ref>.supabase.co/auth/v1/callback`
   - Create a **Sign in with Apple key** (.p8). Note the Key ID and your Team
     ID; download the key once — Apple will not let you download it again.

2. **Supabase → Authentication → Providers → Apple**
   - Enable it. Enter the Services ID as the client ID, and the Team ID, Key
     ID and .p8 contents so Supabase can mint the client secret.

3. **Xcode**
   - Signing & Capabilities → **+ Capability** → Sign in with Apple.

Also add your production URL and the Capacitor origin to Supabase's redirect
allow list, or the native app's OAuth return is rejected:
`capacitor://localhost`, `https://prestonnoland2020-hub.github.io/forge-beta/`,
and your custom domain when you have one.

---

## 4. The subscription

This is the part with the most rules attached, so read the whole section
before starting.

### Why it has to be StoreKit

Guideline 3.1.1: *"If you want to unlock features or functionality within your
app… you must use in-app purchase. Apps may not use their own mechanisms to
unlock content or functionality."* Forge Pro raises the AI limits, which is
functionality inside the app, so on iOS it goes through Apple. Stripe stays for
the web. Both write the same `subscriptions` row, and `forge_tier()` does not
care which paid.

Since the 2025 US injunction, apps on the US storefront may also *link out* to
external purchase without Apple's commission. That is a real option and worth
revisiting once you have revenue — but it is a US-storefront carve-out on a
guideline Apple is still actively litigating, and it is a bad thing to bet a
first submission on. Ship with IAP; take the 30% (15% after your first year,
via the Small Business Program you should apply to on day one); revisit later.

### Create the products

App Store Connect → your app → **Subscriptions** → create a subscription group
("Forge Pro"), then two subscriptions:

| Product ID | Duration | Price |
|---|---|---|
| `com.forgetraining.forge.pro.monthly` | 1 month | $9.99 |
| `com.forgetraining.forge.pro.annual` | 1 year | $79.99 |

Those exact IDs are in `src/features/billing/platform.ts`. Each needs a display
name, description, and a review screenshot, or the subscription sits in
"Missing Metadata" and the build cannot be submitted.

Apply for the **Small Business Program** (<https://developer.apple.com/app-store/small-business-program/>)
— under $1M/year it takes Apple's cut from 30% to 15%, which on this app's
likely revenue is the difference between a hobby and a margin.

### Wire the StoreKit bridge

The app expects a Capacitor plugin exposed as `Capacitor.Plugins.ForgeStore`
with three methods (see `platform.ts`):

```ts
getProducts(ids: string[]): Promise<{ id, price, title }[]>
purchase(id: string): Promise<{ transactionId: string }>
restore(): Promise<{ transactionId: string } | null>
```

Either write a small Swift plugin over StoreKit 2 (about 80 lines — `Product.products(for:)`,
`product.purchase()`, `Transaction.currentEntitlements`) or use a community
plugin and adapt the names. **The app is designed to run without it**: with no
bridge present, the billing screen says in-app purchases need a newer version
rather than crashing, so you can ship TestFlight builds before this exists.

Whatever you use, the contract is fixed and it is the important part: the app
sends only a **transaction id**, and the server asks Apple what that
transaction actually was. A device claiming "I paid" is never believed.

### Server secrets

App Store Connect → Users and Access → **Integrations → App Store Connect API**
→ generate an **In-App Purchase** key. Then set these as Supabase Edge Function
secrets (never in the repo, never in a `VITE_` variable):

```
APPLE_IAP_KEY_ID          the key's ID
APPLE_IAP_ISSUER_ID       shown above the key list
APPLE_IAP_PRIVATE_KEY     the whole .p8 file contents
APPLE_BUNDLE_ID           com.forgetraining.forge
APPLE_PRO_MONTHLY_PRODUCT_ID   com.forgetraining.forge.pro.monthly
APPLE_PRO_ANNUAL_PRODUCT_ID    com.forgetraining.forge.pro.annual
```

`supabase functions deploy apple-iap` and it is live. It tries production
first and falls back to sandbox, which is what makes TestFlight and App Review
work from the same binary.

---

## 5. Deploy the backend before the app

```bash
# The migration that closes the RLS holes and adds the quota meter.
supabase db push

# Functions. stripe-webhook is the only one that must skip JWT verification,
# because Stripe cannot present a Supabase token.
supabase functions deploy forge-coach
supabase functions deploy forge-plan
supabase functions deploy create-checkout-session
supabase functions deploy create-billing-portal
supabase functions deploy strava-connect
supabase functions deploy apple-iap
supabase functions deploy stripe-webhook --no-verify-jwt
```

Then confirm, in the SQL editor, that nothing is unprotected:

```sql
select relname, relrowsecurity
from pg_class c join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relkind = 'r'
order by relrowsecurity, relname;
```

Every row should read `true`. Also check Supabase's own Security Advisor.

---

## 6. App Store Connect metadata

Create the app record (Platform: iOS, Bundle ID from step 1).

- **Name**: Forge — Top Set Training *(30 characters max; the plain "Forge" is
  almost certainly taken)*
- **Subtitle**: Log the top set. Track real progress. *(30 max)*
- **Category**: Health & Fitness
- **Age rating**: 17+ if you keep the adults-only positioning the database
  already enforces; otherwise 4+ with no other content flags.
- **Privacy Policy URL**: must be a public web URL as well as the in-app page.
  Point it at `https://prestonnoland2020-hub.github.io/forge-beta/#/legal/privacy`
  until you have a domain.
- **Support URL**: required. A single page with an email address is enough.

### Privacy nutrition labels

Declare honestly; this is checked and it is easy to get wrong by omission.

| Data | Collected | Linked to user | Used for tracking | Purpose |
|---|---|---|---|---|
| Email address | Yes | Yes | No | App functionality |
| Name | Yes | Yes | No | App functionality |
| Health & Fitness (workouts, cardio, body weight) | Yes | Yes | No | App functionality |
| Purchases | Yes | Yes | No | App functionality |
| User content (coach questions, injury notes) | Yes | Yes | No | App functionality |
| Identifiers (user ID) | Yes | Yes | No | App functionality |

Nothing is used for tracking or advertising, which is true and worth saying
plainly — it is a real differentiator on the product page.

### Screenshots

Required: **6.9" iPhone** (1320 × 2868). Everything else can be scaled from it.
Take them from a seeded account with real-looking history — a reviewer opening
an app full of empty states is a reviewer looking for reasons. Shoot: Today
with a session ready, the workout log mid-entry, the Plan block, Progress with
charts, and the Coach answering.

---

## 7. Review notes — write these, they matter

Forge requires an account and a reviewer cannot make one with Google or Apple
SSO on a shared test device without friction. **Provide a demo account** in
App Review Information, pre-loaded with several months of workouts, or you will
be rejected under 2.1 for an app the reviewer could not evaluate.

Suggested note:

> Forge is a strength and endurance training log. Sign in with the demo
> account below; it has twelve weeks of history so every screen has real data.
>
> Forge Pro is an auto-renewing subscription that raises the daily limits on
> the AI coach and program generation. Everything else — all logging, history,
> charts and the split builder — is free and unlimited.
>
> The app shows a medical disclaimer that must be accepted before setup, and
> account deletion is at Profile → Plan → Delete my account.

---

## 8. Build and submit

In Xcode: set the version and build number, select **Any iOS Device**, then
Product → **Archive** → Distribute App → App Store Connect.

Go through **TestFlight first**. Beta review is usually under a day, it catches
the IAP sandbox problems that are miserable to debug from a rejection, and it
lets you use the app on your own phone for a week before anyone else sees it.

Then submit for review. Expect 24–48 hours. First submissions are rejected more
often than not; the usual causes here would be a missing demo account (2.1),
subscription metadata not filled in (3.1.2), or the privacy policy URL not
resolving.

---

## 9. Before you ship, once

- [ ] `VITE_DEMO_MODE=false` in the production build (the Pages workflow already sets it)
- [ ] Migration 0021 applied; every `public` table reports `relrowsecurity = true`
- [ ] Sign in with Apple works on a real device, not just the simulator
- [ ] A sandbox purchase grants Pro, and Restore returns it on a second device
- [ ] Delete-account actually deletes — check the row is gone in Supabase
- [ ] Strava connect/disconnect works from inside the native shell
- [ ] The AI limits refuse at the right count for a free account
- [ ] Privacy policy and Terms load without a session
