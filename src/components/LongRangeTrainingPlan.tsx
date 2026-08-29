import { useMemo, useState } from 'react';
import type { CreatedGoal } from './GoalBuilder';
import type { AdaptiveProfile } from '../features/training/AdaptiveTrainingProvider';
import { buildLongRangePlan,type PlanWeek } from '../lib/longRangePlanEngine';
import { useWorkoutHistory } from '../features/training/WorkoutHistoryProvider';
import { cardioPlanSummary,type PlannedCardio } from './CardioPlanBuilder';
import { canonicalLiftKey } from '../lib/liftAliases';
import { bestsFromHistory,wavePrescription,testsOneRepMax,goalLiftNames,weekCycleDays,type SplitDayRef } from '../features/training/aiPlanService';

type SplitDay={name:string;dayType:string;muscles?:string[];exercises?:string[];cardioPolicy?:'none'|'forge'|'planned';cardio?:PlannedCardio[]};
type CalendarSession={date:Date;kind:string;title:string;detail:string;metric?:string;goal:string;stress:'High'|'Moderate'|'Low'|'Rest';scaled?:boolean};
const dateText=(date:Date)=>date.toLocaleDateString('en-US',{weekday:'short',month:'short',day:'numeric'});
const clamp=(value:number,min:number,max:number)=>Math.max(min,Math.min(max,value));

function scaleCardio(plan:PlannedCardio,week:PlanWeek,profile:AdaptiveProfile){
  const phase=week.phase.toLowerCase();const phaseScale=phase.includes('taper')||phase.includes('test')?.72:phase.includes('deload')?.8:phase.includes('build')||phase.includes('specific')?1.08:.92;const recoveryScale=profile.readiness<60?.72:profile.readiness<75?.88:1;const scale=phaseScale*recoveryScale;const next={...plan};
  if(plan.structure==='Steady'&&plan.duration)next.duration=String(Math.round(clamp(Number(plan.duration)*scale,15,120)));
  if(plan.structure==='Intervals'&&plan.repeats)next.repeats=String(Math.round(clamp(Number(plan.repeats)*scale,3,20)));
  if(plan.structure==='Circuit'&&plan.rounds)next.rounds=String(Math.round(clamp(Number(plan.rounds)*scale,2,10)));
  return{summary:cardioPlanSummary(next),reason:`Scaled for ${week.phase.toLowerCase()} phase${profile.readiness<75?' and current recovery':''}.`};
}

