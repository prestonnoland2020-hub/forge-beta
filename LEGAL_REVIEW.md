# Forge legal and compliance review — October 2026

This review checked the code against the legal pages and the launch checklist. **It is not legal advice.** Before you charge real money, have a lawyer read the Terms and Refund Policy. A one-off review of a small app's policies usually costs a few hundred dollars.

## Business details

Filled in `src/lib/legal.ts`: operator **Preston Taylor Noland**, 10850 Hammerly Blvd, Houston, TX 77043, governed by **Texas** law. They appear on every legal page and in the Terms.

The address is published on a public page. If it's your home, you can swap in a virtual-mailbox or registered-agent address in that file at any time.

Also worth considering: **an LLC.** As an individual, you are personally liable for any claim against the app. A Texas LLC costs a $300 state filing fee and keeps that liability inside the company. Once you have one, put its name in `operatorName`.

## What changed

| Area | Change |
|---|---|
| Google Fonts | Removed. The fonts are now bundled with `@fontsource`. The old Google-hosted link sent every visitor's IP address to Google before they had agreed to anything, and a German court (LG München, 2022) fined a site for doing exactly that. I checked in the browser: the site now loads nothing from any other domain. |
| Privacy Policy | Corrected against the code. It now covers what it was missing: what training partners can see (including body weight), push notifications, your admin access as operator, GitHub Pages hosting, backups (the old line "no shadow copy" was not accurate), state and EU rights, and security. |
| Consumer Health Data Notice | New (`/legal/health`). Washington's My Health My Data Act counts body weight, check-ins and injury notes as health data. It requires a separate notice like this, linked from the homepage (the sign-in screen links to it). |
| Terms | Adds: who the contract is with, that AI coaching can be wrong, how automatic renewal works (prices, how to cancel), a refund link, ownership and trademarks, changes to the terms, and an optional governing-law clause. |
| Cookie and Storage Policy | New (`/legal/cookies`). **No cookie banner is needed.** Forge sets no cookies of its own, and everything it keeps in browser storage is strictly necessary (sign-in, your data, theme, notifications). That use is exempt from consent under EU ePrivacy rules. Adding a banner would only suggest tracking that isn't there. |
| Refund Policy | New (`/legal/refunds`). **This is a business choice I made for you, so check it:** web charges are refunded in full on request within 14 days, and Apple purchases go through Apple. The 14-day window also covers the EU's 14-day right to withdraw, so no separate waiver checkbox is needed at checkout. |
| Onboarding consent | Three required checkboxes: 18+ plus Terms and Privacy, separate health-data consent, and the existing safety acknowledgement. Each signup records when it consented and which policy version (`acceptedTermsAt`, `healthConsentAt`, `consentVersion`) in the athlete's settings, which sync to the account. Before this, the 18+ rule was never actually asked. |
| Billing | The renewal terms, price and how to cancel now sit next to the Subscribe buttons, which California's auto-renewal law requires. Plan buttons say "Subscribe monthly" or "Subscribe annual" instead of "Choose". "Half the monthly rate" is now "about $5 a month", because $59.99 is not exactly half of $119.88. |
| Account deletion | **This was a real bug.** `delete_my_account()` deletes the database rows but never tells Stripe, so a web subscriber who deleted their account kept being charged. Deletion is now blocked until the web subscription is cancelled. |
| Smartwatch claims | Fitbit was labelled "Available" and the Recovery screen said health data "is automatically synced". No smartwatch connection exists, so that copy now says it isn't available yet. |
| Legal links | Settings → Privacy & legal. Before, signed-in users had no way to reach these pages. |
| Accessibility | Every legal page and the sign-in screen pass WCAG AA contrast (4.5:1) in light and dark mode, measured in the browser. No sideways scrolling at 375px. Legal nav marks the current page (`aria-current`). Keyboard focus rings are visible. The whole onboarding flow, consent boxes included, works with the keyboard alone. Checkboxes no longer shrink next to long labels. A decorative icon is hidden from screen readers. |

## Checked and found fine

- **Fake reviews and testimonials:** none in the app.
- **Analytics and tracking:** none. No tracking pixels, analytics scripts or ad SDKs.
- **Third-party embeds:** none. No iframes, videos or maps. The only external page was Google Fonts, now removed.
- **Images and alt text:** the only `<img>` tags are app-icon previews next to visible text labels, so they correctly use `alt=""`. The logo is the Forge mark from `brand/`. The fonts (Archivo, Inter) use the SIL Open Font License, which allows bundling.
- **Data collection:** profile, training, check-ins and notes are all used by features. Medical history and sex are deliberately not collected.
- **Payments:** card data goes straight to Stripe or Apple.

## Risks still open (in rough priority order)

1. **Pinch-zoom is turned off** (`index.html`). You asked for this twice, and the comment there records it. It still fails WCAG 1.4.4, it is the single most common finding in ADA website lawsuits, and your own `nozoom.mjs` test fails on it. To fix it, remove `maximum-scale=1.0, user-scalable=no` from the viewport tag; the 16px input rule already prevents iOS zooming on inputs. I left it alone because it was your explicit decision.
2. **Strava and AI data rules.** The coach sends imported Strava activities to OpenAI (`careerSummary.ts` → `forge-coach`). Strava's API Agreement (updated November 2024) restricts how API data can be used with AI models. Read the current terms before you switch Strava on for other users. Leaving Strava activities out of the coach context would avoid the issue.
3. **Signed data-processing agreements.** The privacy policy says each provider works under its own data-protection terms. Stripe's DPA applies automatically. For Supabase and OpenAI, accept the DPA in each provider's dashboard or on its legal page.
4. **Accounts created before this change** never ticked the new consent boxes. Before wider launch, ask existing users to agree once, for example by showing the onboarding consent step when `consentVersion` is missing.
5. **Account deletion should cancel Stripe server-side.** The UI block is a stopgap. The real fix is for deletion to call Stripe and cancel the subscription in the same step (an edge function, since the service-role key can't run in SQL).
6. **Price and AI health claims in store listings.** The app copy is clean. Keep marketing (App Store text, social posts) free of promises like "prevents injury", "guaranteed results" or user counts you can't back up. The FTC and Apple both act on these.
7. **Health positioning.** Forge correctly says it is not a medical device. Don't add features that diagnose or treat (for example "detects overtraining syndrome"), or FDA rules could apply.
8. **Arbitration and class-action waiver.** Deliberately left out. They can be enforceable but need careful drafting. Ask the lawyer if you want them.
9. `brand/forge-strike/demo.html` still loads Google Fonts. It's an untracked local demo that the app doesn't ship, so this only matters if you publish that page.

## Laws considered

US: FTC Act §5 (deceptive claims and reviews; the FTC's 2024 fake-review rule), California's Automatic Renewal Law and CCPA/CPRA (Forge is probably below the CCPA's thresholds but follows its rights anyway), Washington's My Health My Data Act, Nevada SB 370, Connecticut's consumer-health-data rules, COPPA (handled by the 18+ gate), and ADA Title III (accessibility). EU and UK, if you allow users there: GDPR (lawful bases, health data as special-category data, data-subject rights), the ePrivacy Directive (storage consent), and the 14-day right of withdrawal. Platforms: App Store Guidelines 3.1.2, 4.8, 5.1.1(i) and 5.1.1(v), Stripe's terms, and Strava's API Agreement.
