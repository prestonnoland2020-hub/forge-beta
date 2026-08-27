import { useMemo, useState } from 'react';
import { useProfileSetup } from '../features/profile/ProfileSetupProvider';
import { exerciseCategory, useTrainingLibrary } from '../features/training/TrainingLibraryProvider';

export type CreatedGoal = { type: string; title: string; target: string; date: string; connection: string; exercise?: string; metric?: string; current?: string; unit?: string; trackingSource?: string; checkInFrequency?: string; reminderEnabled?: boolean; eventTemplate?: string; eventDivision?: string; eventDistance?: string; eventDistanceUnit?: string; eventSurface?: string };

const goalTypes = [
  { id:'strength', label:'Strength', copy:'Set a real one-rep max target for a specific lift.' },
  { id:'endurance', label:'Endurance', copy:'Improve race time, distance, pace, or sustained effort.' },
  { id:'body', label:'Body Composition', copy:'Track a weight or measurement outcome responsibly.' },
];

export function GoalBuilder({ onClose, onSave, initialGoal }: { onClose:()=>void; onSave:(goal:CreatedGoal)=>void; initialGoal?:CreatedGoal }) {
  const {setup}=useProfileSetup();
  const initialType=goalTypes.find(item=>item.label===initialGoal?.type)?.id ?? 'strength';
  const [step,setStep]=useState(initialGoal?2:1); const [type,setType]=useState(initialType);
  /* Goal exercises come ONLY from the athlete's exercise library — free-typed
     or hardcoded names create data that can never match logged sets. An
     editing goal whose exercise predates the library stays selectable so old
     goals never silently re-point at a different lift. */
  const {exercises:libraryExercises}=useTrainingLibrary();
  const goalExerciseOptions=useMemo(()=>{
    const names=libraryExercises.filter(item=>item.enabled&&item.kind==='Strength'&&exerciseCategory(item)==='Strength').map(item=>item.name).sort((a,b)=>a.localeCompare(b));
    const current=initialGoal?.exercise;
    return current&&!names.includes(current)?[current,...names]:names;
  },[libraryExercises,initialGoal?.exercise]);
  /* A body-composition goal has no exercise. One saved before that was enforced
   carries whatever lift the builder happened to be showing, which rendered as
   "BODY COMPOSITION · Squat" — drop it on the way in so re-saving heals it. */
const [exercise,setExercise]=useState(initialGoal?.type==='Body Composition'?'':(initialGoal?.exercise ?? '')); const [metric,setMetric]=useState(initialGoal?.type==='Strength'?'Real 1RM':initialGoal?.type==='Body Composition'?'Body weight':initialGoal?.metric ?? 'Real 1RM');
  const [current,setCurrent]=useState(initialGoal?.current ?? ''); const [target,setTarget]=useState(initialGoal?.target?.split(' ')[0] ?? ''); const [unit,setUnit]=useState(initialGoal?.unit ?? initialGoal?.target?.split(' ').slice(1).join(' ') ?? 'lb');
  const [targetDate,setTargetDate]=useState(initialGoal?.date ?? (()=>{const date=new Date();date.setDate(date.getDate()+84);return date.toISOString().slice(0,10)})());
  const [connection,setConnection]=useState(initialGoal?.connection ?? setup?.splitDays.find(day=>day.type!=='Rest')?.name ?? 'No fixed day');
  const [muscles,setMuscles]=useState<string[]>(['Quads','Glutes','Hamstrings']);
  const standardEnduranceEvents=['1 Mile Run','5K Run','10K Run','Half Marathon','Marathon','HYROX','Cycling','Rowing','Swimming'];
  const [customEnduranceEvent,setCustomEnduranceEvent]=useState(initialGoal?.type==='Endurance'&&!standardEnduranceEvents.includes(initialGoal.exercise ?? '')?initialGoal.exercise ?? '':'');
  const [eventDivision,setEventDivision]=useState(initialGoal?.eventDivision ?? "Men's Open");
  const [eventDistance,setEventDistance]=useState(initialGoal?.eventDistance ?? '15');
  const [eventDistanceUnit,setEventDistanceUnit]=useState(initialGoal?.eventDistanceUnit ?? 'kilometers');
  const [eventSurface,setEventSurface]=useState(initialGoal?.eventSurface ?? 'Road');
  const [isCustomRun,setIsCustomRun]=useState(initialGoal?.eventTemplate==='custom-running-event');
  const muscleOptions=['Chest','Back','Shoulders','Quads','Glutes','Hamstrings','Biceps','Triceps','Forearms','Abs','Cardio'];
  const selectedType=goalTypes.find(item=>item.id===type)!;
  const enduranceUnits:Record<string,string[]>={
    'Finish time':['mm:ss','hh:mm:ss'],
    'Distance':['miles','kilometers','meters','yards'],
    'Average pace':['min/mi','min/km','sec/100m','sec/500m'],
    'Average speed':['mph','km/h','m/s'],
    'Sustained duration':['minutes','hours','hh:mm:ss'],
    'Elevation gain':['feet','meters'],
    'Energy output':['calories','kilojoules'],
    'Repetitions':['reps','rounds','lengths','flights'],
    'Completion':['yes/no','events completed']
  };
  const unitOptions=useMemo(()=>type==='strength'?['lb','kg','reps','seconds']:type==='endurance'?(enduranceUnits[metric] ?? ['minutes']):type==='muscle'?['inches','centimeters','lb lean mass','kg lean mass','photo check-in']:type==='body'?['lb','kg']:type==='consistency'?['sessions/week','workouts/month','days/week','days streak','minutes/week']:['bpm','reps','steps/day','calories/day','hours/night','nights/week','sessions/week','days/week','minutes','seconds','miles','kilometers','meters','yards','lb','kg','inches','centimeters','percent','yes/no'],[type,metric]);
  const title=useMemo(()=>type==='strength'?`${target} ${unit} ${exercise}`:type==='endurance'?`${exercise} · ${target} ${unit}`:type==='muscle'?`Develop ${muscles.join(', ')}`:type==='body'?`${target} ${unit} body-weight goal`:type==='consistency'?`${target} sessions per week`:`${exercise}: ${target} ${unit}`,[type,target,unit,exercise,muscles]);
  const toggleMuscle=(muscle:string)=>setMuscles(items=>items.includes(muscle)?items.filter(item=>item!==muscle):[...items,muscle]);
  const chooseType=(next:string)=>{setType(next);setCurrent('');setTarget('');if(next==='endurance'){setExercise('5K Run');setMetric('Finish time');setUnit('mm:ss');setTrackingSource('Workout history')}else if(next==='body'){setExercise('');setMetric('Body weight');setUnit(setup?.units==='Metric'?'kg':'lb')}else{setExercise('Squat');setMetric('Real 1RM');setUnit(setup?.units==='Metric'?'kg':'lb');setTrackingSource('Workout history')}};
  const chooseEnduranceEvent=(value:string)=>{if(value==='Custom event'||value==='Custom running event'){const running=value==='Custom running event';setIsCustomRun(running);setCustomEnduranceEvent(running?'My Running Event':'');setExercise(running?'My Running Event':'');if(running){setMetric('Finish time');setUnit('hh:mm:ss');setTrackingSource('Workout history')}}else{setIsCustomRun(false);setCustomEnduranceEvent('');setExercise(value);if(['Half Marathon','Marathon'].includes(value)){setMetric('Finish time');setUnit('hh:mm:ss');setCurrent('');setTarget('');setTrackingSource('Workout history')}if(value==='HYROX'){setMetric('Finish time');setUnit('hh:mm:ss');setCurrent('');setTarget('');setTrackingSource('Workout history')}}};
  const chooseEnduranceMetric=(value:string)=>{setMetric(value);setUnit(enduranceUnits[value][0]);setCurrent('');setTarget('')};
  return <div className="goal-builder-backdrop" role="dialog" aria-modal="true" aria-label="Create a new goal">
<section className="goal-builder">
<header>
<div>
<span className="eyebrow">{initialGoal?'EDIT GOAL':'NEW GOAL'} · STEP {step} OF 3</span>
<h2>{step===1?'Choose an outcome':step===2?'Define success':'Connect your training'}</h2>
</div>
<button onClick={onClose} aria-label="Close goal builder">×</button>
</header>
<div className="goal-builder-progress">{[1,2,3].map(value=>
<i className={value<=step?'active':''} key={value}/>)}</div>
    {step===1&&<div className="goal-type-grid">{goalTypes.map(item=>
<button className={type===item.id?'active':''} onClick={()=>chooseType(item.id)} key={item.id}>
<b>{item.label}</b>
<span>{item.copy}</span>
</button>)}</div>}
    {step===2&&<div className="goal-fields">
<div className="goal-selection-banner">
<span>{selectedType.label.toUpperCase()} GOAL</span>
<strong>{title}</strong>
</div>{type==='strength'&&<div className="field-grid">
<label>Goal exercise<select value={exercise} onChange={e=>setExercise(e.target.value)}>
<option value="">Choose from your exercise library</option>
{goalExerciseOptions.map(name=><option key={name}>{name}</option>)}
</select>
</label>
{!goalExerciseOptions.length&&<small className="goal-exercise-hint">Your library has no strength exercises yet — add one from the Log page and it appears here.</small>}
<label>Progress metric<select value="Real 1RM" disabled aria-label="Strength progress metric">
<option>Real 1RM</option>
</select>
<small>Only a completed one-rep set counts toward this goal.</small></label>
</div>}{type==='endurance'&&<div className="field-grid">
<label>Activity or event<select value={isCustomRun?'Custom running event':customEnduranceEvent||!standardEnduranceEvents.includes(exercise)?'Custom event':exercise} onChange={e=>chooseEnduranceEvent(e.target.value)}>
<option>1 Mile Run</option>
<option>5K Run</option>
<option>10K Run</option>
<option>Half Marathon</option>
<option>Marathon</option>
<option>Custom running event</option>
<option>HYROX</option>
<option>Cycling</option>
<option>Rowing</option>
<option>Swimming</option>
<option>Custom event</option>
</select>
</label>
<label>Progress metric<select value={metric} onChange={e=>chooseEnduranceMetric(e.target.value)}>
<option>Finish time</option>
<option>Distance</option>
<option>Average pace</option>
<option>Average speed</option>
<option>Sustained duration</option>
<option>Elevation gain</option>
<option>Energy output</option>
<option>Repetitions</option>
<option>Completion</option>
</select>
</label>{(customEnduranceEvent!==''||!standardEnduranceEvents.includes(exercise))&&<label className="full-field">Event name<input autoFocus value={customEnduranceEvent} placeholder="e.g. Lakeside 15K, Trail Ultra, Stadium Stair Climb" onChange={e=>{setCustomEnduranceEvent(e.target.value);setExercise(e.target.value)}}/><small>Name the event your way; Forge will standardize how progress is measured.</small></label>}
</div>}{type==='endurance'&&isCustomRun&&<div className="running-event-builder">
<div><span className="field-caption">CUSTOM RUNNING EVENT</span><strong>Define the course</strong><small>The race distance describes the event. Your selected progress metric still determines the goal.</small></div>
<div className="running-event-fields"><label>Race distance<input inputMode="decimal" value={eventDistance} onChange={e=>setEventDistance(e.target.value)} /></label><label>Distance unit<select value={eventDistanceUnit} onChange={e=>setEventDistanceUnit(e.target.value)}><option>miles</option><option>kilometers</option><option>meters</option></select></label><label>Surface<select value={eventSurface} onChange={e=>setEventSurface(e.target.value)}><option>Road</option><option>Track</option><option>Trail</option><option>Treadmill</option><option>Mixed terrain</option></select></label></div>
<div className="event-summary"><span>{eventDistance || '—'} {eventDistanceUnit}</span><b>{eventSurface}</b><small>Forge can use this distance for finish-time, pace, and training-volume calculations.</small></div>
</div>}{type==='endurance'&&exercise==='HYROX'&&<div className="event-template">
<div className="event-template-head"><div><span className="field-caption">RECOGNIZED EVENT TEMPLATE</span><strong>HYROX race structure loaded</strong></div><label>Division<select value={eventDivision} onChange={e=>setEventDivision(e.target.value)}><option>Women's Open</option><option>Men's Open</option><option>Women's Pro</option><option>Men's Pro</option><option>Doubles Women</option><option>Doubles Men</option><option>Doubles Mixed</option><option>Relay Women</option><option>Relay Men</option><option>Relay Mixed</option></select></label></div>
<p>8 × 1 km runs, with one station after every run. Division controls the prescribed competition loads.</p>
<ol>{['1,000 m SkiErg','50 m Sled Push','50 m Sled Pull','80 m Burpee Broad Jumps','1,000 m Row','200 m Farmers Carry','100 m Sandbag Lunges','100 Wall Balls'].map((station,index)=><li key={station}><i>{index+1}</i><span><b>1 km Run</b><small>{station}</small></span></li>)}</ol>
<small className="template-note">Forge will track overall finish time, run splits, station splits, transition time, and division-specific loads separately.</small>
</div>}{type==='muscle'&&<label>Priority muscle groups<div className="muscle-picker">{muscleOptions.filter(item=>item!=='Cardio').map(muscle=>
<button className={muscles.includes(muscle)?'muscle-chip active':'muscle-chip'} onClick={()=>toggleMuscle(muscle)} key={muscle}>{muscle}</button>)}</div>
</label>}{type==='muscle'&&<label>Outcome measurement<select value={metric} onChange={e=>setMetric(e.target.value)}><option>Body-part circumference</option><option>Lean mass from body scan</option><option>Standardized progress photo</option></select></label>}{type==='body'&&<label>Progress metric<input value="Body weight" readOnly aria-label="Progress metric: body weight"/></label>}{type==='consistency'&&<label>Progress metric<select value={metric} onChange={e=>setMetric(e.target.value)}><option>Completed sessions</option><option>Training days</option><option>Current streak</option><option>Weekly training minutes</option></select></label>}{type==='custom'&&<div className="custom-inspiration"><span className="field-caption">NEED INSPIRATION?</span><div>{[
  ['Resting heart rate','52','bpm','Resting heart rate'],['Strict pull-ups','10','reps','Repetition count'],['Daily steps','10000','steps/day','Daily steps'],['Sleep consistency','5','nights/week','Weekly completion'],['Mobility sessions','3','sessions/week','Session frequency'],['Pain-free squat','1','yes/no','Yes/no milestone']
].map(([name,value,measure,measurement])=><button key={name} onClick={()=>{setExercise(name);setMetric(measurement);setTarget(value);setUnit(measure)}}><b>{name}</b><small>{value} {measure}</small></button>)}</div></div>}{['custom'].includes(type)&&<div className="field-grid">
<label>Goal name<input value={exercise} onChange={e=>setExercise(e.target.value)} />
</label>
<label>Measurement<select value={metric} onChange={e=>setMetric(e.target.value)}><option>Resting heart rate</option><option>Repetition count</option><option>Daily steps</option><option>Sleep duration</option><option>Weekly completion</option><option>Session frequency</option><option>Distance</option><option>Duration</option><option>Body measurement</option><option>Yes/no milestone</option></select>
</label>
</div>}<div className="field-grid three">
<label>Current<input value={current} onChange={e=>setCurrent(e.target.value)} placeholder="Optional" />
</label>
<label>Target<input value={target} onChange={e=>setTarget(e.target.value)} />
</label>
<label>Unit<select value={unit} onChange={e=>setUnit(e.target.value)}>{unitOptions.map(option=><option key={option}>{option}</option>)}</select>
</label>
</div>
{/* No source picker: every goal reads from logged data, full stop. Wearable
    and Strava data arrive AS logged sessions, so “connected” is not a
    different source — it is the same log filling itself in. The old six-way
    dropdown was a decision with one right answer. */}
<div className="automatic-source wide"><span>AUTOMATIC</span><strong>Tracked from your logged data</strong><small>{type==='body'?'Body-weight check-ins on your training days feed this goal — connected wearables log them for you.':'Relevant logged workouts feed this goal automatically.'}</small></div>
<label>Target date<input type="date" value={targetDate} onChange={e=>setTargetDate(e.target.value)} />
</label>
<small className="goal-rule">Historical workouts remain unchanged if this goal is edited later.</small>
</div>}
    {step===3&&<div className="goal-fields">
<div className="goal-selection-banner">
<span>GOAL SUMMARY</span>
<strong>{title}</strong>
<small>{metric} · Target {targetDate}</small>
</div>
<label>Best training connection<select value={connection} onChange={e=>setConnection(e.target.value)}>
{setup?.splitDays.filter(day=>day.type!=='Rest').map(day=><option key={day.name}>{day.name}</option>)}
<option>Cardio only</option>
<option>No fixed day</option>
</select>
</label>
<div className="goal-boundary">
<b>Forge may:</b>
<span>Suggest progressions, supporting exercises, and appropriate goal sessions.</span>
<b>Forge may not:</b>
<span>Add disabled exercises, overwrite your split, or change completed workout history.</span>
</div>
</div>}
    <footer>{step>1?<button className="button ghost" onClick={()=>setStep(step-1)}>Back</button>:<button className="button ghost" onClick={onClose}>Cancel</button>}<button className="button" disabled={step===2&&(!target.trim()||!targetDate||(type!=='body'&&!exercise.trim()))} onClick={()=>step<3?setStep(step+1):onSave({type:selectedType.label,title,target:`${target} ${unit}`.trim(),date:targetDate,connection,exercise,metric,current,unit,trackingSource:'Workout history',checkInFrequency:'Automatic',reminderEnabled:false,eventTemplate:exercise==='HYROX'?'hyrox-standard':isCustomRun?'custom-running-event':undefined,eventDivision:exercise==='HYROX'?eventDivision:undefined,eventDistance:isCustomRun?eventDistance:undefined,eventDistanceUnit:isCustomRun?eventDistanceUnit:undefined,eventSurface:isCustomRun?eventSurface:undefined})}>{step<3?'Continue →':initialGoal?'Update Goal ✓':'Create Goal ✓'}</button>
</footer>
  </section>
</div>;
}