function weekCalendar(week:PlanWeek,splitDays:SplitDay[],goals:CreatedGoal[],profile:AdaptiveProfile,rhythm:'rolling'|'weekly',bests:Map<string,number>=new Map(),goalLifts:Set<string>=new Set(),anchor?:{position:number}):CalendarSession[]{
  const strengthGoal=goals.find(goal=>goal.type==='Strength');const enduranceGoal=goals.find(goal=>goal.type==='Endurance');const start=new Date(`${week.startDate}T12:00:00`);const cycle=splitDays.length?splitDays:[{name:'Strength',dayType:'strength'},{name:'Easy cardio',dayType:'cardio'},{name:'Rest',dayType:'rest'}];let strengthIndex=0;
  /* The same rotation the program uses, anchored to the live split cursor.
     Without the anchor this calendar drifted from the program on the same
     screen the moment the athlete missed a day: "Legs" on Thursday in one
     panel, "Push" on Thursday in the other. */
  const weekDays=weekCycleDays(week.startDate,0,cycle as SplitDayRef[],rhythm,anchor).map((day,index)=>{const date=new Date(start);date.setDate(start.getDate()+index);return{date,day:day as unknown as SplitDay};});
  const compatible=weekDays.map((entry,index)=>({entry,index})).filter(({entry})=>entry.day.dayType.toLowerCase()!=='rest'||entry.day.cardioPolicy!=='none');
  const requestedRuns=enduranceGoal?Math.max(1,Math.min(profile.runningDays,compatible.length)):0;
  const cardioByDay=new Map<number,'quality'|'easy'|'long'>();
  /* A split day NAMED for a run role owns that role — a day called "Long Run"
     can never be handed 4×200s. Only the remaining requested runs fall back
     to slot order (quality early, long last, easy between). */
  const roleFromName=(name:string):'quality'|'easy'|'long'|null=>{const value=name.toLowerCase();if(value.includes('long'))return 'long';if(value.includes('quality')||value.includes('speed')||value.includes('interval')||value.includes('track')||value.includes('tempo'))return 'quality';if(value.includes('easy')||value.includes('aerobic')||value.includes('recovery run'))return 'easy';return null};
  if(requestedRuns){
    const named=new Set<'quality'|'long'>();
    compatible.forEach(({entry,index:slot})=>{
      if(cardioByDay.size>=requestedRuns)return;
      const role=roleFromName(entry.day.name);
      if(role==='long'&&!named.has('long')){cardioByDay.set(slot,'long');named.add('long')}
      else if(role==='quality'&&!named.has('quality')){cardioByDay.set(slot,'quality');named.add('quality')}
      else if(role==='easy'){cardioByDay.set(slot,'easy')}
    });
    /* Fallback runs SPREAD across the week instead of stacking onto the first
       free days: each pick maximizes distance from already-placed runs. */
    const free=compatible.map(({index:slot})=>slot).filter(slot=>!cardioByDay.has(slot));
    const runDays=new Set(cardioByDay.keys());
    const takeMostSpaced=()=>{let best=free[0],bestScore=-1;for(const slot of free){const score=runDays.size?Math.min(...[...runDays].map(day=>Math.abs(day-slot))):slot+1;if(score>bestScore){bestScore=score;best=slot}}free.splice(free.indexOf(best),1);runDays.add(best);return best};
    /* Hard running never lands on a strength/mixed day: quality and the long
       run only take PURE cardio days; mixed (e.g. leg) days get easy miles. */
    const cardioOnly=new Set(compatible.filter(({entry})=>entry.day.dayType.toLowerCase()==='cardio'||entry.day.dayType.toLowerCase()==='rest').map(({index:slot})=>slot));
    const takeMostSpacedFrom=(pool:number[])=>{let best=pool[0],bestScore=-1;for(const slot of pool){const score=runDays.size?Math.min(...[...runDays].map(day=>Math.abs(day-slot))):slot+1;if(score>bestScore){bestScore=score;best=slot}}free.splice(free.indexOf(best),1);runDays.add(best);return best};
    const freeCardioOnly=()=>free.filter(slot=>cardioOnly.has(slot));
    if(!named.has('quality')&&cardioByDay.size<requestedRuns&&freeCardioOnly().length)cardioByDay.set(takeMostSpacedFrom(freeCardioOnly()),'quality');
    if(requestedRuns>1&&!named.has('long')&&cardioByDay.size<requestedRuns&&free.length)cardioByDay.set(takeMostSpacedFrom(freeCardioOnly().length?freeCardioOnly():free),'long');
    while(cardioByDay.size<requestedRuns&&free.length)cardioByDay.set(takeMostSpaced(),'easy');
  }
  return weekDays.map(({date,day},index)=>{
    const type=day.dayType.toLowerCase();const attached=day.cardioPolicy==='planned'?day.cardio?.[0]:undefined;const scaled=attached?scaleCardio(attached,week,profile):null;const role=cardioByDay.get(index);let cardioText='';let cardioKind='';let cardioStress:'High'|'Moderate'|'Low'|undefined;
    if(role==='quality'){cardioKind='FORGE · Quality';cardioText=week.quality;cardioStress='High'}else if(role==='long'){cardioKind='FORGE · Long run';cardioText=week.longRun;cardioStress='Moderate'}else if(role==='easy'){cardioKind='FORGE · Easy';cardioText=week.easy;cardioStress='Low'}else if(scaled){cardioKind='PLAN · Cardio';cardioText=scaled.summary;cardioStress=attached!.structure==='Steady'?'Low':'High'}
    if(type==='rest'&&!cardioText)return{date,kind:'Recovery',title:day.name,detail:'No strength or cardio scheduled. Optional mobility or easy walking only.',goal:'Fatigue management',stress:'Rest'};
    if(type==='rest'&&cardioText)return{date,kind:cardioKind,title:day.name,detail:`No strength · ${cardioText}${scaled?` · ${scaled.reason}`:' · Scheduled from this calendar week’s cardio requirements.'}`,goal:enduranceGoal?.title||'Endurance development',stress:cardioStress||'Low',scaled:true};
    if(type==='strength'||type==='mixed'){const isPrimary=strengthIndex++===0;
    /* The goal lift appears ONCE a week, on the primary strength day. Other
       days train their own muscles — no squat-stage stamp on every row. */
    /* Bests are keyed canonically, so the lookup has to be too. */
    const dayLifts=(day.exercises||[]).filter(name=>bests.has(canonicalLiftKey(name))).sort((a,b)=>(bests.get(canonicalLiftKey(b))||0)-(bests.get(canonicalLiftKey(a))||0));
    /* THE WAVE, not a fourth formula. This line used to run inverse Epley
       times a 0.97 fudge times a 0.6%/week creep — arithmetic that existed
       nowhere else in Forge and disagreed with the program printed directly
       above it. */
    const lead=dayLifts[0];
    const wave=lead?wavePrescription(bests.get(canonicalLiftKey(lead))||0,week.week-1,false,0,testsOneRepMax(lead,goalLifts)):null;
    const dayTopSet=lead&&wave?`${lead}: ${wave.weight} × ${wave.reps}${wave.isMax?' tested MAX':''}`:(day.exercises||[]).length?`${(day.exercises||[])[0]}: establish a baseline`:'';
    /* Every strength day carries a recommended top set from ITS mapped
       exercises and logged bests — the goal lift still leads its own day. */
    const strength=isPrimary?`${week.topSet}${week.strengthLoad?` · ${week.strengthFocus}`:''}`:dayTopSet?`Top set · ${dayTopSet}`:`${day.muscles?.filter(muscle=>muscle!=='Cardio').join(' + ')||'Accessory'} strength · map an exercise for a prescription`;return{date,kind:cardioKind?`${type==='mixed'?'Mixed':'Strength'} + ${cardioKind}`:(type==='mixed'?'Mixed':'Strength'),title:day.name,detail:cardioText?`${strength} · Cardio: ${cardioText}`:strength,goal:strengthGoal?.title||'Strength development',stress:cardioStress==='High'?'High':isPrimary?'High':'Moderate',scaled:Boolean(cardioText)};}
    if(cardioText)return{date,kind:cardioKind,title:day.name,detail:`${cardioText}${scaled?` · ${scaled.reason}`:' · Scheduled from this calendar week’s mileage and long-run requirement.'}`,goal:enduranceGoal?.title||'Endurance development',stress:cardioStress||'Low',scaled:true};
    return{date,kind:'Flexible',title:day.name,detail:'No additional cardio is required to satisfy this week.',goal:enduranceGoal?.title||'Training balance',stress:'Low'};
  });
}

