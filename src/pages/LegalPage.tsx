import type { ReactNode } from 'react';
import { Link, useParams } from 'react-router-dom';
import { LEGAL, operatorLabel } from '../lib/legal';
import { Icon } from '../components/Icon';

/* App Store Review Guideline 5.1.1(i) requires the privacy policy to be
   reachable INSIDE the app, not only as a URL in App Store Connect metadata,
   and to state three things explicitly: what is collected and every use of it,
   that third parties handling it give equal protection, and how retention,
   deletion and consent withdrawal work.

   These pages sit outside the authenticated routes on purpose — a reviewer,
   and anyone deciding whether to sign up at all, has to be able to read them
   without an account. The content describes what the code in this repository
   actually does; when the code changes, this changes with it. LEGAL_REVIEW.md
   records which part of the code each claim was checked against. */

const CONTACT = LEGAL.contactEmail;
const mail = <a href={`mailto:${CONTACT}`}>{CONTACT}</a>;
const Meta = () => <p className="legal-meta">Last updated {LEGAL.updated}</p>;

function BusinessDetails() {
  return <>
    <h2 id="who">Who runs Forge</h2>
    <p>Forge is operated by {operatorLabel}{LEGAL.postalAddress ? <>, {LEGAL.postalAddress}</> : null}. Questions, requests and legal notices go to {mail}.</p>
  </>;
}

