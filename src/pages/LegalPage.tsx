import { Link, useParams } from 'react-router-dom';

/* App Store Review Guideline 5.1.1(i) requires the privacy policy to be
   reachable INSIDE the app, not only as a URL in App Store Connect metadata,
   and to state three things explicitly: what is collected and every use of it,
   that third parties handling it give equal protection, and how retention,
   deletion and consent withdrawal work.

   These pages sit outside the authenticated routes on purpose — a reviewer,
   and anyone deciding whether to sign up at all, has to be able to read them
   without an account. The content describes what the code in this repository
   actually does; when the code changes, this changes with it. */

const UPDATED = 'August 2026';
const CONTACT = 'prestonnoland2020@gmail.com';

function Privacy() {
  return <>
    <h1>Privacy Policy</h1>
    <p className="legal-meta">Last updated {UPDATED}</p>

    <p>Forge is a training log. It exists to record what you actually did in the gym and on the road, and to coach the progression from there. This page says exactly what it stores, who else ever sees it, and how to get rid of it.</p>

    <h2>What Forge collects</h2>
    <ul>
      <li><strong>Your account.</strong> When you sign in with Google or Apple, Forge receives your email address, your display name and, if your provider supplies one, your avatar image. Nothing else. If you use Sign in with Apple and choose to hide your email, Forge only ever sees the private relay address.</li>
      <li><strong>Your training.</strong> Workouts, top sets, cardio sessions, your split, goals, personal records and any body weight you enter.</li>
      <li><strong>What you tell the coach.</strong> Questions you ask Forge Coach, and any injury, pain or fatigue notes you record so training can work around them.</li>
      <li><strong>Connected activity.</strong> If you connect Strava, Forge imports the activity summaries you choose to import — type, distance, duration, pace, heart rate where present.</li>
      <li><strong>Subscription state.</strong> Whether your account is on Free or Pro, when the period ends, and how many Forge AI requests you have made. Forge never receives or stores card numbers.</li>
    </ul>

    <h2>What Forge does not collect</h2>
    <p>There is no advertising SDK, no analytics tracker, and no third-party behavioural profiling in this app. Forge does not sell data, does not share it with advertisers, and does not build a profile of you for anyone else's purposes. There is no access to your contacts, photos, microphone or precise location.</p>

    <h2>How it is used</h2>
    <ul>
      <li>To show you your own training history and progress.</li>
      <li>To generate your recommendations and programs. Deterministic calculations run on your device; coaching answers and program generation send the relevant slice of your training data to our AI provider (see below).</li>
      <li>To enforce the fair-use limits on Forge AI, which is why request counts are stored.</li>
      <li>To operate a subscription if you buy one.</li>
    </ul>
    <p>Your training data is not used to train anybody's machine-learning model.</p>

    <h2>Who else processes it</h2>
    <p>Forge uses a small number of processors, each contractually required to protect your data to the same standard described here:</p>
    <ul>
      <li><strong>Supabase</strong> — authentication and database hosting. Your records live here. Every table is protected by row-level security scoped to your account, so one athlete's data is not readable by another.</li>
      <li><strong>OpenAI</strong> — coaching answers and program generation. Requests are sent from our server, never from your device, and are sent with storage disabled and with a pseudonymous identifier rather than your email. OpenAI does not use API data to train its models.</li>
      <li><strong>Stripe</strong> — subscription payments on the web. Card details go directly to Stripe and never touch Forge's servers or database.</li>
      <li><strong>Apple</strong> — subscription payments made inside the iOS app. Apple tells Forge only that a valid subscription exists and when it expires.</li>
      <li><strong>Strava</strong> — only if you connect it. Your Strava tokens are held server-side in a schema that is not reachable from the app, and are never sent to your browser or phone.</li>
    </ul>

    <h2>How long it is kept</h2>
    <p>Your training data is kept for as long as your account exists, because a training log with a retention limit is not a training log. Forge AI request counts are kept for the current and previous month for fair-use accounting. Deleted accounts are removed immediately, as described next.</p>

    <h2>Deleting your account</h2>
    <p>Open <strong>Profile → Plan → Delete my account</strong> inside the app. This permanently removes your profile, every workout, top set, cardio session, goal, note and connection, along with any stored Strava tokens. It is immediate and it cannot be undone. Forge keeps no shadow copy.</p>
    <p>Deleting your Forge account does not cancel an App Store subscription. Cancel that in your Apple ID subscription settings first, or Apple will keep billing you.</p>
    <p>You can withdraw consent for Strava at any time without deleting anything else, using <strong>Disconnect</strong> on the Connections tab.</p>

    <h2>Your rights</h2>
    <p>You can access, correct, export or delete your data. Access and correction are built into the app; for an export or any other request, write to {CONTACT} and you will get an answer within 30 days.</p>

    <h2>Children</h2>
    <p>Forge is for adults. It is not directed at anyone under 18, and accounts are not knowingly created for them.</p>

    <h2>Health</h2>
    <p>Forge is a training log and a coaching tool. It is not a medical device and it does not provide medical advice, diagnosis or treatment. Its recommendations are generated from the workouts you record. Talk to a physician before starting or changing a training program.</p>

    <h2>Changes</h2>
    <p>If this policy changes materially you will be told in the app before the change takes effect. Questions go to {CONTACT}.</p>
  </>;
}

