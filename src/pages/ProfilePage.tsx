import { useEffect, useState } from 'react';
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
import { useAppearance, themeChoices } from '../features/preferences/AppearanceProvider';
import { beginStravaConnection, disconnectStrava, finishStravaConnection, getActivityConnection, syncStravaActivities, type ActivityConnectionStatus } from '../features/training/activityConnectionService';
import { importStravaActivities } from '../features/training/stravaImportService';

type View='profile'|'coach'|'recovery'|'connections'|'appearance'|'billing';
const VIEWS=['profile','coach','recovery','connections','appearance','billing'] as const;
const isView=(value:string|null):value is View=>(VIEWS as readonly string[]).includes(String(value));
export function ProfilePage(){
  const {setup}=useProfileSetup();const {profile,recovery,health}=useAdaptiveTraining();const {goals}=useGoals();const {records,addRecord}=useWorkoutHistory();const {settings:appearance,setTheme,resolved:resolvedTheme}=useAppearance();const [params]=useSearchParams();const requested=params.get('view');const [view,setView]=useState<View>(isView(requested)?requested:'profile');const {notes,upsert}=useAthleteNotes();const {isPro}=useBilling();
  useEffect(()=>{if(isView(requested))setView(requested)},[requested]);const [activity,setActivity]=useState<ActivityConnectionStatus|null>(null);const [connectionMessage,setConnectionMessage]=useState('');const [connectionBusy,setConnectionBusy]=useState(false);const latest=health[health.length-1];const name=setup?.displayName||'Athlete';const initials=name.split(' ').map(part=>part[0]).join('').slice(0,2).toUpperCase();const metric=setup?.units==='Metric';const distanceUnit=metric?'km':'mi';const distanceValue=(miles:number)=>Number((metric?miles*1.609344:miles).toFixed(1));const weeklyDistance=distanceValue(profile.weeklyMileage);const longestDistance=distanceValue(profile.longestRunMiles);
  const loadConnection=async()=>{try{setActivity(await getActivityConnection())}catch(reason){setConnectionMessage(reason instanceof Error?reason.message:'Connection status is unavailable.')}};
  useEffect(()=>{void loadConnection();const params=new URLSearchParams(window.location.search);const code=params.get('code');const state=params.get('state');if(params.get('strava')==='callback'&&code&&state){setView('connections');setConnectionBusy(true);void finishStravaConnection(code,state).then(async()=>{window.history.replaceState({},'',`${window.location.pathname}#/profile`);await syncStravaActivities().catch(()=>null);const merged=await importStravaActivities(records,addRecord).catch(()=>({imported:0}));setConnectionMessage(`Strava connected${merged.imported?` — ${merged.imported} activities added to your training log`:''}. New activities import automatically.`);return loadConnection()}).catch(reason=>setConnectionMessage(reason instanceof Error?reason.message:'Strava could not connect.')).finally(()=>setConnectionBusy(false))}},[]);
  const connectionAction=async(action:'connect'|'sync'|'disconnect')=>{setConnectionBusy(true);setConnectionMessage('');try{if(action==='connect')await beginStravaConnection();if(action==='sync'){const result=await syncStravaActivities();const merged=await importStravaActivities(records,addRecord);setConnectionMessage(merged.imported?`${result.importedActivities||0} activities synced — ${merged.imported} added to your training log.`:`${result.importedActivities||0} activities synced. Your log already has all of them.`)}if(action==='disconnect'){await disconnectStrava();setConnectionMessage('Strava disconnected. Previously imported activity summaries remain in your account.')}await loadConnection()}catch(reason){setConnectionMessage(reason instanceof Error?reason.message:'The connection could not be updated.')}finally{setConnectionBusy(false)}};
  return <div className="stack-xl simple-profile">
    <section className="simple-profile-head"><div className="avatar xlarge">{initials}</div><div><span className="eyebrow">ATHLETE PROFILE</span><h2>{name}</h2><p>{/* Each half stays whole so the line never breaks straight after the separator. */}<span className="nowrap">{setup?.primaryFocus||'Hybrid'} training ·</span> <span className="nowrap">{setup?.scheduleStyle||'Rolling cycle'}</span></p></div>{recovery.confidence!=='Low'&&<div className="profile-ready"><strong>{recovery.readiness}</strong><span>readiness</span></div>}<Link className="button secondary" to="/onboarding">Edit profile</Link></section>
    {/* Plan sits second, not last. Six tabs overflow a 390px phone, and the
        strip scrolls horizontally with no affordance saying so — appended at
        the end, the one screen where an athlete manages their subscription and
        deletes their account was off the right edge and invisible. */}
    <nav className="profile-tabs">{([['profile','Profile'],['billing','Plan'],['coach','Coach'],['recovery','Recovery'],['connections','Connections'],['appearance','Appearance']] as const).map(([key,label])=><button className={view===key?'active':''} onClick={()=>setView(key)} key={key}>{label}</button>)}</nav>
    {view==='billing'&&<BillingSettings/>}
    {view==='coach'&&<div className="stack-l coach-settings"><NotificationSettings/><CoachBodyLog notes={notes} upsert={upsert}/></div>}
    {view==='profile'&&<><section className="simple-profile-stats"><div><span>WORKOUTS</span><strong>{records.length}</strong></div><div><span>WEEKLY RUNNING</span><strong>{weeklyDistance} {distanceUnit}</strong></div><div><span>LONGEST RUN</span><strong>{longestDistance} {distanceUnit}</strong></div><div><span>ACTIVE GOALS</span><strong>{goals.length}</strong></div></section><section className="simple-settings-list"><Link to="/plan?view=split"><div><strong>Split</strong><span>Training and rest-day structure</span></div><b>›</b></Link><Link to="/history"><div><strong>History</strong><span>Calendar and every completed day</span></div><b>›</b></Link><Link to="/exercises"><div><strong>Exercise library</strong><span>Browse every movement Forge knows</span></div><b>›</b></Link>{/* A second way in, because the tab strip scrolls and the row that
            handles money and account deletion should not depend on someone
            discovering that. */}
<button type="button" onClick={()=>setView('billing')}><div><strong>Plan and billing</strong><span>{isPro?'Forge Pro':'Forge Free'} · usage, payment and account</span></div><b>›</b></button></section></>}
    {view==='recovery'&&<><section className="simple-recovery"><div><span className="eyebrow">SMARTWATCH RECOVERY</span><h3>{recovery.confidence==='Low'?'No smartwatch data synced':recovery.hardTrainingAllowed?'Recovery supports the plan':'Recovery safeguard active'}</h3><p>{recovery.confidence==='Low'?'Forge will ignore sleep, HRV, resting heart rate, and readiness until verified watch data is available. Your workout history and goals still guide training.':recovery.reasons.join(' · ')}</p></div><strong>{recovery.confidence==='Low'?'—':recovery.readiness}</strong></section>{recovery.confidence==='Low'?<section className="card wearable-empty"><div><span className="eyebrow">NO DEVICE SIGNAL</span><h3>Connect a smartwatch to use recovery</h3><p>Health data is read-only and automatically synced. There is no manual recovery entry, and Forge never fills missing health values with guesses.</p></div><button className="button secondary" onClick={()=>setView('connections')}>View connections</button></section>:<section className="simple-profile-stats"><div><span>SLEEP</span><strong>{Math.round(latest.sleepMinutes/6)/10} hr</strong></div><div><span>HRV</span><strong>{latest.hrvRmssd??'—'} ms</strong></div><div><span>RESTING HR</span><strong>{latest.restingHr??'—'}</strong></div><div><span>LAST SYNC</span><strong>{latest.provider}</strong></div></section>}</>}
    {view==='connections'&&<div className="connection-stack"><section className="simple-connections activity-connection"><header><div><span className="eyebrow">REAL ACTIVITY IMPORT</span><h3>Connect through Strava</h3><p>Import recorded runs, rides, rows, and other activities from watches that sync to Strava.</p></div><span className={activity?.connected?'connection-pill connected':'connection-pill'}>{activity?.connected?'Connected':activity?.configured===false?'Setup needed':'Not connected'}</span></header><article><div><strong>{activity?.athleteName||'Strava activity sync'}</strong><span>{activity?.connected?`${activity.importedActivities||0} activities stored${activity.lastSyncedAt?` · last sync ${new Date(activity.lastSyncedAt).toLocaleDateString()}`:''}`:'Workout data only — Strava does not supply complete sleep or HRV recovery data.'}</span></div><div className="connection-actions">{activity?.connected?<><button disabled={connectionBusy} onClick={()=>void connectionAction('sync')}>Sync now</button><button className="danger" disabled={connectionBusy} onClick={()=>void connectionAction('disconnect')}>Disconnect</button></>:<button className="button" disabled={connectionBusy||activity?.configured===false} onClick={()=>void connectionAction('connect')}>Connect Strava</button>}</div></article>{connectionMessage&&<p className="connection-message">{connectionMessage}</p>}{activity?.configured===false&&<p className="connection-message">The app side is built, but the Strava client credentials still need to be added in Supabase before this button can open authorization.</p>}</section><section className="simple-connections"><header><div><span className="eyebrow">RECOVERY DATA</span><h3>Direct smartwatch recovery</h3><p>Sleep, HRV, and resting heart rate require a native phone bridge or an approved device partnership.</p></div></header>{wearableConnections.map(item=><article key={item.provider}><div><strong>{item.provider}</strong><span>{item.capabilities.join(' · ')}</span></div><b>{item.provider===latest.provider?'Connected':item.status}</b></article>)}</section></div>}
    {view==='appearance'&&<section className="theme-picker">
      <header>
        <span className="eyebrow">APPEARANCE</span>
        <h2>Light or dark</h2>
        <p>One choice, applied everywhere. It saves to your account, so a new phone opens looking the same.</p>
      </header>
      <div className="theme-grid" role="radiogroup" aria-label="Appearance">
        {themeChoices.map(choice=>{
          const active=appearance.theme===choice.id;
          return <button type="button" key={choice.id} role="radio" aria-checked={active}
            className={active?'theme-card active':'theme-card'} onClick={()=>setTheme(choice.id)}>
            {/* A miniature of the app — ground, card, accent bar, two lines of
                text — in the palette this option would switch to. Enough to
                judge a tone at a glance without pretending to be a screenshot. */}
            <span className={`theme-swatch theme-swatch-${choice.id}`} aria-hidden="true">
              {choice.id==='system'
                ? <>
                    <span className="ts-half theme-swatch-dark"><span className="ts-bar"/><span className="ts-line"/><span className="ts-line short"/></span>
                    <span className="ts-half theme-swatch-light"><span className="ts-bar"/><span className="ts-line"/><span className="ts-line short"/></span>
                  </>
                : <><span className="ts-bar"/><span className="ts-line"/><span className="ts-line short"/></>}
            </span>
            <span className="theme-meta">
              <strong>{choice.name}</strong>
              <small>{choice.description}</small>
              {active&&<em>{choice.id==='system'?`ON — currently ${resolvedTheme}`:'ON'}</em>}
            </span>
          </button>;
        })}
      </div>
    </section>}
  </div>;
}