function Privacy() {
  return <>
    <h1>Privacy Policy</h1>
    <Meta />

    <p>Forge is a training log. It exists to record what you actually did in the gym and on the road, and to coach the progression from there. This page says exactly what it stores, who else ever sees it, and how to get rid of it.</p>

    <BusinessDetails />

    <h2>What Forge collects</h2>
    <ul>
      <li><strong>Your account.</strong> When you sign in with Google or Apple, Forge receives your email address, your display name and, if your provider supplies one, your avatar image. If you use Sign in with Apple and choose to hide your email, Forge only ever sees the private relay address.</li>
      <li><strong>Your profile.</strong> The name and username you choose, your units, training days, focus and goals.</li>
      <li><strong>Your training.</strong> Workouts, top sets, cardio sessions, your split, goals, personal records and any body weight you enter.</li>
      <li><strong>Health-related notes.</strong> Daily check-ins (how your legs, energy and sleep feel, on a 1–5 scale, plus any note), and any injury, pain or fatigue notes you record so training can work around them. See the <Link to="/legal/health">Consumer Health Data Notice</Link>.</li>
      <li><strong>What you ask the coach.</strong> Questions you send Forge Coach and the answers it gives.</li>
      <li><strong>Connected activity.</strong> If you connect Strava, Forge imports the activity summaries it fetches — type, distance, duration, pace, heart rate where present.</li>
      <li><strong>Notifications.</strong> If you turn on push notifications, Forge stores the push address your browser or phone issues, your time zone (so the morning brief arrives in your morning), which notifications you want, and a delivery log.</li>
      <li><strong>Subscription state.</strong> Whether your account is on Free or Pro, when the period ends, and how many Forge AI requests you have made. Forge never receives or stores card numbers.</li>
    </ul>

    <h2>What Forge does not collect</h2>
    <p>There is no advertising SDK, no analytics or tracking script, and no third-party behavioural profiling in Forge. Fonts and all other page assets are served from Forge's own site. Forge does not sell personal data, does not share it for targeted advertising, and does not build a profile of you for anyone else's purposes. Forge does not access your contacts, photos, microphone, camera or location, and it does not currently read data from any smartwatch or health app.</p>

    <h2>How it is used</h2>
    <ul>
      <li>To show you your own training history and progress.</li>
      <li>To generate your recommendations and programs. Deterministic calculations run on your device; coaching answers and program generation send the relevant slice of your training data to our AI provider (see below).</li>
      <li>To send the notifications you switched on.</li>
      <li>To show your training partners the summary described below, if you add any.</li>
      <li>To enforce the fair-use limits on Forge AI, which is why request counts are stored.</li>
      <li>To operate a subscription if you buy one, and to keep the service secure.</li>
    </ul>
    <p>Your training data is not used to train anybody's machine-learning model.</p>

    <h2>Training partners</h2>
    <p>Forge is private by default. Nobody sees your training unless you and another athlete both agree to be training partners. A partner can then see: whether you trained today and your session's headline (such as your heaviest set), your days trained, miles run, top sets and day streak for the week, how your lifts and runs compare with theirs, and your body-weight trend. A partner never gets direct access to your raw records. Removing a partner ends this immediately, from either side.</p>

    <h2>Who else processes it</h2>
    <p>Forge uses a small number of service providers. Each processes your data only to provide its service to Forge, under its own data-protection terms:</p>
    <ul>
      <li><strong>Supabase</strong> — sign-in and database hosting. Your records live here. Every table is protected by row-level security scoped to your account.</li>
      <li><strong>OpenAI</strong> — coaching answers and program generation. Requests are sent from Forge's server, never from your device, with storage turned off and with a pseudonymous identifier rather than your email. Under OpenAI's API terms, API data is not used to train its models.</li>
      <li><strong>Google and Apple</strong> — sign-in, when you choose that provider.</li>
      <li><strong>Stripe</strong> — subscription payments on the web. Card details go directly to Stripe and never touch Forge's servers or database.</li>
      <li><strong>Apple</strong> — subscription payments made inside the iOS app. Apple tells Forge only that a valid subscription exists and when it expires.</li>
      <li><strong>Strava</strong> — only if you connect it. Your Strava tokens are held server-side in a schema that is not reachable from the app, and are never sent to your browser or phone.</li>
      <li><strong>Push services</strong> (Apple, Google or Mozilla, depending on your device) — deliver notifications you switched on. Messages are encrypted to your device, so the push service cannot read them.</li>
      <li><strong>GitHub Pages</strong> — hosts the Forge website. Like any web host it receives your IP address and browser details when you load the site.</li>
    </ul>
    <p>As the operator, {operatorLabel} has administrative access to the database, as any service operator does, and uses it only to run Forge, fix problems and answer your requests. Forge may disclose data where the law requires it.</p>
    <p>These providers are based in the United States, so your data is processed there.</p>

    <h2>Storage on your device</h2>
    <p>Forge keeps your sign-in session and a working copy of your training and settings in your browser's local storage. It does not set advertising or analytics cookies. The <Link to="/legal/cookies">Cookie and Storage Policy</Link> lists exactly what is stored.</p>

    <h2>How long it is kept</h2>
    <p>Your training data is kept for as long as your account exists, because a training log with a retention limit is not a training log. Forge AI request counts are kept for the current and previous month for fair-use accounting. Push delivery logs are kept only as long as needed to diagnose delivery.</p>

    <h2>Deleting your account</h2>
    <p>Open <strong>Profile → Settings → Plan and billing → Delete my account</strong> inside the app. This permanently removes your profile, every workout, top set, cardio session, goal, note, check-in, partnership and connection, along with any stored Strava tokens. It takes effect immediately and cannot be undone. Copies can remain in the hosting provider's routine backups until those backups expire, typically within 30 days; they are not used for anything in that time.</p>
    <p>Deleting your Forge account does not cancel an App Store subscription. Cancel that in your Apple ID subscription settings first, or Apple will keep billing you. A web subscription must also be cancelled before the account is deleted; the app asks you to do this first.</p>
    <p>You can withdraw consent for Strava at any time without deleting anything else, using <strong>Disconnect</strong> on the Connections screen, and you can turn notifications off in <strong>Coach &amp; notifications</strong>.</p>

    <h2>Your rights</h2>
    <p>Wherever you live, you can ask to access, correct, export or delete your data, and to withdraw any consent you have given. Access, correction and deletion are built into the app; for an export or any other request, write to {mail}. You will get an answer within 30 days (45 where state law allows that), and you will not be treated differently for asking. If a request is refused you can appeal by replying to that answer, and if you are still not satisfied you can contact your state attorney general.</p>
    <p><strong>If you are in the EU, UK or Switzerland:</strong> Forge processes your training data to provide the service you signed up for (contract); health-related data, notifications and Strava only with your consent, which you can withdraw at any time; and security and fair-use records on the basis of legitimate interests. You also have the right to object, to restrict processing, and to complain to your local data-protection authority.</p>

    <h2>Children</h2>
    <p>Forge is for adults. It is not directed at anyone under 18, and accounts are not knowingly created for them. If you believe a minor has an account, write to {mail} and it will be deleted.</p>

    <h2>Security</h2>
    <p>Data is encrypted in transit, access is limited by row-level security, and payment and AI keys exist only on the server. No system is perfectly secure; if a breach affecting your data occurs, you will be told as the law requires.</p>

    <h2>Health</h2>
    <p>Forge is a training log and a coaching tool. It is not a medical device and it does not provide medical advice, diagnosis or treatment. Talk to a physician before starting or changing a training program.</p>

    <h2>Changes</h2>
    <p>If this policy changes materially you will be told in the app before the change takes effect. Questions go to {mail}.</p>
  </>;
}

