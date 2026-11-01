import { useEffect, useState } from 'react';
import { useAuth } from '../features/auth/AuthProvider';
import { Link, useSearchParams } from 'react-router-dom';
import { NotificationSettings } from '../components/NotificationSettings';
import { BillingSettings } from '../components/BillingSettings';
import { HelpFaq } from '../components/HelpFaq';
import { useBilling } from '../features/billing/BillingProvider';
import { CoachBodyLog } from '../components/CoachBodyLog';
import { useAthleteNotes } from '../features/training/useAthleteNotes';
import { useAdaptiveTraining } from '../features/training/AdaptiveTrainingProvider';
import { connectionCatalog } from '../features/training/connectionCatalog';
import { BrandMark } from '../features/training/brandLogos';
import { useGoals } from '../features/goals/GoalsProvider';
import { useWorkoutHistory } from '../features/training/WorkoutHistoryProvider';
import { useProfileSetup } from '../features/profile/ProfileSetupProvider';
import { useAppearance } from '../features/preferences/AppearanceProvider';
import { beginStravaConnection, disconnectStrava, finishStravaConnection, getActivityConnection, syncStravaActivities, type ActivityConnectionStatus } from '../features/training/activityConnectionService';
import { importStravaActivities } from '../features/training/stravaImportService';
import { beginGarminConnection, disconnectGarmin, finishGarminConnection, getGarminConnection, loadGarminHealth, syncGarmin, type GarminConnectionStatus } from '../features/training/garminConnectionService';

