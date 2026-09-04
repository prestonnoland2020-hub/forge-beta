import { useEffect, useState } from 'react';
import { useAuth } from '../features/auth/AuthProvider';
import { Link, useSearchParams } from 'react-router-dom';
import { NotificationSettings } from '../components/NotificationSettings';
import { BillingSettings } from '../components/BillingSettings';
import { useBilling } from '../features/billing/BillingProvider';
import { CoachBodyLog } from '../components/CoachBodyLog';
import { useAthleteNotes } from '../features/training/useAthleteNotes';
import { useAdaptiveTraining } from '../features/training/AdaptiveTrainingProvider';
import { wearableConnections } from '../features/training/wearableService';
import { useGoals } from '../features/goals/GoalsProvider';
import { useWorkoutHistory } from '../features/training/WorkoutHistoryProvider';
import { useProfileSetup } from '../features/profile/ProfileSetupProvider';
import { useAppearance, themeChoices, groundChoices, accentChoices } from '../features/preferences/AppearanceProvider';
import { beginStravaConnection, disconnectStrava, finishStravaConnection, getActivityConnection, syncStravaActivities, type ActivityConnectionStatus } from '../features/training/activityConnectionService';
import { importStravaActivities } from '../features/training/stravaImportService';

type View='profile'|'settings'|'coach'|'connections'|'appearance'|'billing'|'devices'|'faq';
const VIEWS=['profile','settings','coach','connections','appearance','billing','devices','faq'] as const;
const isView=(value:string|null):value is View=>(VIEWS as readonly string[]).includes(String(value));
export function ProfilePage(){
  const {user,signOut}=useAuth();const {setup}=useProfileSetup();const {profile,recovery,health}=useAdaptiveTraining();const {goals}=useGoals();const {records,addRecord}=useWorkoutHistory();const {settings:appearance,setTheme,setGround,setAccent,setIcon,resolved:resolvedTheme,resolvedIcon}=useAppearance();/* THE VIEW LIVES IN THE URL. The app header names the sub-screen and draws
     its back arrow from `?view=`, so switching views here has to go through
     the address — a local state the header could not see left it saying
     "Profile" over the appearance settings. */
  const [params,setParams]=useSearchParams();const requested=params.get('view');const view:View=isView(requested)?requested:'profile';const setView=(next:View)=>setParams(next==='profile'?{}:{view:next});const {notes,upsert}=useAthleteNotes();const {isPro}=useBilling();
  const [activity,setActivity]=useState<ActivityConnectionStatus|null>(null);const [connectionMessage,setConnectionMessage]=useState('');const [connectionBusy,setConnectionBusy]=useState(false);const latest=health[health.length-1];const name=setup?.displayName||'Athlete';const initials=name.split(' ').map(part=>part[0]).join('').slice(0,2).toUpperCase();const metric=setup?.units==='Metric';const distanceUnit=metric?'km':'mi';const distanceValue=(miles:number)=>Number((metric?miles*1.609344:miles).toFixed(1));const weeklyDistance=distanceValue(profile.weeklyMileage);const longestDistance=distanceValue(profile.longestRunMiles);
  const loadConnection=async()=>{try{setActivity(await getActivityConnection())}catch(reason){setConnectionMessage(reason instanceof Error?reason.message:'Connection status is unavailable.')}};
  useEffect(()=>{void loadConnection();const params=new URLSearchParams(window.location.search);const code=params.get('code');const state=params.get('state');if(params.get('strava')==='callback'&&code&&state){setView('connections');setConnectionBusy(true);void finishStravaConnection(code,state).then(async()=>{window.history.replaceState({},'',`${window.location.pathname}#/profile`);await syncStravaActivities().catch(()=>null);const merged=await importStravaActivities(records,addRecord).catch(()=>({imported:0}));setConnectionMessage(`Strava connected${merged.imported?` — ${merged.imported} activities added to your training log`:''}. New activities import automatically.`);return loadConnection()}).catch(reason=>setConnectionMessage(reason instanceof Error?reason.message:'Strava could not connect.')).finally(()=>setConnectionBusy(false))}},[]);
  const connectionAction=async(action:'connect'|'sync'|'disconnect')=>{setConnectionBusy(true);setConnectionMessage('');try{if(action==='connect')await beginStravaConnection();if(action==='sync'){const result=await syncStravaActivities();const merged=await importStravaActivities(records,addRecord);setConnectionMessage(merged.imported?`${result.importedActivities||0} activities synced — ${merged.imported} added to your training log.`:`${result.importedActivities||0} activities synced. Your log already has all of them.`)}if(action==='disconnect'){await disconnectStrava();setConnectionMessage('Strava disconnected. Previously imported activity summaries remain in your account.')}await loadConnection()}catch(reason){setConnectionMessage(reason instanceof Error?reason.message:'The connection could not be updated.')}finally{setConnectionBusy(false)}};
  return <div className="stack-xl simple-profile">
    {view==='profile'&&<section className="simple-profile-head"><div className="avatar xlarge">{initials}</div><div><span className="eyebrow">ATHLETE PROFILE</span><h2>{name}</h2><p>{/* Each half stays whole so the line never breaks straight after the separator. */}<span className="nowrap">{setup?.primaryFocus||'Hybrid'} training ·</span> <span className="nowrap">{setup?.scheduleStyle||'Rolling cycle'}</span></p></div>{recovery.confidence!=='Low'&&<div className="profile-ready"><strong>{recovery.readiness}</strong><span>readiness</span></div>}<Link className="button secondary" to="/onboarding" state={{from:'/profile'}}>Edit profile</Link></section>}
    {/* SETTINGS IS THE GEAR'S SCREEN: everything about the app rather than
        the athlete. The tab strip that used to sit under the profile head
        overflowed a phone and hid the billing tab off its right edge; a list
        cannot hide anything. */}
    {view==='settings'&&<section className="simple-settings-list">
      <button type="button" onClick={()=>setView('appearance')}><div><strong>Appearance</strong><span>Light or dark, ground, accent and app icon</span></div><b>›</b></button>
      <button type="button" onClick={()=>setView('coach')}><div><strong>Coach &amp; notifications</strong><span>Check-ins, reminders and what Forge trains around</span></div><b>›</b></button>
      <button type="button" onClick={()=>setView('connections')}><div><strong>Connections</strong><span>{activity?.connected?'Strava connected':'Strava — import runs, rides and rows'}</span></div><b>›</b></button>
      <button type="button" onClick={()=>setView('devices')}><div><strong>Recovery &amp; smartwatch</strong><span>Readiness data and device connections</span></div><b>›</b></button>
      <button type="button" onClick={()=>setView('billing')}><div><strong>Plan and billing</strong><span>{isPro?'Forge Pro':'Forge Free'} · usage, payment and account</span></div><b>›</b></button>
      <button type="button" onClick={()=>setView('faq')}><div><strong>FAQ</strong><span>How Forge measures, plans and protects your training</span></div><b>›</b></button>
    </section>}
    {/* A way out. There was no sign-out anywhere — the only exit was deleting
        the account — so a shared phone or a wrong Google account was stuck. */}
    {view==='settings'&&<section className="simple-settings-list">
      <button type="button" onClick={()=>{if(window.confirm('Sign out of Forge on this device? Your training is saved to your account.'))void signOut().catch(reason=>setConnectionMessage(reason instanceof Error?reason.message:'Could not sign out.'))}}><div><strong>Sign out</strong><span>{user?.email||'Signed in'}</span></div><b>›</b></button>
      {connectionMessage&&view==='settings'&&<p className="connection-message">{connectionMessage}</p>}
    </section>}
    {view==='billing'&&<BillingSettings/>}
    {view==='coach'&&<div className="stack-l coach-settings"><NotificationSettings/><CoachBodyLog notes={notes} upsert={upsert}/></div>}
    {view==='profile'&&<><section className="simple-profile-stats"><div><span>WORKOUTS</span><strong>{records.length}</strong></div><div><span>WEEKLY RUNNING</span><strong>{weeklyDistance} {distanceUnit}</strong></div><div><span>LONGEST RUN</span><strong>{longestDistance} {distanceUnit}</strong></div><div><span>ACTIVE GOALS</span><strong>{goals.length}</strong></div></section><section className="simple-settings-list"><Link to="/split"><div><strong>Split</strong><span>Training and rest-day structure</span></div><b>›</b></Link><Link to="/history"><div><strong>Activities</strong><span>Calendar and every completed day</span></div><b>›</b></Link><Link to="/exercises"><div><strong>Exercise library</strong><span>Browse every movement Forge knows</span></div><b>›</b></Link><button type="button" onClick={()=>setView('settings')}><div><strong>Settings</strong><span>Appearance, coach, connections, recovery, billing, FAQ</span></div><b>›</b></button></section></>}
    {view==='devices'&&<><section className="simple-recovery"><div><span className="eyebrow">SMARTWATCH RECOVERY</span><h3>{recovery.confidence==='Low'?'No smartwatch data synced':recovery.hardTrainingAllowed?'Recovery supports the plan':'Recovery safeguard active'}</h3><p>{recovery.confidence==='Low'?'Forge will ignore sleep, HRV, resting heart rate, and readiness until verified watch data is available. Your workout history and goals still guide training.':recovery.reasons.join(' · ')}</p></div><strong>{recovery.confidence==='Low'?'—':recovery.readiness}</strong></section>{recovery.confidence==='Low'?<section className="card wearable-empty"><div><span className="eyebrow">NO DEVICE SIGNAL</span><h3>Connect a smartwatch to use recovery</h3><p>Health data is read-only and automatically synced. There is no manual recovery entry, and Forge never fills missing health values with guesses.</p></div><button className="button secondary" onClick={()=>setView('connections')}>View connections</button></section>:<section className="simple-profile-stats"><div><span>SLEEP</span><strong>{Math.round(latest.sleepMinutes/6)/10} hr</strong></div><div><span>HRV</span><strong>{latest.hrvRmssd??'—'} ms</strong></div><div><span>RESTING HR</span><strong>{latest.restingHr??'—'}</strong></div><div><span>LAST SYNC</span><strong>{latest.provider}</strong></div></section>}<section className="simple-connections"><header><div><span className="eyebrow">RECOVERY DATA</span><h3>Direct smartwatch recovery</h3><p>Sleep, HRV, and resting heart rate require a native phone bridge or an approved device partnership.</p></div></header>{wearableConnections.map(item=><article key={item.provider}><div><strong>{item.provider}</strong><span>{item.capabilities.join(' · ')}</span></div><b>{item.provider===latest.provider?'Connected':item.status}</b></article>)}</section></>}
    {view==='connections'&&<div className="connection-stack"><section className="simple-connections activity-connection"><header><div><span className="eyebrow">REAL ACTIVITY IMPORT</span><h3>Connect through Strava</h3><p>Import recorded runs, rides, rows, and other activities from watches that sync to Strava.</p></div><span className={activity?.connected?'connection-pill connected':'connection-pill'}>{activity?.connected?'Connected':activity?.configured===false?'Setup needed':'Not connected'}</span></header><article><div><strong>{activity?.athleteName||'Strava activity sync'}</strong><span>{activity?.connected?`${activity.importedActivities||0} activities stored${activity.lastSyncedAt?` · last sync ${new Date(activity.lastSyncedAt).toLocaleDateString()}`:''}`:'Workout data only — Strava does not supply complete sleep or HRV recovery data.'}</span></div><div className="connection-actions">{activity?.connected?<><button disabled={connectionBusy} onClick={()=>void connectionAction('sync')}>Sync now</button><button className="danger" disabled={connectionBusy} onClick={()=>void connectionAction('disconnect')}>Disconnect</button></>:<button className="button" disabled={connectionBusy||activity?.configured===false} onClick={()=>void connectionAction('connect')}>Connect Strava</button>}</div></article>{connectionMessage&&<p className="connection-message">{connectionMessage}</p>}{activity?.configured===false&&<p className="connection-message">Strava connections aren’t switched on for this build yet. Check back after the next update.</p>}</section></div>}
    {view==='faq'&&<div className="profile-faq stack-l">
      <section className="card"><span className="eyebrow">FAQ</span><h3>How Forge works</h3><p>The explanations that used to sit on every screen, in one place.</p></section>
      {[
        ['What is a top set?','The one heaviest meaningful set per lift. Warmups, back-offs and accessories are yours to train — the top set is what Forge measures progress from, and every saved one gets a calculated max.'],
        ['What is a calculated max?','An estimate of what you could lift for one rep, from any completed set — heavier or more reps means a higher number. A single (1 rep) is a real 1RM, not an estimate, and it is the only set a Real 1RM goal counts. Forge writes each week of the wave from your closest real evidence: your heavy weeks come from your heavy sets, not from stretching an 8-rep set down to a double.'],
        ['How does the plan pick my numbers?','A 10-week block of 8/6/4/2/1 waves built from your logged bests. Beat a set and the wave rises; miss one and it holds. Max week tests only lifts you hold a Real 1RM goal on — the attempt is your last real single plus 5–10 lb, and never below the heavy double you just did.'],
        ['How is my weekly running planned?','It ramps from what you actually run toward the ceiling you set in your split, deloading on every 2-rep week. The long run is capped at a sane share of the week and near your longest logged run.'],
        ['What does recovery data change?','With a smartwatch synced through a supported bridge, sleep, HRV and resting heart rate shape the readiness score and can soften hard days. Without one, Forge ignores recovery entirely — it never guesses missing health data.'],
        ['What does Strava add?','Recorded runs, rides and rows import automatically into your training log and count toward mileage and endurance goals. Strava does not supply sleep or HRV.'],
        ['What changes my split cursor?','Completing real training on a recommended day advances the cycle. A body-weight check-in or a note never consumes the workout you still owe.'],
      ].map(([q,a])=><details className="card faq-item" key={q}><summary>{q}</summary><p>{a}</p></details>)}
    </div>}
    {view==='appearance'&&<div className="appearance">
      {/* Three sections, in the order they matter: the ground you read on,
          then the one colour that is not neutral, then what sits on the home
          screen. Each previews itself from the real thing. */}
      <section className="appearance-section">
        <header>
          <span className="eyebrow">APPEARANCE · TONE</span>
          <h2>Light or dark</h2>
          <p>One choice, applied everywhere. It saves to your account, so a new phone opens looking the same.</p>
        </header>
        <div className="theme-grid" role="radiogroup" aria-label="Tone">
          {themeChoices.map(choice=>{
            const active=appearance.theme===choice.id;
            return <button type="button" key={choice.id} role="radio" aria-checked={active}
              className={active?'pick-card active':'pick-card'} onClick={()=>setTheme(choice.id)}>
              {/* data-force-tone puts the OTHER tone's ladder on the element
                  itself — custom properties inherit, so the swatch renders in a
                  tone the page is not in without a single hardcoded hex, and it
                  follows the athlete's chosen ground for free. */}
              <span className={`theme-swatch theme-swatch-${choice.id}`} aria-hidden="true"
                data-ground={appearance.ground}
                data-force-tone={choice.id==='system'?undefined:choice.id}>
                {choice.id==='system'
                  ? <>
                      <span className="ts-half" data-ground={appearance.ground} data-force-tone="dark"><span className="ts-bar"/><span className="ts-line"/><span className="ts-line short"/></span>
                      <span className="ts-half" data-ground={appearance.ground} data-force-tone="light"><span className="ts-bar"/><span className="ts-line"/><span className="ts-line short"/></span>
                    </>
                  : <><span className="ts-bar"/><span className="ts-line"/><span className="ts-line short"/></>}
              </span>
              <span className="pick-meta">
                <strong>{choice.name}</strong>
                <small>{choice.description}</small>
                {active&&<em>{choice.id==='system'?`ON — currently ${resolvedTheme}`:'ON'}</em>}
              </span>
            </button>;
          })}
        </div>
      </section>

      <section className="appearance-section">
        <header>
          <span className="eyebrow">APPEARANCE · GROUND</span>
          <h2>What it&rsquo;s built from</h2>
          <p>Tone is how bright the app is. Ground is what the greys are made of. Every ground uses the same steps of lightness, so this one is purely a matter of taste &mdash; nothing here can make anything harder to read.</p>
        </header>
        <div className="ground-grid" role="radiogroup" aria-label="Ground">
          {groundChoices.map(choice=>{
            const active=appearance.ground===choice.id;
            return <button type="button" key={choice.id} role="radio" aria-checked={active}
              className={active?'pick-card ground-card active':'pick-card ground-card'}
              onClick={()=>setGround(choice.id)}>
              {/* Both tones at once. A ground's character is mostly in its
                  dark ladder — the light ones are damped on purpose — so a
                  swatch showing only the tone you are currently in would make
                  Carbon and Ink look identical and the choice arbitrary.
                  data-ground + data-force-tone put the real ladders on these
                  elements, so this is the ground, not a picture of it. */}
              <span className="ground-swatch" aria-hidden="true">
                <span className="gs-half" data-ground={choice.id} data-force-tone="dark"><i/><i/></span>
                <span className="gs-half" data-ground={choice.id} data-force-tone="light"><i/><i/></span>
              </span>
              <span className="pick-meta">
                <strong>{choice.name}</strong>
                <small>{choice.description}</small>
                {active&&<em>ON</em>}
              </span>
            </button>;
          })}
        </div>
      </section>

      <section className="appearance-section">
        <header>
          <span className="eyebrow">APPEARANCE · ACCENT</span>
          <h2>Your colour</h2>
          <p>The one colour in Forge that is not a shade of grey. It marks what is yours — today&rsquo;s lift, your line on a chart, the button that starts the set.</p>
        </header>
        <div className="accent-grid" role="radiogroup" aria-label="Accent">
          {accentChoices.map(choice=>{
            const active=appearance.accent===choice.id;
            return <button type="button" key={choice.id} role="radio" aria-checked={active}
              className={active?'pick-card accent-card active':'pick-card accent-card'}
              onClick={()=>setAccent(choice.id)}>
              {/* data-accent scopes the real tokens to this element, so the chip
                  is the accent rather than a hand-picked stand-in for it — and it
                  is drawn in the tone the athlete is currently reading in. */}
              <span className="accent-swatch" data-accent={choice.id} aria-hidden="true">
                <i/><b>AA</b>
              </span>
              <span className="pick-meta">
                <strong>{choice.name}</strong>
                <small>{choice.description}</small>
                {active&&<em>ON</em>}
              </span>
            </button>;
          })}
        </div>
        <p className="appearance-note">Every accent is checked against both grounds before it ships: the text and the buttons clear WCAG AA at 4.5:1 whichever tone you pair it with. None of these is a worse app than another.</p>
      </section>

      <section className="appearance-section">
        <header>
          <span className="eyebrow">APPEARANCE · APP ICON</span>
          <h2>Home screen</h2>
          <p>Which Forge sits on your phone. Matching your accent is the default, so this changes with your colour unless you pin one.</p>
        </header>
        <div className="icon-grid" role="radiogroup" aria-label="App icon">
          <button type="button" role="radio" aria-checked={appearance.icon==='match'}
            className={appearance.icon==='match'?'pick-card icon-card active':'pick-card icon-card'}
            onClick={()=>setIcon('match')}>
            <span className="icon-stack" aria-hidden="true">
              {/* The resolved icon sits in front, flanked by two others, so the
                  tile reads as "whichever one you pick" instead of a sixth icon. */}
              <img src={`./icons/${resolvedIcon==='signal'?'flare':'signal'}/icon-192.png`} alt=""/>
              <img src={`./icons/${resolvedIcon==='amber'?'tide':'amber'}/icon-192.png`} alt=""/>
              <img src={`./icons/${resolvedIcon}/icon-192.png`} alt=""/>
            </span>
            <strong>Match accent</strong>
            <small>{accentChoices.find(choice=>choice.id===resolvedIcon)?.name}</small>
          </button>
          {accentChoices.map(choice=>{
            const active=appearance.icon===choice.id;
            return <button type="button" key={choice.id} role="radio" aria-checked={active}
              className={active?'pick-card icon-card active':'pick-card icon-card'}
              onClick={()=>setIcon(choice.id)}>
              <img src={`./icons/${choice.id}/icon-192.png`} alt="" aria-hidden="true"/>
              <strong>{choice.name}</strong>
              <small>{active?'On your phone':'\u00a0'}</small>
            </button>;
          })}
        </div>
      </section>
    </div>}
  </div>;
}