/* Washington's My Health My Data Act (and Nevada SB 370, and Connecticut's
   consumer-health rules) treat fitness data — body weight, how you slept, an
   injury note — as consumer health data. Washington requires a SEPARATE notice,
   linked from the homepage, and consent before collection. This is that
   notice; onboarding is where the consent is asked for. */
function HealthData() {
  return <>
    <h1>Consumer Health Data Notice</h1>
    <Meta />
    <p>Some of what you record in Forge is "consumer health data" under laws such as Washington's My Health My Data Act and Nevada's SB 370. This notice explains how Forge handles it. It adds to the <Link to="/legal/privacy">Privacy Policy</Link>.</p>

    <h2>What health data Forge collects</h2>
    <ul>
      <li>Body weight, and body-weight goals.</li>
      <li>Daily check-ins: how your legs, energy and sleep feel (1–5), and any note you add.</li>
      <li>Injury, pain, fatigue or limitation notes, and the body area involved.</li>
      <li>Workouts and cardio sessions, including heart rate where an imported Strava activity contains it.</li>
      <li>Anything health-related you type to Forge Coach.</li>
    </ul>

    <h2>Where it comes from</h2>
    <p>From you, when you enter it, and from Strava, if you connect it. Forge does not buy health data or infer it from other sources.</p>

    <h2>Why Forge uses it</h2>
    <p>Only to provide the training features you asked for: building and adjusting your plan, working around injuries, tracking goals, coaching answers, and the training-partner summary if you add a partner.</p>

    <h2>Who it is shared with</h2>
    <ul>
      <li>The service providers in the Privacy Policy that need it to run those features: Supabase (storage) and OpenAI (coaching answers and program generation).</li>
      <li>Training partners you accept, who see your body-weight trend and training summary as described in the Privacy Policy. Your check-ins and injury notes are never shown to partners.</li>
    </ul>
    <p>Forge does not sell consumer health data and does not use it for advertising.</p>

    <h2>Your consent and your rights</h2>
    <p>Forge asks for your consent to collect and use this data when you set up your account. You can withdraw it at any time by deleting the data in the app or deleting your account; Forge cannot provide training without it. You can also ask to confirm whether Forge holds your health data, get a copy, get a list of everyone it was shared with, or have it deleted, by writing to {mail}. You will get an answer within 45 days. If Forge declines your request, you can appeal by replying to that answer; if the appeal is denied you can contact your state attorney general.</p>
    <BusinessDetails />
  </>;
}

