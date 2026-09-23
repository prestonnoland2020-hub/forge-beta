import { isDemoMode } from '../lib/env';
import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { PageIntro } from '../components/AppShell';
import { useWorkoutHistory } from '../features/training/WorkoutHistoryProvider';
import { useAdaptiveTraining } from '../features/training/AdaptiveTrainingProvider';
import { useGoals } from '../features/goals/GoalsProvider';
import { buildTrainingIntelligence } from '../lib/trainingIntelligence';
import { useCoachingStrategy } from '../features/training/CoachingStrategyProvider';
import { useProfileSetup } from '../features/profile/ProfileSetupProvider';
import { isProgrammableStrength, useTrainingLibrary } from '../features/training/TrainingLibraryProvider';
import { requestForgeCoach } from '../features/training/coachService';
import { enduranceTarget } from '../lib/qualitySession';
import { paceModel } from '../lib/paceModel';
import { localDayIso } from '../lib/time';
import { readLocalAiPlan, currentWeekIndex, resolvePlanWeek, goalLiftNames, weekCycleDays, waveIndexOf, bestsFromHistory} from '../features/training/aiPlanService';
import { sameLift, canonicalLiftKey } from '../lib/liftAliases';
import { goalTrajectories, weeklyRunning, bodyWeightSeries, medianWeeklyMiles, longestContinuousRun } from '../lib/goalTrajectory';
import { goalFeasibility, competingRaces } from '../lib/goalFeasibility';
import { normalizeMuscleGroups } from '../lib/muscleGroups';
import { useDailyRecommendation } from '../features/training/DailyRecommendationProvider';
import { buildCareerSummary } from '../features/training/careerSummary';
import { last7DayMiles, last7DayRuns, longestRun, receiptLine } from '../lib/stats';
import { Link } from 'react-router-dom';
import { useAthleteNotes } from '../features/training/useAthleteNotes';
import { applyCheckIn, createNote, extractArea, isBufferActive, needsFollowUp, notesForCoachContext, type AthleteNote, type NoteFollowUp } from '../features/training/athleteNotesService';
import { parseActions, localActions, overrideFromActions, type CoachAction, type ActionContext } from '../lib/coachActions';
import { readTodayOverride, writeTodayOverride, appendAppliedActions, readAppliedActions } from '../features/training/coachOverrides';

const questions=['What should I train today?','Weekly recap','What is my training geared toward?','Am I on track for my goal?','Plan my week'];