type View='profile'|'settings'|'coach'|'connections'|'billing'|'faq';
const VIEWS=['profile','settings','coach','connections','billing','faq'] as const;
const isView=(value:string|null):value is View=>(VIEWS as readonly string[]).includes(String(value));
export function ProfilePage(){
  const {user,signOut}=useAuth();const {setup}=useProfileSetup();const {profile,recovery,health,syncWearableHealth}=useAdaptiveTraining();const {goals}=useGoals();const {records,addRecord,updateRecord}=useWorkoutHistory();const {setTheme,resolved:resolvedTheme}=useAppearance();/* THE VIEW LIVES IN THE URL. The app header names the sub-screen and draws
     its back arrow from `?view=`, so switching views here has to go through
     the address — a local state the header could not see left it saying
     "Profile" over the appearance settings. */
  const [params,setParams]=useSearchParams();const requested=params.get('view');const view:View=requested==='devices'?'connections':requested==='appearance'?'settings':isView(requested)?requested:'profile';const setView=(next:View)=>setParams(next==='profile'?{}:{view:next});const {notes,upsert}=useAthleteNotes();const {isPro}=useBilling();
  const [activity,setActivity]=useState<ActivityConnectionStatus|null>(null);const [connectionMessage,setConnectionMessage]=useState('');const [connectionBusy,setConnectionBusy]=useState(false);const latest=health[health.length-1];const name=setup?.displayName||'Athlete';const initials=name.split(' ').map(part=>part[0]).join('').slice(0,2).toUpperCase();const metric=setup?.units==='Metric';const distanceUnit=metric?'km':'mi';const distanceValue=(miles:number)=>Number((metric?miles*1.609344:miles).toFixed(1));const weeklyDistance=distanceValue(profile.weeklyMileage);const longestDistance=distanceValue(profile.longestRunMiles);const runsShown=setup?.primaryFocus!=='Strength'||Number(longestDistance)>0;
  const loadConnection=async()=>{/* A status check that cannot reach the server is not news: it printed "Failed to send a request to the Edge Function" under Sign out. Connections already reads as not connected, and acting on it reports a real error. */try{setActivity(await getActivityConnection())}catch{setActivity(null)}};
  /* GARMIN, DIRECT. Data arrives by push, so after connecting or syncing the
     screen reads what has landed and hands the health days to the recovery
     engine; activities merge into the log through the same import Strava uses. */
  const [garmin,setGarmin]=useState<GarminConnectionStatus|null>(null);const [garminMessage,setGarminMessage]=useState('');const [garminBusy,setGarminBusy]=useState(false);
  const loadGarmin=async()=>{try{const status=await getGarminConnection();setGarmin(status);if(status.connected){const days=await loadGarminHealth();if(days.length)syncWearableHealth(days);await importStravaActivities(records,addRecord,updateRecord).catch(()=>null)}}catch{setGarmin(null)}};
  const garminAction=async(action:'connect'|'sync'|'disconnect')=>{setGarminBusy(true);setGarminMessage('');try{if(action==='connect')await beginGarminConnection();if(action==='sync'){const result=await syncGarmin();setGarminMessage(result.requested===false?'Garmin is busy — try again in a few minutes.':'Garmin is sending your last week. New data appears within a few minutes.')}if(action==='disconnect'){await disconnectGarmin();setGarminMessage('Garmin disconnected. Data already imported stays in your account.')}await loadGarmin()}catch(reason){setGarminMessage(reason instanceof Error?reason.message:'The Garmin connection could not be updated.')}finally{setGarminBusy(false)}};
  useEffect(()=>{void loadGarmin();const params=new URLSearchParams(window.location.search);const code=params.get('code');const state=params.get('state');if(params.get('garmin')==='callback'&&code&&state){setView('connections');setGarminBusy(true);void finishGarminConnection(code,state).then(()=>{window.history.replaceState({},'',`${window.location.pathname}#/profile`);setGarminMessage('Garmin connected. Your history is on its way — sleep, HRV and activities appear over the next few minutes.');return loadGarmin()}).catch(reason=>setGarminMessage(reason instanceof Error?reason.message:'Garmin could not connect.')).finally(()=>setGarminBusy(false))}},[]);
  useEffect(()=>{void loadConnection();const params=new URLSearchParams(window.location.search);const code=params.get('code');const state=params.get('state');if(params.get('strava')==='callback'&&code&&state){setView('connections');setConnectionBusy(true);void finishStravaConnection(code,state).then(async()=>{window.history.replaceState({},'',`${window.location.pathname}#/profile`);await syncStravaActivities().catch(()=>null);const merged=await importStravaActivities(records,addRecord,updateRecord).catch(()=>({imported:0}));setConnectionMessage(`Strava connected${merged.imported?` — ${merged.imported} activities added to your training log`:''}. New activities import automatically.`);return loadConnection()}).catch(reason=>setConnectionMessage(reason instanceof Error?reason.message:'Strava could not connect.')).finally(()=>setConnectionBusy(false))}},[]);
  const connectionAction=async(action:'connect'|'sync'|'disconnect')=>{setConnectionBusy(true);setConnectionMessage('');try{if(action==='connect')await beginStravaConnection();if(action==='sync'){const result=await syncStravaActivities();const merged=await importStravaActivities(records,addRecord,updateRecord);setConnectionMessage(merged.imported?`${result.importedActivities||0} activities synced — ${merged.imported} added to your training log.`:`${result.importedActivities||0} activities synced. Your log already has all of them.`)}if(action==='disconnect'){await disconnectStrava();setConnectionMessage('Strava disconnected. Previously imported activity summaries remain in your account.')}await loadConnection()}catch(reason){setConnectionMessage(reason instanceof Error?reason.message:'The connection could not be updated.')}finally{setConnectionBusy(false)}};
  return <div className="stack-xl simple-profile">
    {view==='profile'&&<section className="simple-profile-head"><div className="avatar xlarge">{initials}</div><div><h2>{name}</h2><p>{/* Each half stays whole so the line never breaks straight after the separator. "Rolling cycle" was the scheduler's word, not the athlete's. */}<span className="nowrap">{setup?.primaryFocus||'Hybrid'} ·</span> <span className="nowrap">{setup?.trainingDays||4} days a week</span></p></div>{recovery.confidence!=='Low'&&<div className="profile-ready"><strong>{recovery.readiness}</strong><span>readiness</span></div>}<Link className="button secondary" to="/onboarding" state={{from:'/profile'}}>Edit profile</Link></section>}
    {/* SETTINGS IS THE GEAR'S SCREEN: everything about the app rather than
        the athlete. The tab strip that used to sit under the profile head
        overflowed a phone and hid the billing tab off its right edge; a list
        cannot hide anything. */}
    {/* SETTINGS, IN THREE SHORT GROUPS. Display is one switch, right here —
        light or dark is the only appearance choice there is, so it does not
        need a page of its own. Then what Forge connects to and how it coaches,
        then the account. Sign out stands alone at the bottom, where every
        phone puts it. */}
    {view==='settings'&&<div className="settings-groups">
      <section aria-labelledby="settings-display"><h3 id="settings-display">Display</h3>
        <div className="simple-settings-list">
          <div className="settings-row"><div><strong>Appearance</strong><span>Light or dark</span></div>
            <div className="settings-switch" role="radiogroup" aria-label="Appearance">
              {(['light','dark'] as const).map(tone=><button type="button" role="radio" key={tone} aria-checked={resolvedTheme===tone} className={resolvedTheme===tone?'active':''} onClick={()=>setTheme(tone)}>{tone==='light'?'Light':'Dark'}</button>)}
            </div>
          </div>
        </div>
      </section>
      <section aria-labelledby="settings-training"><h3 id="settings-training">Training</h3>
        <div className="simple-settings-list">
          <button type="button" onClick={()=>setView('coach')}><div><strong>Coach &amp; notifications</strong><span>Check-ins, reminders, limitations</span></div><b>›</b></button>
          <button type="button" onClick={()=>setView('connections')}><div><strong>Connections</strong><span>{activity?.connected||garmin?.connected?`${[garmin?.connected&&'Garmin',activity?.connected&&'Strava'].filter(Boolean).join(' & ')} connected · recovery and devices`:'Strava, smartwatches and health apps'}</span></div><b>›</b></button>
        </div>
      </section>
      <section aria-labelledby="settings-account"><h3 id="settings-account">Account</h3>
        <div className="simple-settings-list">
          <button type="button" onClick={()=>setView('billing')}><div><strong>Plan &amp; billing</strong><span>{isPro?'Forge Pro':'Forge Free'}</span></div><b>›</b></button>
          <button type="button" onClick={()=>setView('faq')}><div><strong>Help &amp; FAQ</strong><span>How Forge plans and measures</span></div><b>›</b></button>
          {/* The legal pages were reachable only from the sign-in screen, which
              a signed-in athlete never sees again. */}
          <button type="button" onClick={()=>{window.location.hash='/legal/privacy'}}><div><strong>Privacy &amp; legal</strong><span>Privacy, health data and terms</span></div><b>›</b></button>
        </div>
      </section>
      {/* A way out. There was no sign-out anywhere — the only exit was deleting
          the account — so a shared phone or a wrong Google account was stuck. */}
      <section aria-label="Sign out">
        <div className="simple-settings-list">
          <button type="button" className="settings-sign-out" onClick={()=>{if(window.confirm('Sign out of Forge on this device? Everything that has reached your account stays there.'))void signOut().catch(reason=>setConnectionMessage(reason instanceof Error?reason.message:'Could not sign out.'))}}><div><strong>Sign out</strong><span>{user?.email||'Signed in'}</span></div></button>
        </div>
        {connectionMessage&&<p className="connection-message">{connectionMessage}</p>}
      </section>
    </div>}
    {view==='billing'&&<BillingSettings/>}
    {view==='coach'&&<div className="stack-l coach-settings"><NotificationSettings/><CoachBodyLog notes={notes} upsert={upsert}/></div>}
    {view==='profile'&&<>{/* Running numbers only for someone who runs: a lifter's profile was half zeros. */}<section className={runsShown?'simple-profile-stats':'simple-profile-stats two'}><div><span>WORKOUTS</span><strong>{records.length}</strong></div>{runsShown&&<div><span>RUN · LAST 7 DAYS</span><strong>{weeklyDistance} {distanceUnit}</strong></div>}{runsShown&&<div><span>LONGEST RUN</span><strong>{longestDistance} {distanceUnit}</strong></div>}<div><span>ACTIVE GOALS</span><strong>{goals.length}</strong></div></section><section className="simple-settings-list"><Link to="/split"><div><strong>Split</strong><span>Training and rest-day structure</span></div><b>›</b></Link><Link to="/exercises"><div><strong>Exercise library</strong><span>Browse every movement Forge knows</span></div><b>›</b></Link><Link to="/partners"><div><strong>Training partners</strong><span>Up to five people and what they trained</span></div><b>›</b></Link><button type="button" onClick={()=>setView('settings')}><div><strong>Settings</strong><span>Appearance, coach, connections, billing</span></div><b>›</b></button></section></>}
    {view==='connections'&&<div className="connection-stack"><section className="simple-recovery"><div><span className="eyebrow">SMARTWATCH RECOVERY</span><h3>{recovery.confidence==='Low'?'No watch data yet':recovery.hardTrainingAllowed?'Recovery supports the plan':'Recovery safeguard active'}</h3><p>{recovery.confidence==='Low'?'Connect a watch below and Forge adjusts each day’s training from your sleep, HRV and resting heart rate. Until then it leaves recovery out rather than guess.':recovery.reasons.join(' · ')}</p></div><strong>{recovery.confidence==='Low'?'—':recovery.readiness}</strong></section>{recovery.confidence!=='Low'&&<section className="simple-profile-stats"><div><span>SLEEP</span><strong>{Math.round(latest.sleepMinutes/6)/10} hr</strong></div><div><span>HRV</span><strong>{latest.hrvRmssd??'—'} ms</strong></div><div><span>RESTING HR</span><strong>{latest.restingHr??'—'}</strong></div><div><span>SOURCE</span><strong>{latest.provider}</strong></div></section>}{([['watch','SMARTWATCHES','Watches and rings','Each watch connects to Forge directly, with no Strava account in between.'],['health','HEALTH APPS','Health platforms','Sleep, recovery and body weight, read-only. Forge never writes to your health data.']] as const).map(([kind,eyebrow,title,blurb])=><section key={kind} className="simple-connections"><header><div><span className="eyebrow">{eyebrow}</span><h3>{title}</h3><p>{blurb}</p></div></header>{connectionCatalog.filter(item=>item.kind===kind).map(item=>item.id==='garmin'&&garmin?.configured?<article key={item.id} className="garmin-connection"><BrandMark id={item.id} name={item.name} /><div><strong>{item.name}</strong><span>{garmin.connected?`${garmin.healthDays||0} days of sleep & recovery · ${garmin.importedActivities||0} activities${garmin.lastSyncedAt?` · updated ${new Date(garmin.lastSyncedAt).toLocaleDateString()}`:''}`:item.data.join(' · ')}</span>{garminMessage&&<span className="connection-message">{garminMessage}</span>}</div><div className="connection-actions">{garmin.connected?<><button disabled={garminBusy} onClick={()=>void garminAction('sync')}>Sync now</button><button className="danger" disabled={garminBusy} onClick={()=>void garminAction('disconnect')}>Disconnect</button></>:<button className="button" disabled={garminBusy} onClick={()=>void garminAction('connect')}>Connect Garmin</button>}</div></article>:<article key={item.id}><BrandMark id={item.id} name={item.name} /><div><strong>{item.name}</strong><span>{item.data.join(' · ')}</span></div><span className="connection-pill">Coming soon</span></article>)}</section>)}<section className="simple-connections activity-connection"><header><div><span className="eyebrow">ACTIVITY APPS</span><h3 className="brand-heading"><BrandMark id="strava" name="Strava" />Strava</h3><p>Optional: bring in runs and rides you record in the Strava app.</p></div><span className={activity?.connected?'connection-pill connected':'connection-pill'}>{activity?.connected?'Connected':activity?.configured===false?'Setup needed':'Not connected'}</span></header><article><div><strong>{activity?.athleteName||'Strava activity sync'}</strong><span>{activity?.connected?`${activity.importedActivities||0} activities stored${activity.lastSyncedAt?` · last sync ${new Date(activity.lastSyncedAt).toLocaleDateString()}`:''}`:'Workout data only — Strava does not supply complete sleep or HRV recovery data.'}</span></div><div className="connection-actions">{activity?.connected?<><button disabled={connectionBusy} onClick={()=>void connectionAction('sync')}>Sync now</button><button className="danger" disabled={connectionBusy} onClick={()=>void connectionAction('disconnect')}>Disconnect</button></>:<button className="button" disabled={connectionBusy||activity?.configured===false} onClick={()=>void connectionAction('connect')}>Connect Strava</button>}</div></article>{connectionMessage&&<p className="connection-message">{connectionMessage}</p>}{activity?.configured===false&&<p className="connection-message">Strava connections aren’t switched on for this build yet. Check back after the next update.</p>}</section></div>}
    {view==='faq'&&<HelpFaq/>}
  </div>;
}
