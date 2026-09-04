import { useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { PageIntro, Metric } from '../components/AppShell';
import { openCoachBubble } from '../features/training/coachService';
import { athlete, friends, splitDays } from '../data/demo';
import { CardioBuilder } from '../components/CardioBuilder';
import { calculateEstimatedOneRepMax } from '../lib/strength';
import { useWorkoutHistory, type LoggedTopSet, type WorkoutRecord } from '../features/training/WorkoutHistoryProvider';
import { useProfileSetup } from '../features/profile/ProfileSetupProvider';
import { cardioMiles, formatCardioSummary, summarizeCardioDraft, type CardioLogDraft } from '../lib/cardioSession';
import { exerciseCategory, useTrainingLibrary } from '../features/training/TrainingLibraryProvider';
import { TopSetCards } from '../components/TopSetCards';
import { TopSetSheet, type TopSetDraft } from '../components/TopSetSheet';
import { useDailyRecommendation } from '../features/training/DailyRecommendationProvider';
import { sameLift, primaryMusclesFor } from '../lib/liftAliases';
import { DialField } from '../components/NumberDial';

function CompletedDayReview({record,unit,records,metric}:{record:WorkoutRecord;unit:string;records:WorkoutRecord[];metric:boolean}) {
  const completedTopSets=(record.topSets||[]).filter(set=>set.completed!==false);
  const topSets=completedTopSets.length?completedTopSets:(record.lift&&record.weight&&record.reps?[{muscle:record.muscles.find(muscle=>muscle!=='Cardio')||'Strength',lift:record.lift,weight:record.weight,reps:record.reps,calculatedMax:record.calculatedMax,completed:true}]:[]);
  const cardio=record.cardioSessions||[];
  if(!topSets.length&&!cardio.length)return null;
  const maxOf=(set:{weight:number;reps:number;calculatedMax?:number})=>set.calculatedMax??calculateEstimatedOneRepMax(set.weight,set.reps)??0;
  /* A set that beats every previous calc max for that lift is the whole point
     of the session — it should be the first thing the eye lands on, not a
     number you have to compare by hand against History. */
  const priorBest=(lift:string)=>records.reduce((best,item)=>item.id===record.id?best:(item.topSets||[]).reduce((inner,set)=>set.completed!==false&&sameLift(set.lift,lift)?Math.max(inner,maxOf(set)):inner,best),0);
  const distance=cardio.reduce((total,session)=>total+cardioMiles(session),0)*(metric?1.609344:1);
  const minutes=cardio.reduce((total,session)=>total+summarizeCardioDraft(session).minutes,0);
  const bestMax=topSets.reduce((best,set)=>Math.max(best,maxOf(set)),0);
  const stats=[
    topSets.length?{key:'sets',label:'Top sets',value:String(topSets.length),suffix:''}:null,
    bestMax?{key:'max',label:'Best calc max',value:String(bestMax),suffix:unit}:null,
    distance>=0.05?{key:'distance',label:'Distance',value:distance.toFixed(distance<10?2:1),suffix:metric?'km':'mi'}:null,
    minutes>=0.5?{key:'time',label:'Moving time',value:minutes>=60?`${Math.floor(minutes/60)}:${String(Math.round(minutes%60)).padStart(2,'0')}`:String(Math.round(minutes)),suffix:minutes>=60?'hr':'min'}:null,
  ].filter(Boolean) as Array<{key:string;label:string;value:string;suffix:string}>;
  return <div className="completed-day-review-grid day-recap">
    {stats.length>0&&<div className="day-recap-stats">{stats.map(stat=><div key={stat.key}><span>{stat.label}</span><strong>{stat.value}{stat.suffix?<i>{stat.suffix}</i>:null}</strong></div>)}</div>}
    {topSets.length>0&&<section className="completed-day-review-block">
      <header><span>TOP SETS</span><b>{topSets.length}</b></header>
      <div className="completed-day-review-list">{topSets.map((set,index)=>{
        const max=maxOf(set);
        const isPr=max>0&&max>priorBest(set.lift);
        return <article className={isPr?'is-pr':''} key={`${set.lift}-${index}`}>
          <div><strong>{set.lift}</strong><small>{set.muscle}</small></div>
          <div><b>{set.weight} {unit} <em>×</em> {set.reps}</b><small>{set.reps===1?`Real 1RM ${set.weight} ${unit}`:max?`Calc max ${max} ${unit}`:'Calculated max unavailable'}</small></div>
          {isPr&&<i className="pr-flag" title="Best calculated max on record">PR</i>}
        </article>;
      })}</div>
    </section>}
    {cardio.length>0&&<section className="completed-day-review-block">
      <header><span>CARDIO</span><b>{cardio.length}</b></header>
      <div className="completed-day-review-list">{cardio.map((session,index)=>{
        /* The row already names the activity on the left, and "steady" is an
           internal structure name, not something an athlete logged. Show the
           measurements only. */
        const detail=formatCardioSummary(session).replace(new RegExp(`^${session.activity.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')}\\s*·\\s*`),'');
        const lineCount=Array.isArray(session.prescription.legacyIntervals)?(session.prescription.legacyIntervals as unknown[]).length:0;
        return <article key={session.id||`${session.activity}-${index}`}>
          <div><strong>{session.activity||'Cardio'}</strong>{lineCount>1&&<small>{lineCount} segments</small>}</div>
          <div className="completed-cardio-summary"><b>{detail||formatCardioSummary(session)}</b>{session.prescription.note?<small>{String(session.prescription.note)}</small>:null}</div>
        </article>;
      })}</div>
    </section>}
  </div>;
}

export function WorkoutPage() {
  /* The editor initializes its state from the record being edited, so it must
     remount whenever the edit target changes (SPA navigation from the
     completed-day card, History links) or when the record it needs arrives
     from the async history load. Keying the editor handles both. */
  const [searchParams]=useSearchParams();
  const {records,loading}=useWorkoutHistory();
  const editParam=searchParams.get('edit');
  const recordReady=editParam?records.some(record=>record.id===editParam):false;
  if(editParam&&loading&&!recordReady)return <div className="narrow stack-xl"><section className="card"><p className="muted">Loading workout…</p></section></div>;
  return <WorkoutEditor key={`${editParam||'new'}:${recordReady?'1':'0'}:${searchParams.get('date')||''}`}/>;
}

function WorkoutEditor() {
  const navigate=useNavigate();
  const {addRecord,updateRecord,deleteRecord,records}=useWorkoutHistory();
  const {exercises,addExercise}=useTrainingLibrary();
  const {setup}=useProfileSetup();
  const {recommendation,markCompleted}=useDailyRecommendation();
  const weightUnit=setup?.units==='Metric'?'kg':'lb';
  const [searchParams]=useSearchParams();
  const editId=searchParams.get('edit');const editingRecord=editId?records.find(record=>record.id===editId):undefined;
  const today=new Date();const todayIso=`${today.getFullYear()}-${String(today.getMonth()+1).padStart(2,'0')}-${String(today.getDate()).padStart(2,'0')}`;const requestedDate=searchParams.get('date');const sessionIso=editingRecord?.date||(requestedDate&&/^\d{4}-\d{2}-\d{2}$/.test(requestedDate)?requestedDate:todayIso);const sessionDate=new Date(`${sessionIso}T12:00:00`);const todayLong=sessionDate.toLocaleDateString('en-US',{weekday:'long',month:'short',day:'numeric',year:'numeric'});const todayShort=sessionDate.toLocaleDateString('en-US',{weekday:'short',month:'short',day:'numeric',year:'numeric'});
  /* Mid-session returns continue logging; the completed screen appears only
     after the athlete explicitly finished the day. */
  /* ADDING A TOP SET MUST NOT END THE WORKOUT. Saving one set writes the day
     to the server, and the server marks the recommendation completed — which
     used to flow straight back into this check mid-render and replace the open
     editor with the "Today is logged" screen while the athlete was still
     logging. The completed screen is an ARRIVAL screen: once the athlete has
     touched this session, it never takes over. */
  const interacted=useRef(false);
  const completedOnEntry=!editId&&!requestedDate&&!interacted.current&&recommendation?.status==='completed'?records.find(record=>record.date===todayIso):undefined;
  const muscleOptions = ['Chest','Back','Shoulders','Quads','Hamstrings','Glutes','Biceps','Triceps','Forearms','Abs','Cardio'];
  const savedPlan=(()=>{try{return JSON.parse(localStorage.getItem('forge-training-plan-v1')||'null') as {days?:Array<{name:string;dayType:string;muscles?:string[];exercises?:string[]}>}|null}catch{return null}})();const savedDays=savedPlan?.days||[];const recommendationIndex=Math.max(0,(recommendation?.splitDay.position||1)-1);const [selectedPlanDay,setSelectedPlanDay]=useState(recommendationIndex);const [dayOverride,setDayOverride]=useState(false);const savedDay=savedDays[selectedPlanDay];const plannedDay=dayOverride&&savedDay?{name:savedDay.name,type:savedDay.dayType[0].toUpperCase()+savedDay.dayType.slice(1),muscles:savedDay.muscles||[],exercises:savedDay.exercises||[]}:recommendation?{name:recommendation.splitDay.name,type:recommendation.splitDay.type[0].toUpperCase()+recommendation.splitDay.type.slice(1),muscles:recommendation.splitDay.muscles,exercises:recommendation.splitDay.exercises}:savedDay?{name:savedDay.name,type:savedDay.dayType[0].toUpperCase()+savedDay.dayType.slice(1),muscles:savedDay.muscles||[],exercises:savedDay.exercises||[]}:setup?.splitDays.find(day=>day.type!=='Rest');
  /* Records saved by an older build carried only ['Cardio'] as muscles even on
     strength days. When editing such a record, recover the muscles from its
     title so the athlete's selections are never silently gone. */
  /* THREE WAYS TO START A DAY, AND NO MORE. Forge's recommendation, a day the
   athlete picks out of their own split, or a blank sheet where they choose the
   muscle groups. "Repeat a recent workout" was a fourth path that copied an
   old day's structure — it competed with the recommendation, produced days
   that matched neither the split nor the plan, and gave the athlete a choice
   they did not need to make. */
  const [workoutSource,setWorkoutSource]=useState<'plan'|'split'|'blank'>(searchParams.get('source')==='blank'?'blank':searchParams.get('source')==='split'?'split':'plan');
  /* Start-fresh days are defined by the muscles the athlete picks. */
  const [freeMuscles,setFreeMuscles]=useState<string[]>([]);
  const toggleFreeMuscle=(muscle:string)=>setFreeMuscles(current=>current.includes(muscle)?current.filter(item=>item!==muscle):[...current,muscle]);
  /* Both split-backed modes share every rule about exercises, muscles and
     identity; they differ only in whether the recommendation chose the day. */
  const usingSplit=workoutSource==='plan'||workoutSource==='split';
  const [hasCardio,setHasCardio]=useState(Boolean(editingRecord?.hasCardio));
  const [cardioSessions,setCardioSessions]=useState<CardioLogDraft[]>(editingRecord?.cardioSessions??[]);
  const queryTopSets=(()=>{try{const parsed=JSON.parse(searchParams.get('topSets')||'[]');return Array.isArray(parsed)?parsed:[]}catch{return []}})() as Array<{muscle:string;lift:string;weight:number|string;reps:number|string}>;
  const splitDayTopSets:LoggedTopSet[]=(savedDay?.muscles||[]).flatMap(muscle=>{const assigned=(savedDay?.exercises||[]).map(name=>exercises.find(exercise=>exercise.name===name)).find(exercise=>exercise?.enabled&&exercise.kind==='Strength'&&exerciseCategory(exercise)==='Strength'&&exercise.muscles.includes(muscle));return assigned?[{muscle,lift:assigned.name,weight:0,reps:0,completed:true}]:[]});
  const recommendationTopSets:LoggedTopSet[]=(recommendation?.topSets||[]).filter(set=>set.selected).map(set=>({recommendationTopSetId:set.id,muscle:set.muscle,lift:set.exercise,weight:set.weight,reps:set.reps,calculatedMax:set.calculatedMax||undefined,completed:true}));
  /* Editing shows ONLY what the record actually holds — a day logged without
     top sets must never be back-filled with today's recommendation or the
     split day's template sets. */
  const initialTopSets:LoggedTopSet[]=editingRecord?.topSets?.length?editingRecord.topSets:(queryTopSets.length?queryTopSets.map(set=>({muscle:set.muscle||'Primary',lift:set.lift,weight:Number(set.weight)||0,reps:Number(set.reps)||0,completed:true})):(editingRecord?.lift&&editingRecord.weight&&editingRecord.reps?[{muscle:editingRecord.muscles[0]||'Primary',lift:editingRecord.lift,weight:editingRecord.weight,reps:editingRecord.reps,calculatedMax:editingRecord.calculatedMax,completed:true}]:editingRecord?[]:workoutSource==='plan'&&recommendationTopSets.length?recommendationTopSets:usingSplit?splitDayTopSets:[]));
  const [topSets,setTopSets]=useState<LoggedTopSet[]>(initialTopSets);
  /* One way to add a top set: the sheet. */
  const [addingTopSet,setAddingTopSet]=useState(false);
  const openTopSetSheet=()=>{interacted.current=true;setAddingTopSet(true)};
  const [saved,setSaved]=useState(false);
  const [quickLoggedKeys,setQuickLoggedKeys]=useState<string[]>([]);const [quickLogMessage,setQuickLogMessage]=useState('');
  const [saveMessage,setSaveMessage]=useState('');
  const [bodyWeight,setBodyWeight]=useState(editingRecord?.bodyWeight?String(editingRecord.bodyWeight):(setup?.currentWeight||''));
  const [effort,setEffort]=useState(editingRecord?.effort||'');
  const [notes,setNotes]=useState(editingRecord?.notes||'');
  const liftMuscles:Record<string,string[]>={'Squat':['Quads','Hamstrings','Glutes'],'Hack Squat':['Quads','Glutes'],'Bench Press':['Chest'],'Smith Machine Shoulder Press':['Shoulders'],'Pull Ups':['Back'],'Lat Pulldown':['Back']};
  const sourceMuscles=usingSplit?(plannedDay?.muscles??[]):freeMuscles;
  /* The muscles a lift logs against: its primary movers (alias-folded), else
     its library entry, else the local map. */
  const liftPrimary=(name:string)=>primaryMusclesFor(name,exercises.find(exercise=>exercise.name===name)?.muscles??liftMuscles[name]??[]).filter(muscle=>muscle!=='Cardio');
  const plannedExerciseNames=new Set((((plannedDay as {exercises?:string[]}|undefined)?.exercises)||[]).map((name:string)=>String(name).trim().toLowerCase()));
  const restrictToPlannedExercises=usingSplit&&plannedExerciseNames.size>0;
  const strengthCatalogue=exercises.filter(exercise=>exercise.enabled&&exercise.kind==='Strength'&&exerciseCategory(exercise)==='Strength');
  const allowedStrengthExercises=strengthCatalogue.filter(exercise=>restrictToPlannedExercises
    ?plannedExerciseNames.has(exercise.name.trim().toLowerCase())
    :(!usingSplit||!plannedExerciseNames.size)&&(!usingSplit||!sourceMuscles.length||exercise.muscles.some(muscle=>sourceMuscles.includes(muscle)))||plannedExerciseNames.has(exercise.name.trim().toLowerCase()));
  /* The full library must always be reachable — day-mapped exercises lead,
     everything else stays available in a second group instead of vanishing. */
  const dayExerciseNames=new Set(allowedStrengthExercises.map(exercise=>exercise.name));
  const otherStrengthExercises=strengthCatalogue.filter(exercise=>!dayExerciseNames.has(exercise.name));
  const cardioOnlyDay=usingSplit&&!editingRecord&&recommendation?.splitDay.type==='cardio';
  const topSetKey=(set:LoggedTopSet)=>set.id||`${set.muscle}::${set.lift}::${set.weight}::${set.reps}`;
  /* WHAT IS SAVED IS WHAT THE RECORD SAYS IS SAVED. quickLoggedKeys only ever
     knew about sets saved in THIS visit, so reopening a finished day showed
     every completed set as a blank form waiting to be filled in — the work was
     done, the app was still asking for it. The saved day is the authority;
     this visit's keys are added because a set saved a moment ago may not have
     come back with the same id. */const completedTopSets=topSets.filter(set=>set.lift&&set.weight>0&&set.reps>0&&!quickLoggedKeys.includes(topSetKey(set))).map(set=>({...set,completed:true,calculatedMax:calculateEstimatedOneRepMax(set.weight,set.reps)??undefined}));
  const updateTopSet=(index:number,patch:Partial<LoggedTopSet>)=>setTopSets(current=>current.map((set,setIndex)=>setIndex===index?{...set,...patch}:set));
  /* A TOP SET NEEDS A DAY TO BELONG TO. Which split day a lift "belongs" to is
     not something Forge can infer — a squat on a chest day is either a leg day
     or a chest day with a squat on it, and only the athlete knows which. The
     three source buttons at the top of this screen already answer it, so that
     is the answer: Forge recommended, a day from the split, or a fresh day
     named by the muscles chosen for it. Until one of them names the day, a top
     set has nothing to attach to and saving is refused with the reason. */
  const dayLabel=usingSplit?(plannedDay?.name||''):freeMuscles.filter(muscle=>muscle!=='Cardio').join(' + ');
  const noDayReason=dayLabel?'':(usingSplit?'Choose which day of your split this is, at the top.':'Pick the muscle groups you trained, at the top — they name this workout.');
  const savedTopSetKeys=(records.find(record=>record.date===sessionIso)?.topSets||[]).filter(set=>set.completed!==false).map(topSetKey);
  const loggedTopSetKeys=Array.from(new Set([...savedTopSetKeys,...quickLoggedKeys]));
  const addBlankTopSet=()=>setTopSets(current=>[...current,{id:`top-set-${Date.now()}`,muscle:'',lift:'',weight:0,reps:0,completed:true}]);const removeTopSet=(index:number)=>setTopSets(current=>current.filter((_,setIndex)=>setIndex!==index));
  const createExerciseForTopSet=(name:string,mappedMuscles:string[])=>{const created=addExercise({name,kind:'Strength',muscles:mappedMuscles,detail:'Added while logging · Weight + reps',enabled:true,custom:true});setTopSets(current=>{const blankIndex=current.findIndex(set=>!set.lift);if(blankIndex>=0)return current.map((set,index)=>index===blankIndex?{...set,lift:created.name,muscle:created.muscles.find(muscle=>sourceMuscles.includes(muscle))||created.muscles[0]||'Primary',weight:0,reps:0}:set);return[...current,{id:`top-set-${Date.now()}`,muscle:created.muscles.find(muscle=>sourceMuscles.includes(muscle))||created.muscles[0]||'Primary',lift:created.name,weight:0,reps:0,completed:true}]});setQuickLogMessage(`${created.name} was added to your exercise library.`)};
  /* THE SHEET IS THE ONE WAY IN. It hands back a finished answer — the lift
     (created in the library first when it is new), its muscle mapping, the
     load and the reps — so this adds the row and saves it in one step. The old
     path added an unsaved row the athlete then had to notice and save again. */
  const saveTopSetFromSheet=(draft:TopSetDraft)=>{
    if(draft.isNew)addExercise({name:draft.lift,kind:'Strength',muscles:draft.muscles,detail:'Added while logging · Weight + reps',enabled:true,custom:true});
    /* The set's own muscle prefers one the day is training, so the row reads in
       the day's terms; the exercise's own mapping is what it counts toward. */
    const muscle=draft.muscles.find(item=>sourceMuscles.includes(item))||draft.muscles[0]||'Primary';
    const added:LoggedTopSet={id:`top-set-${Date.now()}`,muscle,lift:draft.lift,weight:draft.weight,reps:draft.reps,completed:true};
    setTopSets(current=>[...current,added]);
    setAddingTopSet(false);
    quickLogTopSet(added);
  };
  /* Editing an old day must keep THAT day's split metadata — stamping today's
     recommendation onto a past record corrupted both the record and the cycle.
     A day override always carries the split id so the server cycle continues
     from the chosen day. */
  const activeSplitId=recommendation?.splitDay.splitId;
  const recommendationMetadata=editingRecord
    ?(dayOverride?{splitId:editingRecord.splitId||activeSplitId,splitPosition:selectedPlanDay+1}:{recommendationId:editingRecord.recommendationId,splitId:editingRecord.splitId,splitDayId:editingRecord.splitDayId,splitPosition:editingRecord.splitPosition})
    :usingSplit?(dayOverride?{splitId:activeSplitId,splitPosition:selectedPlanDay+1}:recommendation?{recommendationId:recommendation.id,splitId:recommendation.splitDay.splitId,splitDayId:recommendation.splitDay.id,splitPosition:recommendation.splitDay.position}:{}):{};
  /* Logging cardio writes it to the day immediately, exactly like saving a top
     set. It used to live only in component state until "Finish Day" — so a
     session that was typed in but never carried through the finish flow was
     lost with no error and nothing to show for it. */
  /* Today's saved day, if there is one. Cardio logged earlier has to come BACK
     into the builder — otherwise reopening the log shows an empty cardio
     section over a day that already has sessions, which reads as "it did not
     save" and invites logging the same run twice. */
  const todayRecord=records.find(record=>record.date===sessionIso);
  const cardioKey=(entries:CardioLogDraft[]=[])=>JSON.stringify(entries.map(entry=>`${entry.id}:${entry.summary}`));
  const cardioSignature=useRef(cardioKey(editingRecord?.cardioSessions??todayRecord?.cardioSessions));
  const persistCardio=(entries:CardioLogDraft[])=>{
    const signature=cardioKey(entries);
    if(signature===cardioSignature.current)return;
    interacted.current=true;
    const target=editingRecord||records.find(record=>record.date===sessionIso);
    /* Adopting what is already stored is not a change worth writing back. */
    if(target&&signature===cardioKey(target.cardioSessions)){cardioSignature.current=signature;return}
    cardioSignature.current=signature;
    if(target){
      const {id,...saved}=target;
      const muscles=Array.from(new Set([...(saved.muscles||[]).filter(muscle=>muscle!=='Cardio'),...(entries.length?['Cardio']:[])]));
      updateRecord(id,{...saved,muscles,cardioSessions:entries,hasCardio:entries.length>0});
      return;
    }
    if(!entries.length)return;
    addRecord({date:sessionIso,title:usingSplit?(plannedDay?.name||'Planned Workout'):'Custom Workout',
      muscles:['Cardio'],cardioSessions:entries,hasCardio:true,...recommendationMetadata});
  };
  const quickLogTopSet=(set:LoggedTopSet)=>{if(!set.lift||!set.weight||!set.reps)return;if(!dayLabel){setQuickLogMessage(noDayReason);return}interacted.current=true;const completed={...set,completed:true,calculatedMax:calculateEstimatedOneRepMax(set.weight,set.reps)??undefined};const primary=liftPrimary(set.lift);/* A DAY IS NAMED AFTER THE SPLIT DAY IT IS, NOT THE FIRST LIFT ON IT. Saving
     one set created "Top set · Back Squat", so a history of real training days
     read as a list of lifts — and the day carried the lift's muscles alone,
     not the day's. When the session belongs to a split day, that day names it
     and contributes its muscles; a set logged outside the split still falls
     back to the lift, because then there is no day to name it after. */
    const dayName=dayLabel;
    /* THE NAME IS THE ATHLETE'S; THE MUSCLES ARE THE LOG'S. Naming the day
       Chest & Back must not credit chest and back for a session that was one
       squat — insights and muscle frequency read this, and a phantom Chest
       here is a chest session that never happened. On a fresh day the muscles
       ARE what the athlete said they trained, so they stand. */
    const dayMuscles=usingSplit?[]:freeMuscles.filter(muscle=>muscle!=='Cardio');
    const result=addRecord({date:sessionIso,title:dayName||`Top set · ${set.lift}`,muscles:Array.from(new Set([...dayMuscles,...(primary.length?primary:[set.muscle])])),topSets:[completed],lift:set.lift,weight:set.weight,reps:set.reps,calculatedMax:completed.calculatedMax,hasCardio:false,...recommendationMetadata,selectedRecommendationTopSetIds:set.recommendationTopSetId?[set.recommendationTopSetId]:[]});if(!result.ok){setQuickLogMessage('That exact top set is already saved.');return}
    /* Saving a set keeps the session OPEN — only "Finish Day" completes the
       recommendation. The athlete keeps logging sets and cardio freely. */
    setQuickLoggedKeys(current=>[...current,topSetKey(set)]);setQuickLogMessage(`${set.lift} · ${set.weight} ${weightUnit} ×${set.reps} saved — keep logging, then Finish Day when you’re done.`)};
  /* DELETING A SAVED SET TAKES IT OUT OF THE DAY, not just off the screen.
     A set could be corrected but never removed, so a lift logged on the wrong
     day or mis-tapped from the sheet was permanent — and it kept counting
     toward calculated maxes, PRs and the wave. The day keeps its identity: only
     the set leaves, and a day left with nothing on it stays as the record of a
     day that was opened, exactly as one logged with only a body weight would. */
  const deleteLoggedTopSet=(index:number,set:LoggedTopSet)=>{
    const key=topSetKey(set);
    const sameDay=records.find(record=>record.date===sessionIso);
    if(sameDay){
      const remaining=(sameDay.topSets||[]).filter(saved=>{
        if(set.id&&saved.id)return saved.id!==set.id;
        if(set.recommendationTopSetId&&saved.recommendationTopSetId)return saved.recommendationTopSetId!==set.recommendationTopSetId;
        return topSetKey(saved)!==key;
      });
      const {id,...savedDay}=sameDay;
      const first=remaining[0];
      const muscles=Array.from(new Set([...remaining.map(item=>item.muscle),...(sameDay.hasCardio?['Cardio']:[])]));
      const result=updateRecord(id,{...savedDay,muscles:muscles.length?muscles:savedDay.muscles,topSets:remaining.length?remaining:undefined,lift:first?.lift,weight:first?.weight,reps:first?.reps,calculatedMax:first?.calculatedMax});
      if(!result.ok){setQuickLogMessage('That set could not be deleted. Refresh and try again.');return}
    }
    setTopSets(current=>current.filter((_,setIndex)=>setIndex!==index));
    setQuickLoggedKeys(current=>current.filter(item=>item!==key));
    setQuickLogMessage(`${set.lift} removed from this day.`);
  };
  const editLoggedTopSet=(index:number,original:LoggedTopSet,corrected:LoggedTopSet)=>{
    const sameDay=records.find(record=>record.date===sessionIso);if(!sameDay){setQuickLogMessage('The completed training day could not be found. Refresh and try again.');return false}
    const originalSignature=`${original.muscle}|${original.lift}|${original.weight}|${original.reps}`;let replaced=false;
    const nextSets=(sameDay.topSets||[]).map(savedSet=>{const matches=Boolean((original.recommendationTopSetId&&savedSet.recommendationTopSetId===original.recommendationTopSetId)||(original.id&&savedSet.id===original.id)||`${savedSet.muscle}|${savedSet.lift}|${savedSet.weight}|${savedSet.reps}`===originalSignature);if(!matches||replaced)return savedSet;replaced=true;return{...savedSet,...corrected,id:savedSet.id,recommendationTopSetId:savedSet.recommendationTopSetId||corrected.recommendationTopSetId,completed:true,calculatedMax:calculateEstimatedOneRepMax(corrected.weight,corrected.reps)??undefined}});
    if(!replaced){setQuickLogMessage('That completed top set could not be found. Refresh and try again.');return false}
    const firstSet=nextSets[0];const musclesForDay=Array.from(new Set([...nextSets.map(set=>set.muscle),...(sameDay.hasCardio?['Cardio']:[])]));const {id,...savedDay}=sameDay;
    const result=updateRecord(id,{...savedDay,muscles:musclesForDay,topSets:nextSets,lift:firstSet?.lift,weight:firstSet?.weight,reps:firstSet?.reps,calculatedMax:firstSet?.calculatedMax});if(!result.ok){setQuickLogMessage('The correction could not be saved. Refresh and try again.');return false}
    const localCorrected={...original,...corrected,completed:true,calculatedMax:calculateEstimatedOneRepMax(corrected.weight,corrected.reps)??undefined};setTopSets(current=>current.map((set,setIndex)=>setIndex===index?localCorrected:set));const oldKey=topSetKey(original);const newKey=topSetKey(localCorrected);setQuickLoggedKeys(current=>[...current.filter(key=>key!==oldKey),newKey]);setQuickLogMessage(`${corrected.lift} corrected to ${corrected.weight} ${weightUnit} ×${corrected.reps}.`);return true;
  };
  const choosePlanDay=(index:number)=>{const day=savedDays[index];const next:LoggedTopSet[]=(day?.muscles||[]).flatMap(muscle=>{const assigned=(day.exercises||[]).map(name=>exercises.find(exercise=>exercise.name===name)).find(exercise=>exercise?.enabled&&exercise.kind==='Strength'&&exerciseCategory(exercise)==='Strength'&&exercise.muscles.includes(muscle));return assigned?[{muscle,lift:assigned.name,weight:0,reps:0,completed:true}]:[]});setSelectedPlanDay(index);setTopSets(next);};
  const saveWorkout=async()=>{
    setSaved(false);
    // A training day is worth saving without a top set: a body-weight check-in, a
    // note, an effort rating or an already quick-logged set are all real records.
    // This guard used to demand a set/lift/cardio while the message promised
    // otherwise, and it was stricter than the one that opens the review.
    const planDayActive=(usingSplit||dayOverride)&&(plannedDay?.muscles||[]).some(muscle=>muscle!=='Cardio');if(!editingRecord&&!completedTopSets.length&&!hasCardio&&!quickLoggedKeys.length&&!bodyWeight&&!notes.trim()&&!effort&&!planDayActive){setSaveMessage('Add a top set or cardio entry before saving.');return}
    /* Once the day exists its title stands. Logging cardio creates the day up
       front, which advances the split cursor — recomputing the title here
       would then stamp the NEXT split day's name onto the session that was
       just logged. */
    const existingDay=records.find(record=>record.date===sessionIso);
    const title=editingRecord?.title||existingDay?.title||(usingSplit?(plannedDay?.name||'Planned Workout'):'Custom Workout');
    /* The sheet is the only way a set is entered, and it saves as completed —
       so the day's sets ARE the completed ones. There is no half-typed manual
       lift left on the screen to rescue at save time any more. */
    const savedTopSets=completedTopSets;const firstSet=savedTopSets[0];
    /* MUSCLES WORKED HAVE ONE SOURCE OF TRUTH. Training the split: the split
       day's muscle list, exactly. Custom work: the primary movers of the
       exercises actually logged — pull ups log Back, bench logs Chest. No
       hand-picked chips, no lift-of-the-moment additions. */
    const exerciseDriven=Array.from(new Set(savedTopSets.flatMap(set=>{const primary=liftPrimary(set.lift);return primary.length?primary:[set.muscle]}))).filter(muscle=>muscle!=='Cardio');
    const assignedDayMuscles=(editingRecord
      ?(dayOverride?savedDays[selectedPlanDay]?.muscles:editingRecord.splitPosition?savedDays[editingRecord.splitPosition-1]?.muscles:undefined)
      :((usingSplit||dayOverride)?plannedDay?.muscles:undefined))?.filter(muscle=>muscle!=='Cardio');
    const contentMuscles=assignedDayMuscles?.length?assignedDayMuscles:exerciseDriven.length?exerciseDriven:(editingRecord?.muscles||[]).filter(muscle=>muscle!=='Cardio');
    const draft={date:sessionIso,title,muscles:Array.from(new Set([...contentMuscles,...(hasCardio?['Cardio']:[])])),topSets:savedTopSets.length?savedTopSets:undefined,lift:firstSet?.lift,weight:firstSet?.weight,reps:firstSet?.reps,calculatedMax:firstSet?.calculatedMax,hasCardio,cardioSessions:hasCardio?cardioSessions:undefined,effort:effort||undefined,notes:notes.trim()||undefined,bodyWeight:bodyWeight?Number(bodyWeight):undefined,...recommendationMetadata,selectedRecommendationTopSetIds:savedTopSets.map(set=>set.recommendationTopSetId).filter((id):id is string=>Boolean(id))};
    /* A second session added to an already-saved day keeps THAT DAY's identity.
       Without this, the split cursor has advanced by the time the athlete comes
       back, and the add stamps the NEXT day's muscles and slot onto a finished
       workout — Colton's chest-and-back badge on a legs day, seen from the
       other side. */
    if(existingDay&&!editingRecord&&!dayOverride){
      draft.muscles=Array.from(new Set([...existingDay.muscles.filter(muscle=>muscle!=='Cardio'),...exerciseDriven,...(hasCardio||existingDay.hasCardio?['Cardio']:[])]));
      draft.recommendationId=existingDay.recommendationId;draft.splitId=existingDay.splitId;draft.splitDayId=existingDay.splitDayId;draft.splitPosition=existingDay.splitPosition;
    }
    /* THE LOGGED DAY'S SPLIT IDENTITY FOLLOWS ITS CONTENT, not the queue.
       Completing a recommendation used to assume you did the recommended day:
       Colton trained legs on a Chest & Back day and the save stamped position
       1 onto a squat session, marking Chest & Back done and lying to the
       cursor. If what was actually logged matches a different split day and
       matches the recommended day NOT AT ALL, the day is saved as the one it
       is — and the recommendation is left uncompleted, so the cycle continues
       from where the athlete really trained. */
    let contentMismatch=false;
    if(workoutSource==='plan'&&!editingRecord&&!dayOverride&&recommendation&&savedDays.length){
      /* Judge by EVIDENCE — sets that were actually logged (plus an explicit
         manual muscle selection), never the recommendation's own muscle list,
         which rides into draft.muscles whether or not anything was done. */
      const evidence=new Set<string>([...exerciseDriven,...(existingDay?.topSets||[]).flatMap(set=>{const primary=liftPrimary(set.lift);return primary.length?primary:[set.muscle]})].filter(muscle=>muscle!=='Cardio'));
      if(evidence.size){
        const scoreOf=(muscles:string[]=[])=>muscles.reduce((total,muscle)=>total+(evidence.has(muscle)?1:0),0);
        const recScore=scoreOf(recommendation.splitDay.muscles);
        let bestIndex=-1,bestScore=0;
        savedDays.forEach((day,index)=>{const score=scoreOf((day.muscles||[]).filter(muscle=>muscle!=='Cardio'));if(score>bestScore){bestScore=score;bestIndex=index}});
        if(recScore===0&&bestScore>0&&bestIndex+1!==recommendation.splitDay.position){
          contentMismatch=true;
          draft.title=savedDays[bestIndex].name||title;
          draft.recommendationId=undefined;draft.splitDayId=undefined;
          draft.splitId=activeSplitId;draft.splitPosition=bestIndex+1;
          /* The matched split day's list IS the muscles — split stays the
             single source of truth once the right day is identified. */
          draft.muscles=Array.from(new Set([...(savedDays[bestIndex].muscles||[]).filter(muscle=>muscle!=='Cardio'),...(hasCardio||existingDay?.hasCardio?['Cardio']:[])]));
        }
      }
    }
    const result=editingRecord?updateRecord(editingRecord.id,draft):addRecord(draft);
    if(!result.ok){setSaveMessage(editingRecord?'This workout could not be found. Return to History and try again.':'This exact workout is already in your history. Nothing was saved twice.');return}
    // Only real training closes out the day's recommendation. A body-weight
    // check-in or a note must not consume the workout you still owe.
    if(!editingRecord&&workoutSource==='plan'&&!contentMismatch&&(savedTopSets.length>0||hasCardio||planDayActive))markCompleted();setSaved(true);navigate(editingRecord?'/history':'/');
  };
  const removeWorkout=async()=>{if(!editingRecord||!window.confirm(`Delete the workout record for ${todayShort}? This permanently removes it from History and Insights.`))return;setSaveMessage('');const removed=await deleteRecord(editingRecord.id);if(removed)navigate('/history');else setSaveMessage('The workout could not be deleted. Check the sync message and try again.')};
  if(editId&&!editingRecord)return <div className="narrow stack-xl"><PageIntro eyebrow="WORKOUT HISTORY" title="Workout not found" copy="This workout may have been removed from this device."/><section className="card"><Link className="button" to="/history">Return to History</Link></section></div>;
  if(completedOnEntry)return <div className="narrow stack-xl workout-editor completed-workout-entry">
    <PageIntro eyebrow={todayLong.toUpperCase()} title="Today is logged"/>
    <section className="card completed-day-card">
      <span className="completed-day-check">✓</span>
      <div><span className="eyebrow">TODAY · COMPLETE</span><h2>{completedOnEntry.title}</h2><p>{completedOnEntry.muscles.filter(muscle=>muscle!=='Cardio').join(' · ')||(completedOnEntry.hasCardio?'Cardio':'Completed training')}</p></div>
      <CompletedDayReview record={completedOnEntry} unit={weightUnit} records={records} metric={weightUnit==='kg'}/>
      <footer><Link className="button" to={`/workout?edit=${completedOnEntry.id}&cardio=1`}>＋ Add a session</Link><Link className="button ghost" to={`/workout?edit=${completedOnEntry.id}`}>Edit workout</Link><Link className="button ghost" to="/history">Open history</Link></footer>
      <small className="second-session-hint">Two-a-day? “Add a session” opens today’s log so an evening run or extra lift lands on the same training day.</small>
    </section>
  </div>;
  return <div className="narrow stack-xl workout-editor"><PageIntro copy={editingRecord?'Update the saved results for this day. History and insights will refresh automatically.':requestedDate?'Log anything you completed on this date. It will be saved as one editable training day.':'Start with the plan, repeat a previous session, or record only what you performed.'} />
    {editingRecord&&<section className="coach-loaded"><div><span>EDITING COMPLETED SESSION</span><strong>{editingRecord.title}</strong><small>Saving replaces this session on {todayShort}; it will not create a duplicate.</small></div><div className="button-row"><Link to="/history">Cancel</Link><button type="button" className="text-button danger" onClick={removeWorkout}>Delete workout</button></div></section>}
    {editingRecord&&savedDays.length>0&&<section className="card form-card edit-split-assign"><label className="plan-day-picker">Split day for this workout<select value={dayOverride?String(selectedPlanDay):(editingRecord.splitPosition?String(editingRecord.splitPosition-1):'')} onChange={event=>{if(event.target.value===''){setDayOverride(false);return}const index=Number(event.target.value);setSelectedPlanDay(index);setDayOverride(true)}}><option value="">Not assigned</option>{savedDays.map((day,index)=><option key={`${day.name}-${index}`} value={index}>{day.name}{editingRecord.splitPosition===index+1?' · currently assigned':''}</option>)}</select></label><small>Assigning a split day counts this session toward it and the cycle continues from there.</small></section>}
    {searchParams.get('source')==='recommendation'&&recommendation&&<section className="coach-loaded"><div><span>SAVED DAILY RECOMMENDATION</span><strong>{recommendation.splitDay.name} · {topSets.length} selected top {topSets.length===1?'set':'sets'}</strong><small>Today, Log, and Coach are using recommendation {recommendation.id?.slice(0,8)||recommendation.date}. Record actual results; only completed items advance progression.</small></div><button className="text-button" onClick={()=>openCoachBubble('Why is this my saved workout today?')}>Why this workout?</button></section>}
    {!editingRecord&&<section className="card workout-source-card compact-workout-source"><div className="workout-date"><span className="eyebrow">LOGGING · {todayShort.toUpperCase()}</span><strong>{workoutSource==='plan'?(plannedDay?.name||'Today’s recommendation'):workoutSource==='split'?(savedDay?.name||'Choose a split day'):'Start fresh'}</strong></div><div className="source-options"><button className={workoutSource==='plan'?'active':''} onClick={()=>{setWorkoutSource('plan');setDayOverride(false);setSelectedPlanDay(recommendationIndex);setTopSets(recommendationTopSets)}}><span>FORGE</span><b>Recommended</b></button><button className={workoutSource==='split'?'active':''} onClick={()=>{setWorkoutSource('split');setDayOverride(true);setTopSets([])}}><span>SPLIT</span><b>Choose day</b></button><button className={workoutSource==='blank'?'active':''} onClick={()=>{setWorkoutSource('blank');setDayOverride(false);setTopSets([])}}><span>FRESH</span><b>Start fresh</b></button></div>{workoutSource==='split'&&(savedDays.length>0?<label className="plan-day-picker">Which day of your split<select value={selectedPlanDay} onChange={event=>{const index=Number(event.target.value);setSelectedPlanDay(index);setDayOverride(true);setTopSets([])}}>{savedDays.map((day,index)=><option key={`${day.name}-${index}`} value={index}>{day.name}{recommendation&&index===recommendationIndex?' · due today':''}</option>)}</select></label>:<p className="empty-history">Build a split in Plan first — then its days appear here.</p>)}{workoutSource==='split'&&savedDay&&<div className="saved-recommendation-source"><span>Split position {selectedPlanDay+1}</span><strong>{(savedDay.muscles||[]).filter(muscle=>muscle!=='Cardio').join(' · ')||savedDay.dayType}</strong><small>Logged against this day, wherever the cycle is.</small></div>}{workoutSource==='plan'&&recommendation&&<div className="saved-recommendation-source"><span>Split position {recommendation.splitDay.position}</span><strong>{recommendation.splitDay.muscles.join(' · ')||recommendation.splitDay.type}</strong><small>Synced with Today and Coach.</small></div>}{workoutSource==='blank'&&<div className="free-muscle-picker"><div><span className="field-caption">WHAT DID YOU TRAIN?</span><small>Pick the muscle groups — they decide which exercises are offered and what this day counts toward.</small></div><div className="muscle-picker">{muscleOptions.filter(muscle=>muscle!=='Cardio').map(muscle=><button type="button" className={freeMuscles.includes(muscle)?'muscle-chip active':'muscle-chip'} onClick={()=>toggleFreeMuscle(muscle)} key={muscle}>{muscle}</button>)}</div>{!freeMuscles.length&&<small className="free-muscle-hint">Cardio-only day? Leave these empty and log it below.</small>}</div>}</section>}
    {/* LOGGING IS LINEAR AND SMALL. The old screen opened on a full entry form —
        lift dropdown, history browser, two dials, a calculated-max card — all
        for a set that had not happened yet. The day now reads as a compact list;
        entering a set is a popup (the sheet), so the screen holds the day and
        the popup holds the question. */}
    {!topSets.length&&!cardioOnlyDay&&<section className="card form-card top-set-launch"><div className="section-title compact-title"><span>01</span><div><h3>Top sets</h3><p>The one heaviest meaningful set per lift. Tap to log one in a popup — it saves as completed.</p></div></div><button type="button" className="button add-top-set-button" onClick={openTopSetSheet}>＋ Log a top set</button></section>}
    {addingTopSet&&<TopSetSheet unit={weightUnit} exercises={strengthCatalogue} suggested={allowedStrengthExercises.map(exercise=>exercise.name)} dayMuscles={sourceMuscles.filter(muscle=>muscle!=='Cardio')} existing={topSets.map(set=>set.lift).filter(Boolean)} onClose={()=>setAddingTopSet(false)} onSave={saveTopSetFromSheet} blockedReason={noDayReason}/>}
    {topSets.length>0&&<TopSetCards planLabel={plannedDay?.name?`FROM ${plannedDay.name.toUpperCase()}`:undefined} sets={topSets} onChange={updateTopSet} onQuickLog={quickLogTopSet} onEditLogged={editLoggedTopSet} loggedKeys={loggedTopSetKeys} exercises={allowedStrengthExercises} muscles={sourceMuscles.filter(muscle=>muscle!=='Cardio')} records={records} date={sessionIso} unit={weightUnit} onAdd={openTopSetSheet} onRemove={removeTopSet} onDeleteLogged={deleteLoggedTopSet} onCreateExercise={createExerciseForTopSet} blockedReason={noDayReason}/>}
    {quickLogMessage&&<div className="quick-log-flash" role="status"><small>{quickLogMessage}</small></div>}
    <CardioBuilder sectionNumber={cardioOnlyDay?"01":"02"} onEntriesChange={(hasEntries,entries)=>{setHasCardio(hasEntries);setCardioSessions(entries);persistCardio(entries)}} initialOpen={Boolean(searchParams.get('cardio'))} initialEntries={editingRecord?.cardioSessions??todayRecord?.cardioSessions} plannedSummary={workoutSource==='plan'&&recommendation?.cardio?.selected?recommendation.cardio.summary:undefined}/>
    <section className="card form-card session-details"><div className="section-title compact-title"><span>03</span><div><h3>Session Details</h3><p>Review the context Forge will save with this workout.</p></div></div><div className="field-grid session-context"><DialField label="Today's body weight" kind="bodyweight" unit={weightUnit} value={bodyWeight} onChange={setBodyWeight} hint="Optional check-in used for body-weight trends" /><label>Session effort<select value={effort} onChange={e=>setEffort(e.target.value)}><option value="">Not recorded</option><option>Easy</option><option>Moderate</option><option>Hard</option><option>Max effort</option></select></label></div><label>Workout notes<textarea value={notes} onChange={e=>setNotes(e.target.value)} rows={4} placeholder="How did the session feel? Add anything the numbers do not capture." /></label></section>
    {saveMessage&&<div className={saved?'save-confirmation':'save-confirmation save-warning'} role="status">{saveMessage}{saved&&<> <Link to="/history">View day in History →</Link></>}</div>}<button className="button wide save-workout" onClick={saveWorkout}>{saved?'Day finished ✓':'Finish Day →'}</button></div>;
}

export function InsightsPage() {
  return <div className="stack-xl"><PageIntro copy="True maxes, comparable sets, and training consistency — kept intentionally separate." />
    <section className="metrics-strip"><Metric value="1,210 lb" label="Strength total" delta="+35 lb in 90 days" /><Metric value="475 lb" label="Squat 1RM" /><Metric value="315 lb" label="Bench 1RM" /><Metric value="420 lb" label="Deadlift 1RM" /></section>
    <div className="dashboard-grid"><section className="card span-2"><div className="card-head"><div><span className="eyebrow">SQUAT · 12 MONTHS</span><h3>Tested 1RM progression</h3></div><select className="compact-select"><option>Squat</option><option>Bench Press</option></select></div><div className="line-chart"><div className="grid-lines"/><svg viewBox="0 0 600 190" preserveAspectRatio="none"><polyline points="0,155 85,148 170,118 255,126 340,85 425,92 510,48 600,31" fill="none" stroke="currentColor" strokeWidth="5" vectorEffect="non-scaling-stroke"/><circle cx="600" cy="31" r="7" fill="currentColor"/></svg><div className="chart-labels"><span>SEP</span><span>NOV</span><span>JAN</span><span>MAR</span><span>MAY</span><span>JUL</span></div></div></section><section className="card"><span className="eyebrow">PERSONAL RECORDS</span><div className="record-list">{[['Squat','475 lb','Jul 21'],['Bench','315 lb','Jul 21'],['Hack Squat','500 ×3','Aug 2'],['Pull Ups','105 ×5','Jul 31']].map(r=><div key={r[0]}><span>{r[0]}</span><strong>{r[1]}</strong><small>{r[2]}</small></div>)}</div></section></div></div>;
}

export function ProfilePage() {
  return <div className="stack-xl"><section className="profile-hero"><div className="avatar xlarge">PN</div><div><span className="eyebrow">ATHLETE PROFILE</span><h2>{athlete.name}</h2><p>@{athlete.username} · {athlete.level} · {athlete.goal}</p></div><Link className="button secondary" to="/onboarding">Edit profile</Link></section><section className="metrics-strip compact"><Metric value="190 lb" label="Current weight" /><Metric value="178 lb" label="Starting weight" /><Metric value={athlete.height} label="Height" /><Metric value={`${athlete.age}`} label="Age" /></section>
    <div className="profile-grid"><Link className="feature-card" to="/profile/split"><span className="feature-number">4 DAYS</span><h3>Build Your Split</h3><p>Push Strength · Pull Strength · Lower Body · Upper Volume</p><b>Manage training split →</b></Link><Link className="feature-card" to="/friends"><span className="feature-number">8 FRIENDS</span><h3>Your training circle</h3><p>Share only the progress metrics you choose.</p><b>Manage friends →</b></Link><Link className="feature-card" to="/settings/security"><span className="feature-number">SECURE</span><h3>Account & security</h3><p>Google sign-in, authenticator, and active sessions.</p><b>Open security →</b></Link><Link className="feature-card" to="/settings/billing"><span className="feature-number">PRO TRIAL</span><h3>Plan & billing</h3><p>14 days remaining. No charge during this prototype.</p><b>View plan →</b></Link></div></div>;
}

export function OnboardingPage() {
  const [step,setStep]=useState(1); return <div className="narrow stack-xl"><PageIntro eyebrow={`PROFILE SETUP · ${step} OF 3`} title={step===1?'Tell us about you':step===2?'Shape your training':'Privacy & preferences'} copy="This information makes recommendations safer, more relevant, and easier to compare over time." /><div className="stepper">{[1,2,3].map(n=><i key={n} className={n<=step?'active':''}/>)}</div><section className="card form-card">
    {step===1&&<><div className="field-grid"><label>Display name<input defaultValue="Preston Noland" /></label><label>Username<input defaultValue="prestonlifts" /></label><label>Date of birth<input type="date" defaultValue="1997-04-18" /></label><label>Height<input defaultValue="6 ft 0 in" /></label><label>Starting weight<input defaultValue="178 lb" /></label><label>Current weight<input defaultValue="190 lb" /></label></div></>}
    {step===2&&<><label>Primary goal<div className="choice-grid">{['Build strength','Build muscle','Improve endurance','General fitness'].map((x,i)=><button className={i===0?'choice active':'choice'} key={x}>{x}</button>)}</div></label><label>Experience level<select defaultValue="Advanced"><option>Beginner</option><option>Intermediate</option><option>Advanced</option><option>Competitive</option></select></label><label>Available equipment<textarea defaultValue="Barbell, rack, bench, cables, hack squat, dumbbells" /></label></>}
    {step===3&&<><label>Units<div className="segmented"><button className="active">Imperial</button><button>Metric</button></div></label><label>Profile visibility<select><option>Friends only</option><option>Private</option><option>Public</option></select></label><div className="toggle-row"><div><strong>Allow friend comparisons</strong><span>You still choose which metrics each friend can see.</span></div><input type="checkbox" defaultChecked /></div><div className="toggle-row"><div><strong>Training reminders</strong><span>Gentle reminders on scheduled workout days.</span></div><input type="checkbox" defaultChecked /></div></>}
    <div className="form-actions">{step>1&&<button className="button ghost" onClick={()=>setStep(step-1)}>Back</button>}<button className="button" onClick={()=>setStep(Math.min(3,step+1))}>{step===3?'Save profile':'Continue'} →</button></div></section></div>;
}

export function SplitBuilderPage() { return <div className="stack-xl"><PageIntro eyebrow="PROFILE · TRAINING PLAN" title="Build Your Split" copy="Give every training day a clear job. Your recommendations use this structure—not a generic weekly template." action={<button className="button">Save split</button>} /><section className="card split-summary"><div><span className="eyebrow">ACTIVE SPLIT</span><input className="title-input" defaultValue="Strength + Conditioning" /></div><div><strong>4</strong><span>training days</span></div><div><strong>3</strong><span>recovery days</span></div></section><div className="split-builder">{splitDays.map((d,i)=><section className="day-card" key={d.day}><div className="day-index">{String(i+1).padStart(2,'0')}</div><div className="day-content"><div className="card-head"><div><span className="eyebrow">{d.day}</span><h3>{d.name}</h3></div><button className="icon-button">•••</button></div><span className="field-caption">MUSCLE GROUPS</span><div className="tag-row">{d.groups.map(g=><span className="tag" key={g}>{g}</span>)}</div><span className="field-caption">FOCUS LIFTS</span><div className="lift-list">{d.lifts.map(l=><span key={l}>{l}<b>↗</b></span>)}</div></div></section>)}<button className="add-day">＋ Add training day</button></div></div> }

export function FriendsPage() { const [query,setQuery]=useState(''); return <div className="stack-xl"><PageIntro eyebrow="COMMUNITY" title="Train alongside your people" copy="Friendships are mutual. Progress stays private until you choose what to share." /><div className="search-box"><span>⌕</span><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Search by username" /><button>Search</button></div><section><div className="section-row"><h3>Friend requests</h3><span className="count">1</span></div><div className="request-card"><span className="avatar blue">ML</span><div><strong>Morgan Lee</strong><small>@morgantrains · 3 mutual friends</small></div><button className="button small-button">Accept</button><button className="button ghost small-button">Decline</button></div></section><section><div className="section-row"><h3>Your friends</h3><span className="muted">8 total</span></div><div className="friends-grid">{friends.map(f=><article className="friend-card" key={f.username}><div className="friend-top"><span className="avatar" style={{background:f.accent,color:'#08110e'}}>{f.initials}</span><span className="status-dot">{f.status}</span></div><h3>{f.name}</h3><p>@{f.username}</p><div className="friend-stats"><span><strong>{f.sessions}</strong>sessions / week</span><span><strong>{f.total}</strong>strength total</span></div><div className="button-row"><Link className="button secondary small-button" to="/insights/compare">Compare</Link><button className="icon-button">•••</button></div></article>)}</div></section></div> }

export function ComparePage() { return <div className="stack-xl"><PageIntro eyebrow="FRIEND INSIGHTS" title="You vs. Adam" copy="A useful comparison without turning training into a leaderboard." action={<select className="compact-select"><option>Adam Davis</option><option>Jordan Miles</option></select>} /><div className="compare-head"><div><span className="avatar xlarge">PN</span><strong>You</strong><small>@prestonlifts</small></div><span>VS</span><div><span className="avatar xlarge mint">AD</span><strong>Adam</strong><small>@adamlifts</small></div></div><section className="card compare-table"><div className="compare-row header"><span>METRIC</span><span>YOU</span><span>ADAM</span></div>{[['Strength total','1,210 lb','1,145 lb'],['Weekly sessions','4','5'],['Current streak','6 days','12 days'],['Squat 1RM','475 lb','455 lb'],['Bench 1RM','315 lb','330 lb']].map(r=><div className="compare-row" key={r[0]}><span>{r[0]}</span><strong>{r[1]}</strong><strong>{r[2]}</strong></div>)}</section><section className="privacy-note"><span>◉</span><div><strong>Adam shares 5 metrics with you</strong><p>Neither of you can see body weight, age, private notes, or workout details.</p></div><button>Edit what I share</button></section></div> }

export function SecurityPage() { return <div className="narrow stack-xl"><PageIntro eyebrow="ACCOUNT" title="Security" copy="Keep sign-in simple while protecting training history and personal information." /><section className="card settings-list"><div className="setting-row"><span className="setting-icon">G</span><div><strong>Google account</strong><small>preston@example.com</small></div><span className="verified">CONNECTED</span></div><div className="setting-row"><span className="setting-icon">#</span><div><strong>Authenticator app</strong><small>Add a Google Authenticator-compatible second step.</small></div><button className="button secondary small-button">Set up</button></div><div className="setting-row"><span className="setting-icon">◎</span><div><strong>Active sessions</strong><small>1 device · Chrome on macOS</small></div><button className="text-button">Review</button></div></section><section className="card"><span className="eyebrow">SIGN-IN POLICY</span><h3>Google is your primary identity</h3><p className="muted">Your username is public inside the app, but it is not a password. Optional authenticator codes add protection without creating a second password to remember.</p></section></div> }

export function BillingPage() { return <div className="stack-xl"><PageIntro eyebrow="MEMBERSHIP" title="Choose the support you need" copy="Billing is a visual prototype. No payment information is collected yet." /><div className="plans"><article className="plan-card"><span className="eyebrow">FREE</span><h3>$0 <small>/ forever</small></h3><p>Everything needed to log consistently.</p><ul><li>Workout and top-set logging</li><li>Goals and core insights</li><li>Up to 5 friends</li></ul><button className="button ghost wide">Current plan</button></article><article className="plan-card featured"><span className="plan-badge">RECOMMENDED</span><span className="eyebrow">PRO</span><h3>$7.99 <small>/ month</small></h3><p>Deeper guidance for serious progress.</p><ul><li>Advanced training insights</li><li>Unlimited friends and comparisons</li><li>AI-assisted programming</li><li>Data export and priority support</li></ul><button className="button wide">Start 14-day trial</button></article><article className="plan-card"><span className="eyebrow">COACH</span><h3>Coming soon</h3><p>Program and monitor multiple athletes.</p><ul><li>Coach dashboard</li><li>Athlete programming</li><li>Shared progress reports</li></ul><button className="button ghost wide" disabled>Join waitlist</button></article></div></div> }