export function LongRangeTrainingPlan({goals,profile,splitDays,rhythm='rolling'}:{goals:CreatedGoal[];profile:AdaptiveProfile;splitDays:SplitDay[];rhythm?:'rolling'|'weekly'}){
  const {records}=useWorkoutHistory();
  const [horizon,setHorizon]=useState<12|26|52>(12);
  const [openWeek,setOpenWeek]=useState<number|null>(null);
  const roadmap=useMemo(()=>buildLongRangePlan(goals,profile,horizon,records),[goals,profile,records,horizon]);
  const bests=useMemo(()=>bestsFromHistory(records).bests,[records]);
  const goalLifts=useMemo(()=>goalLiftNames(goals),[goals]);
  const active=roadmap[0];const sessions=useMemo(()=>active?weekCalendar(active,splitDays,goals,profile,rhythm,bests,goalLifts):[],[active,splitDays,goals,profile,rhythm,bests,goalLifts]);
  const exportRoadmap=()=>{
    const lines=['FORGE ROADMAP TO GOAL',`${roadmap.length} weeks · ${goals.map(goal=>goal.title).join(' · ')||'Baseline development'}`,'',...roadmap.flatMap(week=>[`WEEK ${week.week} · ${week.start} · ${week.phase.toUpperCase()}`,`  Volume: ${week.mileage?`${week.mileage} mi`:'no scheduled running'}${week.change?` (${week.change>0?'+':''}${week.change}%)`:''}`,`  Long run: ${week.longRun}`,`  Hard run: ${week.quality}`,`  Top set: ${week.strengthLoad?`${week.strengthExercise} ${week.strengthLoad} × ${week.strengthReps} · projected max ${week.calculatedMax}${week.strengthGoal?` / goal ${week.strengthGoal}`:''}`:week.topSet}`,''])];
    const blob=new Blob([lines.join('\n')],{type:'text/plain'});const url=URL.createObjectURL(blob);const link=document.createElement('a');link.href=url;link.download=`forge-roadmap-${roadmap.length}-weeks.txt`;link.click();URL.revokeObjectURL(url);
  };
  if(!active)return null;
  return <div className="simple-program"><section className="simple-program-head"><div><span className="eyebrow">THIS WEEK · OBJECTIVE</span><h2>{active.phase}</h2></div><div className="simple-week-metrics"><div><span>LIFT FOCUS</span><strong>{active.strengthExercise||'Build baseline'}</strong></div><div><span>CARDIO FOCUS</span><strong>{active.mileage?`${active.mileage} mi this week`:'Not scheduled'}</strong></div></div></section><section className="card simple-week-schedule"><header><div><span className="eyebrow">YOUR SCHEDULE</span><h3>What to do this week</h3></div></header><div>{sessions.map(session=><article className={`stress-${session.stress.toLowerCase()}`} key={session.date.toISOString()}><time>{dateText(session.date)}</time><div><span className="session-tags">{/* kind arrives pre-joined, e.g. "Strength + Forge · Quality"; each part is
       its own fact and deserves its own chip rather than one wrapping label. */
      [...session.kind.split(' · '),session.stress,...(session.scaled?['Scaled']:[])].filter(Boolean).map((tag,index)=><i key={`${tag}-${index}`}>{tag}</i>)}</span><strong>{session.title}</strong><small>{session.metric?`${session.metric} · ${session.detail}`:session.detail}</small></div><b>{session.stress==='Rest'?'Rest':'›'}</b></article>)}</div></section><section className="card roadmap-card"><header className="roadmap-head"><div><span className="eyebrow">ROADMAP TO GOAL</span><h3>Where the plan takes you</h3></div><div className="horizon-chips" role="group" aria-label="Roadmap horizon">{([[12,'12 wks'],[26,'6 mo'],[52,'1 yr']] as const).map(([weeks,label])=><button type="button" key={weeks} className={horizon===weeks?'active':''} onClick={()=>setHorizon(weeks)}>{label}</button>)}<button type="button" className="roadmap-export" onClick={exportRoadmap}>Export ↓</button></div></header>
<div className="roadmap-table" role="table"><div className="roadmap-row head" role="row"><span>Week</span><span>Miles</span><span>Long</span><span>Hard run</span><span>Top set · proj. max</span></div>
{roadmap.map(week=><div key={week.week} className="roadmap-week-group">
<button type="button" className={`roadmap-row phase-${week.phase.toLowerCase()}${openWeek===week.week?' open':''}`} onClick={()=>setOpenWeek(current=>current===week.week?null:week.week)} aria-expanded={openWeek===week.week}>
  <span className="roadmap-week"><b>{week.week}</b><small>{week.start} · {week.phase}</small></span>
  <span className="roadmap-miles">{week.mileage?week.mileage:'—'}</span>
  <span className="roadmap-long">{/^\d/.test(week.longRun)?week.longRun.split(' ')[0]+' mi':'—'}</span>
  <span className="roadmap-run">{week.quality}</span>
  <span className="roadmap-set">{week.strengthLoad?<><b>{week.calculatedMax} max</b><small>{week.strengthLoad}×{week.strengthReps}{week.strengthGoal?` · goal ${week.strengthGoal}`:''}</small></>:'—'}</span>
</button>
{openWeek===week.week&&<div className="roadmap-days">{weekCalendar(week,splitDays,goals,profile,rhythm,bests).map(session=><div className={`roadmap-day stress-${session.stress.toLowerCase()}`} key={session.date.toISOString()}><time>{session.date.toLocaleDateString('en-US',{weekday:'short'})}</time><div><strong>{session.title}</strong><small>{session.detail}</small></div></div>)}</div>}
</div>)}</div>
<small className="roadmap-note">Loads and paces regenerate from completed work — this is the current trajectory to {goals[0]?.title||'your goals'}, not a promise.</small></section>
<details className="card scaling-explainer"><summary><div><span className="eyebrow">HOW CARDIO ADAPTS</span><strong>Scaling rules</strong></div><b>＋</b></summary><div><p><b>Weekly volume:</b> resets only with the calendar week, never when a rolling split wraps.</p><p><b>Long run:</b> appears no more than once in each calendar week.</p><p><b>Steady workouts:</b> duration changes.</p><p><b>Intervals:</b> repetition count changes while work quality and recovery remain recognizable.</p><p><b>Circuits:</b> round count changes before station technique is altered.</p><p>Completed results, recovery, weekly volume, and goal phase shape the next prescription. Saved templates stay unchanged; only the scheduled dose scales.</p></div></details></div>;
}