function Terms() {
  return <>
    <h1>Terms of Use</h1>
    <p className="legal-meta">Last updated {UPDATED}</p>

    <h2>What you are agreeing to</h2>
    <p>Forge is a training log and coaching tool provided as-is. By creating an account you agree to these terms. You must be 18 or older to use it.</p>

    <h2>Training carries real risk</h2>
    <p><strong>Forge is not a medical service and does not give medical advice.</strong> Strength and endurance training can cause injury. Check with a physician before starting or changing a program — particularly with a heart condition, an existing injury, a chronic illness, or during pregnancy. Stop any exercise that causes pain, dizziness or unusual shortness of breath, and seek professional care for anything that does not resolve.</p>
    <p>Every recommendation Forge makes is generated from what you have recorded. You are responsible for judging whether a given load, pace or movement is safe for you on the day. Forge's suggestions are a starting point for that judgement, never a substitute for it.</p>

    <h2>Your account</h2>
    <p>Keep your sign-in secure; you are responsible for activity on your account. Do not use Forge to break the law, to attack the service, or to attempt to reach another athlete's data.</p>

    <h2>Forge AI fair use</h2>
    <p>Coaching answers and program generation cost real money per request, so both are subject to daily and monthly limits that depend on your plan. Current limits are always visible on <strong>Profile → Plan</strong>. Automated or scripted use of these endpoints is not permitted and may end your access.</p>

    <h2>Subscriptions</h2>
    <p>Forge Pro is billed monthly or annually and renews automatically until cancelled. On the web, billing is handled by Stripe and you can cancel from the billing portal. In the iOS app, billing is handled by Apple: manage or cancel it in your Apple ID subscription settings at least 24 hours before the period ends, since deleting the app does not cancel a subscription. Refunds for App Store purchases are handled by Apple under their policy.</p>
    <p>Everything you log stays free. If you cancel Pro, your entire history remains yours and remains readable.</p>

    <h2>Your data is yours</h2>
    <p>You keep ownership of everything you record. You grant Forge only the permission needed to store it, show it back to you, and generate your recommendations. See the <Link to="/legal/privacy">Privacy Policy</Link> for the detail.</p>

    <h2>Availability and liability</h2>
    <p>Forge is provided without warranty of any kind. It may be unavailable, and features may change. To the fullest extent the law allows, liability is limited to the amount you paid in the twelve months before the claim. Nothing here limits liability that cannot lawfully be limited.</p>

    <h2>Ending it</h2>
    <p>You can delete your account at any time from <strong>Profile → Plan</strong>. Access may be ended for a serious or repeated breach of these terms.</p>

    <h2>Contact</h2>
    <p>{CONTACT}</p>
  </>;
}

export function LegalPage() {
  const { document: which } = useParams();
  const isTerms = which === 'terms';
  return <main className="legal-page">
    <header className="legal-head">
      <a className="login-brand" href="#/" aria-label="Forge home"><span className="brand-mark"><i /></span><span>FORGE</span></a>
      <nav className="legal-nav">
        <Link to="/legal/privacy" className={isTerms ? '' : 'active'}>Privacy</Link>
        <Link to="/legal/terms" className={isTerms ? 'active' : ''}>Terms</Link>
      </nav>
    </header>
    <article className="legal-body">{isTerms ? <Terms /> : <Privacy />}</article>
    <footer className="legal-foot"><Link to="/">← Back to Forge</Link></footer>
  </main>;
}