function Terms() {
  return <>
    <h1>Terms of Use</h1>
    <Meta />

    <h2>What you are agreeing to</h2>
    <p>These terms are an agreement between you and {operatorLabel}. By creating an account you agree to them and to the <Link to="/legal/privacy">Privacy Policy</Link>. You must be 18 or older to use Forge.</p>

    <h2>Training carries real risk</h2>
    <p><strong>Forge is not a medical service and does not give medical advice.</strong> Strength and endurance training can cause injury. Check with a physician before starting or changing a program — particularly with a heart condition, an existing injury, a chronic illness, or during pregnancy. Stop any exercise that causes pain, dizziness or unusual shortness of breath, and seek professional care for anything that does not resolve.</p>
    <p>Every recommendation Forge makes is generated from what you have recorded. You are responsible for judging whether a given load, pace or movement is safe for you on the day. Forge's suggestions are a starting point for that judgement, never a substitute for it.</p>

    <h2>AI coaching can be wrong</h2>
    <p>Forge Coach and generated programs use an AI model. Its answers can be incomplete or mistaken. Check anything important, and never follow an AI suggestion that conflicts with how your body feels or with advice from a professional.</p>

    <h2>Your account</h2>
    <p>Keep your sign-in secure; you are responsible for activity on your account. Do not use Forge to break the law, to attack the service, to harass a training partner, or to attempt to reach another athlete's data. Only add people you know as training partners — they will see the summary described in the Privacy Policy.</p>

    <h2>Forge AI fair use</h2>
    <p>Coaching answers and program generation cost real money per request, so both are subject to daily and monthly limits that depend on your plan. Current limits are always visible on <strong>Settings → Plan and billing</strong>. Automated or scripted use of these endpoints is not permitted and may end your access.</p>

    <h2>Subscriptions and automatic renewal</h2>
    <p>Logging and your history are free. Forge Pro raises the coaching limits and costs $9.99 per month or $59.99 per year (plus any applicable tax). <strong>Pro renews automatically at the same price at the end of each period until you cancel.</strong> If the price ever changes, you will be told in advance and can cancel before it applies.</p>
    <ul>
      <li><strong>On the web</strong>, billing is handled by Stripe. Cancel any time in the app under <strong>Plan and billing → Manage payment and cancel</strong>.</li>
      <li><strong>In the iOS app</strong>, billing is handled by Apple. Manage or cancel in your Apple ID subscription settings at least 24 hours before the period ends. Deleting the app does not cancel a subscription.</li>
    </ul>
    <p>When you cancel, Pro stays active until the end of the period you paid for, and is not renewed. Everything you log stays yours and stays readable. Refunds are covered by the <Link to="/legal/refunds">Refund Policy</Link>.</p>

    <h2>Your data is yours</h2>
    <p>You keep ownership of everything you record. You grant Forge only the permission needed to store it, show it back to you, and generate your recommendations.</p>

    <h2>Forge's content</h2>
    <p>The Forge name, logo, design and software belong to {operatorLabel}. Strava is a trademark of Strava, Inc.; Forge is not affiliated with or endorsed by Strava, Apple, Google or OpenAI.</p>

    <h2>Availability and liability</h2>
    <p>Forge is provided "as is" and "as available", without warranties of any kind, to the fullest extent the law allows. It may be unavailable, and features may change. To the fullest extent the law allows, {operatorLabel} is not liable for indirect or consequential losses, and total liability is limited to the amount you paid for Forge in the twelve months before the claim. Nothing in these terms limits liability that cannot lawfully be limited, or your rights as a consumer under the law where you live.</p>

    <h2>Ending it</h2>
    <p>You can delete your account at any time from <strong>Settings → Plan and billing</strong>. Access may be ended for a serious or repeated breach of these terms. If Forge ends a paid account for any other reason, the unused part of the period will be refunded.</p>

    <h2>Changes to these terms</h2>
    <p>If these terms change materially you will be told in the app before the change takes effect. Continuing to use Forge after that means you accept the new terms; if you do not, you can delete your account.</p>

    {LEGAL.governingState && <>
      <h2>Governing law</h2>
      <p>These terms are governed by the laws of the State of {LEGAL.governingState}, without regard to its conflict-of-law rules, except where the law where you live gives you the right to rely on its own rules.</p>
    </>}

    <BusinessDetails />
  </>;
}