export function CoachPage(){
  const [params]=useSearchParams();const {records}=useWorkoutHistory();const {recovery,profile,updateProfile}=useAdaptiveTraining();const {goals,saveGoal}=useGoals();const {strategy,updateStrategy}=useCoachingStrategy();const {setup,saveSetup}=useProfileSetup();const weightUnit=setup?.units==='Metric'?'kg':'lb';const {exercises,workouts,addExercise,addWorkout}=useTrainingLibrary();const {recommendation,anchorDate}=useDailyRecommendation();
const strengthGoal=goals.find(goal=>goal.type==='Strength');const goalMax=Number(strengthGoal?.target.replace(/[^0-9.]/g,''))||undefined;
  const savedPlan=useMemo(()=>{try{return JSON.parse(localStorage.getItem('forge-training-plan-v1')||'null') as {days?:Array<{name:string;dayType:string;muscles?:string[];exercises?:string[]}>}|null}catch{return null}},[setup]);const splitDays=savedPlan?.days||[];const fallbackDay=setup?.splitDays.find(day=>day.type!=='Rest');const dueDay=recommendation?{name:recommendation.splitDay.name,dayType:recommendation.splitDay.type,muscles:recommendation.splitDay.muscles,exercises:recommendation.splitDay.exercises}:splitDays[0]||null;const dueMuscles=normalizeMuscleGroups(recommendation?.splitDay.muscles||dueDay?.muscles||fallbackDay?.muscles||[]).filter(muscle=>muscle!=='Cardio');const strengthLibrary=exercises.filter(exercise=>exercise.enabled&&isProgrammableStrength(exercise));const completedStrength=records.flatMap(record=>(record.topSets||[]).filter(set=>set.completed!==false).map(set=>({date:record.date,lift:set.lift})));const templates=(recommendation?.topSets.length?recommendation.topSets.map(set=>({exercise:set.exercise,calculatedMax:set.calculatedMax,exposureIndex:new Set(completedStrength.filter(result=>result.lift===set.exercise).map(result=>result.date)).size})):strengthLibrary.slice(0,1).map(exercise=>({exercise:exercise.name,calculatedMax:0,exposureIndex:0})));if(!templates.length)templates.push({exercise:'Strength exercise',calculatedMax:0,exposureIndex:0});const intelligence=buildTrainingIntelligence({records,recovery,templates,/* CANONICAL KEY, because that is what buildTrainingIntelligence reads it
       with. A "Back Squat" goal keyed as "Back Squat" and was looked up as
       "squat", so the Coach lost the target entirely and told the athlete no
       movement-specific goal was set. */
      goalMaxByLift:strengthGoal?.exercise&&goalMax?{[canonicalLiftKey(strengthGoal.exercise)]:goalMax}:{},loadBiasPercent:strategy.loadBiasPercent});const savedTarget=recommendation?.topSets.find(set=>set.selected)||recommendation?.topSets[0];const target=savedTarget?{exercise:savedTarget.exercise,weight:savedTarget.weight,reps:savedTarget.reps,source:savedTarget.source,rationale:savedTarget.rationale}:intelligence.topSets[0];const eligible=strengthLibrary.filter(exercise=>recommendation?.topSets.some(set=>sameLift(set.exercise,exercise.name)));const readinessText=recovery.confidence==='Low'?'no smartwatch recovery data was used':`${recovery.readiness}% smartwatch readiness`;
  /* THE ONE RESOLVED WEEK. Every number the coach says — in a canned answer or
     in the model's context — comes from here, which is the same resolver the
     Plan tab renders. Reading the raw stored block is how a coach ends up
     quoting "45 min easy" and "11.1 miles" against a screen showing distances
     and a corrected total. */
  const resolvedWeek=useMemo(()=>{
    const stored=readLocalAiPlan();
    if(!stored)return null;
    const index=currentWeekIndex(stored);
    const raw=stored.plan.weeks[index];
    if(!raw)return null;
    /* THE SHARED BUILDER, NOT A FOURTH COPY. This rebuilt bests and singles by
       hand and had no anchors, no session counts, no miss counts and no last
       completed loads — so resolvePlanWeek, whose entire purpose is that every
       surface reads the same resolved week, was handed a thinner history here
       than the Plan tab gives it. The coach could quote a load the screen does
       not show, which is the one thing it must never do. */
    const history=bestsFromHistory(records);
    const {bests,singles}=history;
    /* The SAME seven-day window the Plan tab and Today measure — anything else
       splits the week's miles differently and the coach quotes a distance no
       screen shows. */
    const cycleDays=splitDays.map(day=>({name:day.name,dayType:day.dayType,exercises:day.exercises||[]}));
    const planRhythm=(savedPlan as {rhythm?:string}|null)?.rhythm==='weekly'?'weekly':'rolling';
    const windowDays=weekCycleDays(stored.startDate,index,cycleDays,planRhythm,recommendation?{position:recommendation.splitDay.position,dateIso:anchorDate}:undefined);
    return resolvePlanWeek(raw,cycleDays,{runningDays:Number(setup?.runningDays)||profile.runningDays,minWeeklyMileage:Number(setup?.minWeeklyMileage)||0,maxWeeklyMileage:Number(setup?.maxWeeklyMileage)||0,weeklyMileage:Number(setup?.weeklyMileage)||profile.weeklyMileage,longestRunMiles:profile.longestRunMiles,recentWeeklyMileage:medianWeeklyMiles(records),recentLongestRun:longestContinuousRun(records), readiness: recovery?.readiness, goalPaceSecondsPerMile:enduranceTarget(goals)?.paceSecondsPerMile, goalMiles:enduranceTarget(goals)?.miles, paces:paceModel(records,enduranceTarget(goals),localDayIso(),medianWeeklyMiles(records),setup?.excludedEfforts||[])},{weekIndex:index,blockWeeks:stored.plan.weeks.length,waveIndex:waveIndexOf(stored,index)},{bests,singles,goalLifts:goalLiftNames(goals),metric:setup?.units==='Metric',anchors:history.anchors,sessions:history.sessions,misses:history.misses,lastAt:history.lastAt},windowDays);
  },[records,goals,setup,profile,splitDays.length]); // eslint-disable-line react-hooks/exhaustive-deps
  const dynamicAnswers:Record<string,string>={
    'What should I train today?':recommendation?`${recommendation.splitDay.name} is next because completed workout history placed the split at position ${recommendation.splitDay.position}. ${recommendation.topSets.filter(set=>set.selected).map(set=>set.source==='history'?`${set.exercise}: ${set.weight} ${weightUnit} × ${set.reps}`:`${set.exercise}: establish a baseline`).join(' · ')}${recommendation.cardio?.selected?` · ${recommendation.cardio.summary}`:''}`:`${dueDay?.name||fallbackDay?.name||'Your next split day'} is due. ${intelligence.reason}`,
    'Weekly recap':`You logged ${intelligence.activeDays7} active days in the last seven. Your workload is ${intelligence.workloadTrend.toLowerCase()}. ${intelligence.reason}`,
    'What is my training geared toward?':strengthGoal?`Your current training is primarily supporting ${strengthGoal.title}. Your recent results and split still determine the exercise selected each day.`:`Your current training is geared toward balanced strength and conditioning. Add a specific goal if you want Forge to prioritize one outcome.`,
    'Am I on track for my goal?':strengthGoal?`Your active target is ${strengthGoal.title}: ${strengthGoal.target}. Forge will compare completed top sets—not planned numbers—to determine whether your calculated max is moving toward it.`:'There is no active strength goal to measure yet. Forge is still progressing from your completed results.',
    'Plan my week':resolvedWeek?`This week (${resolvedWeek.phase}): ${resolvedWeek.mileage} mi of running — long run ${resolvedWeek.longRunMiles} mi on ${resolvedWeek.longRunDay}${resolvedWeek.quality&&!/no goal/i.test(resolvedWeek.quality)?`, ${resolvedWeek.quality} on ${resolvedWeek.qualityDay}`:''}${(resolvedWeek.easyDays||[]).length?`, and easy runs of ${(resolvedWeek.easyRuns||[]).join(', ')} mi`:''}. Every strength day carries its own top set from the wave; goal lifts are the ones tested on max week.`:`Forge would preserve your rolling strength split while keeping ${profile.weeklyMileage} miles and any long-run requirement inside the calendar week.`,
    'Why this workout?':recommendation?recommendation.explanation:`${intelligence.reason} ${target.source==='history'?`The ${target.exercise} target is ${target.weight} ${weightUnit} ×${target.reps};`:'No load is prescribed yet.'} ${target.rationale}`,
    'Can I train upper body instead?':`That would be an off-plan workout, not a replacement for ${recommendation?.splitDay.name||'the due split day'}. You can log it honestly, but Forge will keep the saved split position due until its recommended work is completed.`,
    'Make today easier':`The saved recommendation stays unchanged so Today, Log, and Coach cannot disagree. Unselect optional top sets or cardio before starting; if the required work is not appropriate, log only what you safely complete and Forge will use the actual result next time. Current recovery context: ${readinessText}.`,
    'What should I focus on?':`Keep the ${target.exercise} set technically clean and stop before grinding. Your recent workload is ${intelligence.workloadTrend.toLowerCase()} with ${intelligence.activeDays7} active days in the last seven.`,
  };
  type CoachTurn={role:'user'|'forge';text:string};
  const {notes,upsert}=useAthleteNotes();
  const kindLabel:Record<AthleteNote['kind'],string>={injury:'injury',fatigue:'fatigue',other:'limitation'};
  const formatNoteDate=(iso:string)=>new Date(`${iso}T12:00:00`).toLocaleDateString('en-US',{month:'short',day:'numeric'});
  const activeNotes=notes.filter(note=>note.status==='active');
  const pendingCheckIns=activeNotes.filter(needsFollowUp);
  const [,setQuestion]=useState('');const [custom,setCustom]=useState(params.get('prompt')||'');const [coachLoading,setCoachLoading]=useState(false);const [,setAnswerSource]=useState<'ai'|'local'|'limit'|null>(null);const [conversation,setConversation]=useState<CoachTurn[]>([]);
  /* Set when the server refused on quota, so the athlete is told plainly and
     shown the one thing that changes it — rather than reading a generic
     rules-based paragraph and assuming that was the coach answering. */
  const [limitNotice,setLimitNotice]=useState<{text:string;upgrade:boolean}|null>(null);
  useEffect(()=>{const receivePrompt=(event:Event)=>{const prompt=(event as CustomEvent<{prompt?:string}>).detail?.prompt;if(prompt)setCustom(prompt)};window.addEventListener('forge:open-coach',receivePrompt);return()=>window.removeEventListener('forge:open-coach',receivePrompt)},[]);
  /* WHAT THE COACH PROPOSES, WAITING FOR A TAP. The regex parser that used
     to live here turned "increase my mileage to 25" into a change and
     everything else into prose; the server now says what it would change,
     lib/coachActions checks it against the athlete's real plan, and this is
     the list until Apply or Not now. */
  const [pending,setPending]=useState<{actions:CoachAction[];question:string}|null>(null);const [adjustmentMessage,setAdjustmentMessage]=useState('');
  const actionContext=useMemo<ActionContext>(()=>({
    splitDays:(setup?.splitDays||[]).map((day,index)=>({position:index+1,name:day.name,type:day.type})),
    goals:goals.map(goal=>({title:goal.title})),
    activeNoteAreas:notes.filter(note=>note.status==='active').map(note=>note.area||kindLabel[note.kind]),
    exercises:exercises.map(exercise=>exercise.name),
    weeklyMileage:Number(setup?.weeklyMileage)||profile.weeklyMileage||0,
    runningDays:Number(setup?.runningDays)||profile.runningDays||0,
    loadBiasPercent:strategy.loadBiasPercent,
    metric:setup?.units==='Metric',
  }),[setup,goals,notes,exercises,profile.weeklyMileage,profile.runningDays,strategy.loadBiasPercent,kindLabel]);
  const applyActions=()=>{if(!pending)return;const todayIso=localDayIso();const applied:string[]=[];
    for(const action of pending.actions){
      if(action.type==='set_weekly_mileage'){updateProfile({weeklyMileage:action.miles});if(setup){const ceiling=Number(setup.maxWeeklyMileage)||0;saveSetup({...setup,weeklyMileage:action.miles,maxWeeklyMileage:ceiling&&action.miles>ceiling?Math.ceil(action.miles*1.1):setup.maxWeeklyMileage})}}
      if(action.type==='set_running_days'){updateProfile({runningDays:action.days});if(setup)saveSetup({...setup,runningDays:action.days})}
      if(action.type==='set_load_bias')updateStrategy({loadBiasPercent:action.percent,lastAdjustment:pending.question});
      if(action.type==='log_note'){const note=createNote(action.noteKind,action.text,action.area||extractArea(action.text));upsert(note)}
      if(action.type==='clear_note'){const note=notes.find(item=>item.status==='active'&&(item.area||kindLabel[item.kind])===action.area);if(note)upsert({...note,status:'cleared'})}
      if(action.type==='update_goal'){const index=goals.findIndex(goal=>goal.title===action.goalTitle);if(index>=0)saveGoal({...goals[index],...(action.target?{target:action.target}:{}),...(action.date?{date:action.date}:{})},index)}
      if(action.type==='create_exercise')addExercise({name:action.name,kind:action.muscles.includes('Cardio')?'Cardio':'Strength',muscles:action.muscles,detail:'Coach-created · User confirmed',enabled:true,custom:true});
      if(action.type==='create_workout'){const cardioOnly=action.items.every(item=>exercises.find(exercise=>exercise.name.toLowerCase()===item.toLowerCase())?.kind==='Cardio');addWorkout({name:action.name,kind:cardioOnly?'Cardio':'Strength',source:'User',summary:action.items.join(' · '),exercises:action.items})}
      applied.push(action.label);
    }
    /* Today's changes land in one place the Today card reads. */
    const override=overrideFromActions(pending.actions,todayIso,readTodayOverride(todayIso));
    if(override!==readTodayOverride(todayIso))writeTodayOverride(override);
    appendAppliedActions(pending.actions.map(action=>({date:todayIso,type:action.type,label:action.label})));
    const message=applied.length===1?`Done — ${applied[0].charAt(0).toLowerCase()+applied[0].slice(1)}.`:`Done:\n${applied.map(item=>`• ${item}`).join('\n')}`;
    setAdjustmentMessage(message);setConversation(turns=>[...turns,{role:'forge',text:message}]);setPending(null)};
  const ask=async(value:string)=>{setQuestion(value);setPending(null);setAdjustmentMessage('');setConversation(turns=>[...turns,{role:'user',text:value}]);const fallback=dynamicAnswers[value]??`I would evaluate that against your saved history, active goals, split position, and ${readinessText}.`;setCoachLoading(true);const wearableRecovery=recovery.confidence==='Low'?null:recovery;/* SIXTY DAYS, NOT 180. The server keeps the first 30,000 characters of the
     context and 180 records ran past that, so everything after this key —
     the career summary, the deterministic recommendation, the evidence
     rules — was cut off for any active athlete. careerSummary covers the
     rest of the history. */
    const todayIso=localDayIso();
    const coachingHistory=records.slice(0,60).map(record=>({date:record.date,recommendationId:record.recommendationId,splitPosition:record.splitPosition,muscles:record.muscles,effort:record.effort,notes:record.notes,topSets:(record.topSets||[]).map(set=>({lift:set.lift,weight:set.weight,reps:set.reps,calculatedMax:set.calculatedMax})),cardio:(record.cardioSessions||[]).map(session=>({activity:session.activity,summary:session.summary}))}));const career=buildCareerSummary(records);const storedProgram=readLocalAiPlan();const programWeek=resolvedWeek;
    /* THE CONSISTENCY TEST READS WHAT THE COACH IS TOLD. In preview mode the
       request never leaves the device; the context is left on window so a
       test can check it says the same day, lifts and miles as the screens. */
    const coachRequest={question:value,scope:'today' as const,context:{conversationHistory:conversation.slice(-10),aiProgram:storedProgram&&programWeek?{generatedAt:storedProgram.generatedAt,summary:storedProgram.plan.summary,blockWeeks:storedProgram.plan.weeks.length,currentWeek:{week:programWeek.week,phase:programWeek.phase,mileage:programWeek.mileage,longRun:`${programWeek.longRunMiles} mi @ ${programWeek.longRunPace} on ${programWeek.longRunDay}`,quality:`${programWeek.quality}${programWeek.qualityPace?` @ ${programWeek.qualityPace}`:''} on ${programWeek.qualityDay}`,easy:(programWeek.easyDays||[]).map((day,index)=>`${day}: ${programWeek.easyRuns?.[index] ?? '?'} mi @ ${programWeek.easyPace}`).join('; ')||'No easy runs this week',topSets:programWeek.topSets,note:programWeek.note}}:null,athleteHealthNotes:notesForCoachContext(notes),coachActionsApplied:readAppliedActions().slice(-12),/* weeklyPlan removed: a SECOND planner with its own numbers and its own
       claim that 'the goal lift is trained once this week, other strength days
       are accessory'. Both are false under the current design and the coach was
       being handed them alongside the real block. */
    wearableRecovery,wearableRecoveryAvailable:Boolean(wearableRecovery),profile:{weeklyMileage:profile.weeklyMileage,runningDays:profile.runningDays,experience:profile.experience,strengthFatigue:profile.strengthFatigue},goals:goals.map(goal=>({title:goal.title,type:goal.type,target:goal.target,date:goal.date,exercise:goal.exercise})),
      /* WHAT THE COACH WAS NEVER TOLD, AND SO REPORTED AS MISSING.

         "Am I on track?" used to return a list of gaps and two complaints —
         that the running goals were unverified and that body weight could not
         be assessed without a current logged weight. Preston had weighed in
         that morning, and had run 13.9 miles the week before against a 14-mile
         target. Both complaints were true of this context object and false of
         the athlete.

         A gap is not an answer. These three are the arithmetic that makes one:
         where each goal is heading at the athlete's own rate, what they have
         actually run week by week, and what they weigh. */
      goalTrajectory:goalTrajectories(goals,records,setup?.excludedEfforts||[]),
      /* WHETHER EACH GOAL IS REACHABLE AT ALL, and the clash when several races
         share a date. The coach had the gap and the rate; it did not have the
         verdict, so it could describe how far away a goal was without ever
         saying it was not going to happen. */
      goalFeasibility:goalFeasibility(goals,records,{maxWeeklyMileage:Number(setup?.maxWeeklyMileage)||0,excludedEfforts:setup?.excludedEfforts||[]}),
      competingRaces:competingRaces(goals),
      weeklyRunning:weeklyRunning(records),
      /* THE NUMBERS THE COACH MAY QUOTE ABOUT RUNNING, computed once in
         lib/stats and handed over as facts. The model never adds up the log
         itself — that is how "your longest run" got said about a run that
         was not. */
      runningFacts:{last7Days:{miles:last7DayMiles(records,todayIso),runs:last7DayRuns(records,todayIso).map(line=>receiptLine(line))},longestRun30d:(()=>{const line=longestRun(records,todayIso,30);return line?{miles:Math.round(line.miles*10)/10,date:line.date}:null})(),longestRunEver:(()=>{const line=longestRun(records);return line?{miles:Math.round(line.miles*10)/10,date:line.date}:null})()},
      bodyWeight:bodyWeightSeries(records),availableLibrary:{exercises:exercises.filter(exercise=>exercise.enabled).map(exercise=>({name:exercise.name,kind:exercise.kind,muscles:exercise.muscles})),workouts:workouts.map(workout=>({name:workout.name,kind:workout.kind,summary:workout.summary}))},establishedSplit:setup?.splitDays.map(day=>({name:day.name,type:day.type,muscles:day.muscles}))||[],savedDailyRecommendation:recommendation,dueSplitDay:recommendation?.splitDay||{name:dueDay?.name||fallbackDay?.name,type:dueDay?.dayType||fallbackDay?.type,muscles:dueMuscles,mappedExercises:eligible.map(exercise=>exercise.name)},
    /* THE ATHLETE'S WHOLE TRAINING LIFE, at a resolution that fits. The coach
       used to receive the newest 180 days and nothing else, so it truthfully
       but uselessly answered "the history starts in 2026" to a question about
       2021 — while the answer sat in the database. Recent days stay in full
       detail; everything else arrives as per-year totals and lifetime bests,
       labelled as aggregates so no session gets invented. */
    careerSummary:career,deterministicRecommendation:recommendation||target,trainingSummary:intelligence,recentTrainingHistory:coachingHistory,evidenceRules:{savedRecommendationIsAuthoritative:true,strengthUsesBestRecentComparableSet:true,strengthUsesEpley:true,goalPrioritizesWorkButCannotForceLoad:true,missingWearableDataMustBeIgnored:true,aiCannotRewriteFacts:true,coachMayOnlyUseAvailableLibrary:true,goalIsNotAPrescription:true}}};
    if(isDemoMode)(window as unknown as {__forgeCoachContext?:unknown}).__forgeCoachContext=coachRequest.context;
    const response=await requestForgeCoach(coachRequest,fallback);
    /* WHEN THE COACH DID NOT ANSWER, SAY SO. A failed call used to drop the
       canned local fallback into the conversation as if Forge had spoken —
       the product's crux, silently replaced by boilerplate. The fallback
       still shows (it is honest, general guidance), under a line that says
       the coach could not be reached. */
    setConversation(turns=>[...turns,{role:'forge',text:response.source==='local'&&!isDemoMode?`I couldn’t reach the coach just now (${response.error||'no response'}). Here is the general guidance from your saved plan meanwhile:\n\n${response.answer}`:response.answer}]);setAnswerSource(response.source);setLimitNotice(response.source==='limit'?{text:response.answer,upgrade:Boolean(response.upgrade)}:null);const actions=response.source==='ai'?parseActions(response.actions,actionContext):response.source==='local'?localActions(value,actionContext):[];if(actions.length)setPending({actions,question:value});setCoachLoading(false)};
  const send=()=>{const value=custom.trim();if(!value)return;setCustom('');void ask(value)};
  const answerCheckIn=(note:AthleteNote,feeling:NoteFollowUp['feeling'])=>{const updated=applyCheckIn(note,feeling);upsert(updated);const area=note.area||kindLabel[note.kind];const text=updated.status==='cleared'?`Two good days in a row — I cleared the ${area} from your body log. Back to full training.`:feeling==='worse'?`Understood. I extended the buffer for your ${area}${updated.bufferUntil?` through ${formatNoteDate(updated.bufferUntil)}`:''} and will keep training around it.`:feeling==='better'?`Good sign. One more day like that and I'll clear the ${area}.`:`Logged — I'll keep training around your ${area}${updated.bufferUntil?` through ${formatNoteDate(updated.bufferUntil)}`:''} and check in tomorrow.`;setConversation(turns=>[...turns,{role:'forge',text}])};
  return <div className="narrow stack-xl coach-page"><PageIntro copy="Tell Forge what happened or what you need. Changes to your plan are shown first — one tap applies them."/>{activeNotes.length>0&&<div className="coach-learnings-strip"><span className="strip-label">TRAINING AROUND</span>{activeNotes.map(note=><span key={note.id} className={`learning-chip ${note.kind}`}>{note.area||kindLabel[note.kind]}{isBufferActive(note)&&note.bufferUntil?` · ${formatNoteDate(note.bufferUntil)}`:''}</span>)}<Link className="strip-manage" to="/profile?view=coach">Manage</Link></div>}<section className="coach-conversation">{(conversation.length>0||coachLoading||pendingCheckIns.length>0)&&<div className="coach-chat-stream">{pendingCheckIns.map(note=><div className="coach-message coach-checkin" key={note.id}><span>FORGE</span><p>Quick check-in — how's the {note.area||kindLabel[note.kind]} today?</p><div className="checkin-actions">{(['better','same','worse'] as const).map(feeling=><button type="button" key={feeling} onClick={()=>answerCheckIn(note,feeling)}>{feeling==='better'?'Better':feeling==='same'?'Same':'Worse'}</button>)}</div></div>)}{conversation.map((turn,index)=><div className={turn.role==='forge'?'coach-message':'athlete-message'} key={`${turn.role}-${index}`}><span>{turn.role==='forge'?'FORGE':'YOU'}</span><p>{turn.text}</p></div>)}{coachLoading&&<div className="coach-message"><span>FORGE</span><p>Thinking…</p></div>}</div>}{conversation.length===0&&!coachLoading&&pendingCheckIns.length===0&&<div className="coach-empty"><strong>Nothing asked yet</strong><p>Ask about today&rsquo;s session, the week ahead, or anything that hurts. Forge answers from your own logged training.</p></div>}<div className="question-chips">{questions.map(item=><button disabled={coachLoading} onClick={()=>void ask(item)} key={item}>{item}</button>)}</div><form className="coach-composer simple" onSubmit={event=>{event.preventDefault();send()}}><div className="composer-entry"><textarea value={custom} onChange={event=>setCustom(event.target.value)} rows={2} placeholder="Ask Forge anything…"/><button className="button" disabled={coachLoading}>Send</button></div></form>{pending&&<div className="adjustment-proposal coach-actions"><span>FORGE WOULD CHANGE</span><ul>{pending.actions.map(action=><li key={action.label}>{action.label}</li>)}</ul><footer><button className="button ghost" onClick={()=>setPending(null)}>Not now</button><button className="button" onClick={applyActions}>Apply</button></footer></div>}{adjustmentMessage&&!conversation.some(turn=>turn.text===adjustmentMessage)&&<div className="adjustment-message">{adjustmentMessage}</div>}{limitNotice&&<div className="coach-limit-notice"><span>DAILY LIMIT REACHED</span><p>{limitNotice.text}</p>{limitNotice.upgrade&&<Link className="button" to="/profile?view=billing">See Forge Pro →</Link>}</div>}</section><small className="coach-boundary">Forge provides training guidance, not medical advice. Plan changes are applied only when you tap Apply. Check-ins can be turned on in <Link to="/profile?view=coach">settings</Link>.</small></div>;
}