function Cookies() {
  return <>
    <h1>Cookie and Storage Policy</h1>
    <Meta />
    <p>Forge does not use advertising cookies, analytics cookies or tracking pixels, and it does not set any cookies of its own. What it does use is your browser's local storage, only for things the app needs to work. Because all of it is strictly necessary for a service you asked for, no cookie banner is needed — and none is shown.</p>

    <h2>What Forge stores on your device</h2>
    <table className="legal-table">
      <thead><tr><th scope="col">What</th><th scope="col">Why</th><th scope="col">How long</th></tr></thead>
      <tbody>
        <tr><td>Sign-in session (Supabase)</td><td>Keeps you signed in</td><td>Until you sign out</td></tr>
        <tr><td>Working copy of your training, goals, split and settings</td><td>Makes the app fast and lets a workout survive a lost connection until it reaches your account</td><td>Until you delete your account or clear site data</td></tr>
        <tr><td>Appearance (theme, accent, icon)</td><td>Paints the theme you chose before the page appears</td><td>Until you clear site data</td></tr>
        <tr><td>Notification preferences and push registration</td><td>Delivers only the notifications you switched on</td><td>Until you turn them off</td></tr>
        <tr><td>Pending partner invite</td><td>Completes a partner invite link after you sign in</td><td>Until it is used</td></tr>
      </tbody>
    </table>
    <p>If you turn on notifications, your browser also registers a small service worker so they can arrive while Forge is closed. It caches nothing.</p>

    <h2>Other sites</h2>
    <p>When you sign in with Google or Apple, pay with Stripe, or connect Strava, you leave Forge for that company's own page, which may set its own cookies under its own policy.</p>

    <h2>Removing it</h2>
    <p>Signing out ends your session. Deleting your account also clears Forge's training data from that device. To remove everything, clear this site's data in your browser settings, or delete the app.</p>

    <p>Questions go to {mail}.</p>
  </>;
}

function Refunds() {
  return <>
    <h1>Refund Policy</h1>
    <Meta />
    <p>Logging and your training history are free, so nobody has to pay to find out whether Forge works for them. If you buy Pro and it is not what you wanted, this is how to get your money back.</p>

    <h2>Bought on the web (Stripe)</h2>
    <ul>
      <li><strong>Within 14 days of any charge</strong> — the first one or a renewal — email {mail} from your account's address and that charge will be refunded in full, no questions asked. Pro ends when the refund is issued.</li>
      <li><strong>After 14 days</strong>, cancel in <strong>Plan and billing → Manage payment and cancel</strong>. You will not be charged again, and Pro stays active until the end of the period you paid for. Partial periods are not refunded, except where the law requires it.</li>
      <li>Refunds go back to the card you paid with, usually within 5–10 business days depending on your bank.</li>
    </ul>

    <h2>Bought in the iOS app (Apple)</h2>
    <p>Apple processes every App Store payment, and only Apple can refund one. Request it at <a href="https://reportaproblem.apple.com" target="_blank" rel="noreferrer">reportaproblem.apple.com</a>. Apple's decision is final; Forge cannot see or override it.</p>

    <h2>If something went wrong on our side</h2>
    <p>If you were charged twice, charged after cancelling, or lost Pro features you paid for because of a fault in Forge, write to {mail} and it will be put right, whenever it happened.</p>

    <p>This policy does not limit any refund rights you have under the law where you live.</p>
  </>;
}

const DOCUMENTS: Record<string, { label: string; render: () => ReactNode }> = {
  privacy: { label: 'Privacy', render: () => <Privacy /> },
  health: { label: 'Health data', render: () => <HealthData /> },
  terms: { label: 'Terms', render: () => <Terms /> },
  cookies: { label: 'Cookies', render: () => <Cookies /> },
  refunds: { label: 'Refunds', render: () => <Refunds /> },
};

export function LegalPage() {
  const { document: which = 'privacy' } = useParams();
  const current = DOCUMENTS[which] ? which : 'privacy';
  return <main className="legal-page">
    <header className="legal-head">
      <a className="login-brand" href="#/" aria-label="Forge home"><span className="brand-mark" aria-hidden="true"><i /></span></a>
      <nav className="legal-nav" aria-label="Legal documents">
        {Object.entries(DOCUMENTS).map(([key, doc]) =>
          <Link key={key} to={`/legal/${key}`} className={key === current ? 'active' : ''} aria-current={key === current ? 'page' : undefined}>{doc.label}</Link>)}
      </nav>
    </header>
    <article className="legal-body">{DOCUMENTS[current].render()}</article>
    <footer className="legal-foot"><Link to="/"><Icon name="back" size={14}/> Back to Forge</Link></footer>
  </main>;
}
