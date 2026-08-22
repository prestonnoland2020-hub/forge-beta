import { useEffect, useMemo, useState } from 'react';
import { useAdaptiveTraining } from '../features/training/AdaptiveTrainingProvider';
import { useGoals } from '../features/goals/GoalsProvider';
import { copyIntervalActual, isActiveRecovery, makeIntervalActual, personalizeSteadyMinutes, recommendCardioOptions, type CardioLogDraft, type CardioStructure, type IntervalActual, type RecoveryKind } from '../lib/cardioSession';
import type { PlannedCardio } from './CardioPlanBuilder';

type CardioMode = CardioStructure;
type Station = { id: number; name: string; value: string; unit: string };

const parsePace = (value: string) => {
  const [minutes, seconds = '0'] = value.split(':');
  const total = Number(minutes) + Number(seconds) / 60;
  return Number.isFinite(total) && total > 0 ? total : 0;
};

const formatPace = (minutes: number) => {
  if (!Number.isFinite(minutes) || minutes <= 0) return '—';
  const whole = Math.floor(minutes);
  const seconds = Math.round((minutes - whole) * 60);
  return `${whole}:${String(seconds === 60 ? 0 : seconds).padStart(2, '0')}`;
};
const parseClock = (value: string) => { const [minutes, seconds = '0'] = value.split(':'); const total = Number(minutes) * 60 + Number(seconds); return Number.isFinite(total) ? total : 0; };
const distanceMiles=(value:number,unit:string)=>{const normalized=unit.toLowerCase();if(normalized.startsWith('meter'))return value/1609.344;if(normalized.startsWith('yard'))return value/1760;if(normalized.startsWith('kilo'))return value*.621371;return normalized.startsWith('mile')?value:0};
const plannedMode=(plan?:PlannedCardio):CardioMode=>plan?.structure==='Intervals'?'intervals':plan?.structure==='Circuit'?'circuit':plan?.structure==='Custom'?'custom':'steady';
const plannedPace=(value?:string)=>value?.match(/\d{1,2}:\d{2}(?:\.\d+)?/)?.[0]||value||'';
const plannedRecovery=(value?:string):RecoveryKind=>value==='Walk'?'Walk':value==='Easy movement'?'Easy jog':value==='Rest'?'Passive rest':'Easy jog';

export function CardioBuilder({ sectionNumber='01', onEntriesChange, initialMode='steady', initialOpen=false, initialEntries=[], plannedSummary, plannedCardio }: { sectionNumber?:string; onEntriesChange?:(hasEntries:boolean,entries:CardioLogDraft[])=>void; initialMode?:CardioMode; initialOpen?:boolean; initialEntries?:CardioLogDraft[]; plannedSummary?:string; plannedCardio?:PlannedCardio }={}) {
  const {recovery,profile}=useAdaptiveTraining();
  const {goals}=useGoals();
  const recommendedSteadyMinutes=personalizeSteadyMinutes({weeklyMileage:profile.weeklyMileage,runningDays:profile.runningDays,readiness:recovery.readiness});
  const [open, setOpen] = useState(initialOpen);
  const [mode, setMode] = useState<CardioMode>(()=>plannedCardio?plannedMode(plannedCardio):initialMode);
  const [showPrescription, setShowPrescription] = useState((plannedCardio?plannedMode(plannedCardio):initialMode)==='intervals');
  const [entryMode, setEntryMode] = useState<'manual' | 'wearable' | null>(null);
  const [expandedRecoveryId,setExpandedRecoveryId]=useState<number|null>(null);
  const [savedEntries, setSavedEntries] = useState<CardioLogDraft[]>(initialEntries);
  const [editingEntryId,setEditingEntryId]=useState<string|null>(null);
  useEffect(()=>onEntriesChange?.(savedEntries.length>0,savedEntries),[savedEntries,onEntriesChange]);
  const [activity, setActivity] = useState(plannedCardio?.activity||'Run');
  const [unit, setUnit] = useState(plannedCardio?.distanceUnit||'miles');
  const [calculation, setCalculation] = useState('distance-time');
  const [steadyAdvanced,setSteadyAdvanced]=useState(false);
  const [distance, setDistance] = useState(plannedCardio?.distance||'');
  const [duration, setDuration] = useState(plannedCardio?.duration||String(recommendedSteadyMinutes));
  const [pace, setPace] = useState(plannedPace(plannedCardio?.pace));
  const [repeats, setRepeats] = useState(plannedCardio?.repeats||'6');
  const [workDistance, setWorkDistance] = useState(plannedCardio?.workDistance||'0.37');
  const [workUnit,setWorkUnit]=useState(plannedCardio?.workUnit||'miles');
  const [workPace, setWorkPace] = useState(plannedPace(plannedCardio?.pace)||'5:30');
  const [restSeconds, setRestSeconds] = useState(plannedCardio?.rest||'120');
  const [recoveryKind,setRecoveryKind]=useState<RecoveryKind>(plannedRecovery(plannedCardio?.recoveryType));
  const [warmup, setWarmup] = useState(plannedCardio?.warmup||'1');
  const [cooldown, setCooldown] = useState(plannedCardio?.cooldown||'1');
  const [intervalActuals, setIntervalActuals] = useState<IntervalActual[]>(()=>Array.from({length:Number(plannedCardio?.repeats)||6},(_,index)=>makeIntervalActual(index,plannedCardio?.workDistance||'0.37',plannedCardio?.rest||'120',plannedRecovery(plannedCardio?.recoveryType))));
  const [rounds, setRounds] = useState(plannedCardio?.rounds||'3');
  const [stationRest, setStationRest] = useState('20');
  const [roundRest, setRoundRest] = useState(plannedCardio?.roundRest||'90');
  const [stations, setStations] = useState<Station[]>(plannedCardio?.stationEntries?.map(station=>({id:station.id,name:station.name,value:station.target,unit:station.unit}))||[
    { id: 1, name: 'Row', value: '250', unit: 'meters' },
    { id: 2, name: 'Kettlebell swings', value: '15', unit: 'reps' },
    { id: 3, name: 'Bike', value: '45', unit: 'seconds' },
  ]);
  const [loadedPlanId,setLoadedPlanId]=useState<number|null>(plannedCardio?.id||null);
  useEffect(()=>{if(!plannedCardio||plannedCardio.id===loadedPlanId||savedEntries.length)return;const nextMode=plannedMode(plannedCardio);const nextRecovery=plannedRecovery(plannedCardio.recoveryType);setLoadedPlanId(plannedCardio.id);setMode(nextMode);setActivity(plannedCardio.activity||'Run');setUnit(plannedCardio.distanceUnit||'miles');setDistance(plannedCardio.distance||'');setDuration(plannedCardio.duration||String(recommendedSteadyMinutes));setPace(plannedPace(plannedCardio.pace));setRepeats(plannedCardio.repeats||'6');setWorkDistance(plannedCardio.workDistance||'0.37');setWorkUnit(plannedCardio.workUnit||'miles');setWorkPace(plannedPace(plannedCardio.pace)||'5:30');setRestSeconds(plannedCardio.rest||'120');setRecoveryKind(nextRecovery);setWarmup(plannedCardio.warmup||'1');setCooldown(plannedCardio.cooldown||'1');setRounds(plannedCardio.rounds||'3');setRoundRest(plannedCardio.roundRest||'90');if(plannedCardio.stationEntries?.length)setStations(plannedCardio.stationEntries.map(station=>({id:station.id,name:station.name,value:station.target,unit:station.unit})));setIntervalActuals(Array.from({length:Number(plannedCardio.repeats)||6},(_,index)=>makeIntervalActual(index,plannedCardio.workDistance||'0.37',plannedCardio.rest||'120',nextRecovery)))},[plannedCardio,loadedPlanId,savedEntries.length,recommendedSteadyMinutes]);
  const recommendations=useMemo(()=>recommendCardioOptions({readiness:recovery.readiness,strengthFatigue:recovery.strengthFatigue,goalText:goals.filter(goal=>goal.type==='Endurance').map(goal=>`${goal.title} ${goal.exercise||''}`).join(' ')}),[recovery.readiness,recovery.strengthFatigue,goals]);

  const steadyResult = useMemo(() => {
    const d = Number(distance)||0; const t = Number(duration)||0; const p = parsePace(pace);
    if(!steadyAdvanced)return{distance:d,duration:t,pace:d>0?t/d:0};
    if (calculation === 'distance-time') return { distance: d, duration: t, pace: d > 0 ? t / d : 0 };
    if (calculation === 'distance-pace') return { distance: d, duration: d * p, pace: p };
    return { distance: p > 0 ? t / p : 0, duration: t, pace: p };
  }, [calculation, distance, duration, pace,steadyAdvanced]);

  const intervalResult = useMemo(() => {
    const count = Math.max(1, Number(repeats)); const repDistance = Number(workDistance)||0; const workMiles=count*distanceMiles(repDistance,workUnit);const paceSeconds=/per rep/i.test(plannedCardio?.pace||'')?parseClock(workPace):0;const repPace=parsePace(workPace);const warmupMiles=Number(warmup)||0;const cooldownMiles=Number(cooldown)||0;const totalDistance=workMiles+warmupMiles+cooldownMiles;const movingMinutes=paceSeconds?count*paceSeconds/60:workMiles*repPace; const restMinutes = Math.max(0, count - 1) * (Number(restSeconds)||0) / 60;
    return { totalDistance, movingMinutes, restMinutes, elapsed: movingMinutes + restMinutes };
  }, [repeats, workDistance, workUnit, workPace, warmup, cooldown, restSeconds,plannedCardio?.pace]);
  useEffect(() => { const count = Math.max(1, Number(repeats) || 1); setIntervalActuals(current => Array.from({ length: count }, (_, index) => current[index] ?? makeIntervalActual(index,workDistance,restSeconds,recoveryKind))); }, [repeats, workDistance, restSeconds, recoveryKind]);
  const intervalActualSummary = useMemo(() => { const completed = intervalActuals.filter(rep => rep.completed&&Number(rep.distance) > 0 && parseClock(rep.time) > 0); const workDistanceTotal = completed.reduce((sum, rep) => sum + distanceMiles(Number(rep.distance),workUnit), 0); const recoveryDistance = completed.reduce((sum,rep)=>sum+(isActiveRecovery(rep.recovery.kind)?distanceMiles(Number(rep.recovery.distance)||0,workUnit):0),0); const recoverySeconds=completed.reduce((sum,rep)=>sum+parseClock(rep.recovery.duration),0); const totalSeconds = completed.reduce((sum, rep) => sum + parseClock(rep.time), 0); const paces = completed.map(rep => {const miles=distanceMiles(Number(rep.distance),workUnit);return miles?parseClock(rep.time)/60/miles:0}).filter(Boolean); const first = paces[0] ?? 0; const last = paces[paces.length - 1] ?? 0; return { completed: completed.length, workDistance:workDistanceTotal,recoveryDistance,recoverySeconds,totalDistance:workDistanceTotal+recoveryDistance, averagePace: workDistanceTotal > 0 ? totalSeconds / 60 / workDistanceTotal : 0, fastest: paces.length ? Math.min(...paces) : 0, slowest: paces.length ? Math.max(...paces) : 0, fade: first > 0 ? ((last - first) / first) * 100 : 0 }; }, [intervalActuals,workUnit]);

  const selectActivity = (next: string) => {
    const defaults: Record<string, string> = { Run: 'miles', Walk: 'miles', Bike: 'miles', Rowing: 'meters', Swimming: 'yards', 'Stair Climber': 'floors', Elliptical: 'minutes', 'Jump Rope': 'minutes' };
    setActivity(next); if (defaults[next]) setUnit(defaults[next]);
  };
  const updateStation = (id: number, key: keyof Station, value: string) => setStations(current => current.map(station => station.id === id ? { ...station, [key]: value } : station));
  const updateIntervalActual = (id: number, key: keyof IntervalActual, value: string) => setIntervalActuals(current => current.map(rep => rep.id === id ? { ...rep, [key]: value } : rep));
  const updateRecovery=(id:number,key:keyof IntervalActual['recovery'],value:string)=>setIntervalActuals(current=>current.map(rep=>rep.id===id?{...rep,recovery:{...rep.recovery,[key]:value}}:rep));
  const copyPrevious=(index:number)=>setIntervalActuals(current=>current.map((rep,itemIndex)=>itemIndex===index&&index>0?copyIntervalActual(current[index-1],rep):rep));
  const copyToRemaining=(index:number)=>setIntervalActuals(current=>current.map((rep,itemIndex)=>itemIndex>index?copyIntervalActual(current[index],rep):rep));
  const usePlannedValues=()=>setIntervalActuals(current=>current.map((rep,index)=>({...makeIntervalActual(index,workDistance,restSeconds,recoveryKind),id:rep.id})));
  const applyRecoveryToAll=()=>setIntervalActuals(current=>current.map(rep=>({...rep,recovery:{...rep.recovery,kind:recoveryKind,duration:restSeconds,activity:recoveryKind==='Custom'?'':recoveryKind}})));
  const addStation = () => setStations(current => [...current, { id: Date.now(), name: '', value: '', unit: 'reps' }]);
  const duplicateStation=(id:number)=>setStations(current=>{const index=current.findIndex(station=>station.id===id);if(index<0)return current;const next=[...current];next.splice(index+1,0,{...current[index],id:Date.now()});return next});
  const summary = mode === 'steady' ? `${activity} · ${steadyResult.duration.toFixed(0)} min${steadyResult.distance>0?` · ${steadyResult.distance.toFixed(2)} ${unit}`:''}${steadyResult.pace>0?` · ${formatPace(steadyResult.pace)} /mi`:''}` : mode === 'intervals' ? `${activity} · ${repeats} × ${workDistance} ${workUnit} · ${workPace}${restSeconds?` · ${restSeconds}s recovery`:''}` : mode === 'circuit' ? `${rounds} rounds · ${stations.length} stations` : `${activity} · custom result`;
  const buildDraft=():CardioLogDraft=>({id:crypto.randomUUID(),structure:mode,activity,summary,prescription:mode==='steady'?{calculation,distance,duration,pace,unit,distanceUnit:unit}:mode==='intervals'?{repeats,workDistance,workUnit,workPace,restSeconds,recoveryKind,warmup,cooldown,distanceUnit:workUnit}:mode==='circuit'?{rounds,stationRest,roundRest}:{} ,intervalActuals:mode==='intervals'?intervalActuals.map(rep=>({...rep,recovery:{...rep.recovery}})):undefined,circuitStations:mode==='circuit'?stations.map(({name,value,unit:stationUnit})=>({name,value,unit:stationUnit})):undefined});
  const editEntry=(entry:CardioLogDraft)=>{const prescription=entry.prescription as Record<string,string>;setEditingEntryId(entry.id);setMode(entry.structure);setActivity(entry.activity);setCalculation(prescription.calculation||'distance-time');setDistance(prescription.distance||'');setDuration(prescription.duration||'');setPace(prescription.pace||'');setUnit(prescription.distanceUnit||prescription.unit||'miles');setRepeats(prescription.repeats||'6');setWorkDistance(prescription.workDistance||'0.37');setWorkUnit(prescription.workUnit||'miles');setWorkPace(prescription.workPace||'5:30');setRestSeconds(prescription.restSeconds||'120');setRecoveryKind((prescription.recoveryKind as RecoveryKind)||'Easy jog');setWarmup(prescription.warmup||'1');setCooldown(prescription.cooldown||'1');setRounds(prescription.rounds||'3');setStationRest(prescription.stationRest||'20');setRoundRest(prescription.roundRest||'90');if(entry.intervalActuals)setIntervalActuals(entry.intervalActuals.map(rep=>({...rep,recovery:{...rep.recovery}})));if(entry.circuitStations)setStations(entry.circuitStations.map((station,index)=>({...station,id:index+1})));setOpen(true)};
  const commitEntry=()=>{const draft=buildDraft();setSavedEntries(items=>editingEntryId?items.map(item=>item.id===editingEntryId?{...draft,id:editingEntryId}:item):[...items,draft]);setEditingEntryId(null);setOpen(false)};

  return <section className="card form-card cardio-builder">
    <div className="section-title compact-title">
<span>{sectionNumber}</span>
<div>
<h3>Cardio</h3>
<p>Choose the structure first. Forge calculates only the totals that make sense.</p>
</div>
</div>
    {savedEntries.length > 0 && <div className="saved-cardio-list">{savedEntries.map((entry, index) => <div key={entry.id}>
<span>{String(index + 1).padStart(2, '0')}</span>
<strong>{entry.summary}</strong>
<button onClick={() => editEntry(entry)}>Edit</button>
<button onClick={() => setSavedEntries(items => items.filter((_, i) => i !== index))}>Remove</button>
</div>)}</div>}
    {!open && plannedSummary&&<div className="collapsed-cardio-plan"><div><span>FROM TODAY'S TRAINING SPLIT</span><strong>{plannedSummary}</strong><small>Open only when you are ready to review the prescription or enter actual results.</small></div><button className="button secondary" onClick={()=>setOpen(true)}>Open & log</button></div>}
    {!open && !plannedSummary && <button className="button secondary wide" onClick={() => setOpen(true)}>＋ Add Cardio</button>}
    {open && <div className="cardio-composer">
      {!plannedCardio&&<div className="cardio-recommendations"><div className="cardio-recommendation-heading"><div><span className="field-caption">FORGE OPTIONS</span><strong>Choose today’s cardio</strong></div><small>Every option is scaled to today. Preferred is the coach’s best fit, not a requirement.</small></div><div className="cardio-option-grid">{recommendations.map(option=><button type="button" className={`${mode===option.mode?'active ':''}${option.preferred?'preferred':''}`} onClick={()=>setMode(option.mode)} key={option.mode}>{option.preferred&&<b>FORGE PREFERRED</b>}<span>{option.label}</span><strong>{option.title}</strong><small>{option.mode==='steady'?`${recommendedSteadyMinutes} min · conversational · ${profile.easyHrMin}–${profile.easyHrMax} bpm`:option.summary}</small><p>{option.reason}</p></button>)}</div></div>}
      <div className="mode-tabs" role="tablist" aria-label="Cardio structure">{([['steady','Steady'],['intervals','Intervals'],['circuit','Circuit'],['custom','Custom']] as [CardioMode,string][]).map(([value,label]) => <button className={mode === value ? 'active' : ''} onClick={() => setMode(value)} key={value}>{label}</button>)}</div>
      {mode === 'steady' && <div className="cardio-pane">
<div className="steady-forge-target"><div><span>YOUR STARTING POINT</span><strong>{recommendedSteadyMinutes} minutes easy</strong><small>{profile.weeklyMileage} mi/week · {profile.runningDays} running days · {recovery.readiness}% ready</small></div><p>Keep it conversational{profile.watchConnected?` or stay near ${profile.easyHrMin}–${profile.easyHrMax} bpm`:''}. Distance is an optional result, not a one-mile prescription.</p></div>
<div className="field-grid three steady-simple-fields">
<label>Activity<select value={activity} onChange={e => selectActivity(e.target.value)}>
<option>Run</option>
<option>Walk</option>
<option>Bike</option>
<option>Rowing</option>
<option>Swimming</option>
<option>Stair Climber</option>
<option>Elliptical</option>
<option>Jump Rope</option>
</select>
</label>
<label>Duration (min)<input value={duration} onChange={e=>setDuration(e.target.value)} inputMode="numeric"/></label>
<label>Distance <small>(optional actual)</small><div className="distance-with-unit"><input value={distance} onChange={e=>setDistance(e.target.value)} inputMode="decimal" placeholder="Leave blank"/><select value={unit} onChange={e=>setUnit(e.target.value)}><option>miles</option><option>kilometers</option><option>meters</option><option>yards</option></select></div></label>
</div>
<button type="button" className="advanced-toggle" onClick={()=>setSteadyAdvanced(value=>!value)}>{steadyAdvanced?'Hide pace calculator':'Add pace or calculate from two values'}</button>
{steadyAdvanced&&<div className="steady-advanced"><label>Calculate from<select value={calculation} onChange={e => setCalculation(e.target.value)}>
<option value="distance-time">Distance + duration</option>
<option value="distance-pace">Distance + pace</option>
<option value="time-pace">Duration + pace</option>
</select>
</label>
<label>Pace<input value={calculation === 'distance-time' ? formatPace(steadyResult.pace) : pace} onChange={e => setPace(e.target.value)} readOnly={calculation === 'distance-time'} placeholder="10:00" />
</label>
</div>}
<div className="calculation-summary">
<span>SESSION TO LOG</span>
<strong>{steadyResult.duration.toFixed(0)} minutes easy</strong>
<small>{steadyResult.distance>0?`${steadyResult.distance.toFixed(2)} ${unit}${steadyResult.pace>0?` · ${formatPace(steadyResult.pace)} pace`:''}`:'Distance can be added after the session.'}</small>
</div>
</div>}
      {mode === 'intervals' && <div className="cardio-pane interval-pane">
<div className="plan-source">
<span>{plannedCardio?'FROM TODAY’S SAVED RECOMMENDATION':'INTERVAL PRESCRIPTION'}</span>
<strong>{repeats} × {workDistance} {workUnit} at {workPace} · {restSeconds}s rest</strong>
<small>{warmup} warm-up · {cooldown} cooldown</small>
<button onClick={()=>setShowPrescription(value=>!value)}>{showPrescription?'Hide details':'View / Edit Plan'}</button>
</div>
{showPrescription && <div className="prescription-details">
<div className="prescription-heading">
<div>
<span className="field-caption">PRESCRIPTION</span>
<h4>Planned interval structure</h4>
</div>
<span>Target data</span>
</div>
<div className="field-grid three">
<label>Repetitions<input value={repeats} onChange={e => setRepeats(e.target.value)} inputMode="numeric" />
</label>
<label>Distance per rep<input value={workDistance} onChange={e => setWorkDistance(e.target.value)} inputMode="decimal" />
</label>
<label>Unit<select value={workUnit} onChange={e=>setWorkUnit(e.target.value)}>
<option>miles</option>
<option>meters</option>
<option>yards</option>
<option>kilometers</option>
</select>
</label>
<label>Target pace<input value={workPace} onChange={e => setWorkPace(e.target.value)} />
</label>
<label>Recovery between reps<input value={restSeconds} onChange={e => setRestSeconds(e.target.value)} inputMode="numeric" />
</label>
<label>Rest unit<select>
<option>seconds</option>
<option>minutes</option>
</select>
</label>
<label>Recovery type<select value={recoveryKind} onChange={e=>setRecoveryKind(e.target.value as RecoveryKind)}><option>Passive rest</option><option>Walk</option><option>Easy jog</option><option>Easy bike</option><option>Easy row</option><option>Custom</option></select></label>
<label>Warm-up miles<input value={warmup} onChange={e => setWarmup(e.target.value)} inputMode="decimal" />
</label>
<label>Cooldown miles<input value={cooldown} onChange={e => setCooldown(e.target.value)} inputMode="decimal" />
</label>
</div>
<div className="interval-summary">
<div>
<span>WORK DISTANCE</span>
<strong>{(Number(repeats) * Number(workDistance)).toFixed(2)} {workUnit}</strong>
</div>
<div>
<span>TOTAL DISTANCE</span>
<strong>{intervalResult.totalDistance.toFixed(2)} mi</strong>
</div>
<div>
<span>MOVING TIME</span>
<strong>{intervalResult.movingMinutes.toFixed(1)} min</strong>
</div>
<div>
<span>REST TIME</span>
<strong>{intervalResult.restMinutes.toFixed(1)} min</strong>
</div>
<div>
<span>EST. ELAPSED</span>
<strong>{intervalResult.elapsed.toFixed(1)} min</strong>
</div>
</div>
</div>}
<div className="actuals-heading">
<div>
<span className="field-caption">ACTUAL PERFORMANCE</span>
<h4>Log every repetition</h4>
</div>
<div className="entry-actions"><button className={entryMode==='wearable'?'active':''} onClick={()=>{setEntryMode('wearable');setIntervalActuals(items=>items.map(rep=>({...rep,source:'wearable'})) as IntervalActual[])}}>Import from Watch</button><button className={entryMode==='manual'?'active':''} onClick={()=>{setEntryMode('manual');setIntervalActuals(items=>items.map(rep=>({...rep,source:'manual'})) as IntervalActual[])}}>Enter Manually</button></div>
</div>
{!entryMode && <div className="entry-empty"><strong>How are you recording this workout?</strong><span>Watch data can be corrected manually after import.</span></div>}
{entryMode && <>
<div className="interval-quick-actions"><button type="button" onClick={usePlannedValues}>Use planned values</button><label>Default recovery<select value={recoveryKind} onChange={e=>setRecoveryKind(e.target.value as RecoveryKind)}><option>Passive rest</option><option>Walk</option><option>Easy jog</option><option>Easy bike</option><option>Easy row</option><option>Custom</option></select></label><button type="button" onClick={applyRecoveryToAll}>Apply recovery to all</button></div>
<div className="interval-actuals">
<div className="actual-row actual-header">
<span>REP</span>
<span>DISTANCE</span>
<span>TIME</span>
<span>PACE</span>
<span>RECOVERY</span>
</div>{intervalActuals.map((rep,index) => { const repMiles=distanceMiles(Number(rep.distance),workUnit);const actualPace = repMiles > 0 ? parseClock(rep.time) / 60 / repMiles : 0; return <div className={`interval-entry ${rep.completed?'':'skipped'}`} key={rep.id}><div className="actual-row">
<b>{index + 1}</b>
<input value={rep.distance} onChange={e => updateIntervalActual(rep.id, 'distance', e.target.value)} inputMode="decimal" aria-label={`Rep ${index + 1} distance`} />
<input value={rep.time} onChange={e => updateIntervalActual(rep.id, 'time', e.target.value)} placeholder="0:00" aria-label={`Rep ${index + 1} time`} />
<strong>{formatPace(actualPace)}</strong>
<button type="button" className="recovery-pill" onClick={()=>setExpandedRecoveryId(value=>value===rep.id?null:rep.id)}>{rep.recovery.kind} · {rep.recovery.duration||'—'}</button>
</div><div className="rep-copy-actions compact-rep-actions">{index>0&&<button type="button" onClick={()=>copyPrevious(index)}>Copy previous</button>}<button type="button" onClick={()=>copyToRemaining(index)}>Copy to remaining</button><button type="button" onClick={()=>setExpandedRecoveryId(value=>value===rep.id?null:rep.id)}>Recovery details</button><button type="button" onClick={()=>setIntervalActuals(items=>items.map(item=>item.id===rep.id?{...item,completed:!item.completed}:item))}>{rep.completed?'Skip':'Restore'}</button></div>{expandedRecoveryId===rep.id&&<div className="recovery-row"><label>Recovery type<select value={rep.recovery.kind} onChange={e=>updateRecovery(rep.id,'kind',e.target.value)}><option>Passive rest</option><option>Walk</option><option>Easy jog</option><option>Easy bike</option><option>Easy row</option><option>Custom</option></select></label><label>Recovery time<input value={rep.recovery.duration} onChange={e=>updateRecovery(rep.id,'duration',e.target.value)} placeholder="2:00 or 120" aria-label={`Rep ${index+1} recovery duration`}/></label>{isActiveRecovery(rep.recovery.kind)&&<><label>Recovery activity<input value={rep.recovery.activity} onChange={e=>updateRecovery(rep.id,'activity',e.target.value)} aria-label={`Rep ${index+1} recovery activity`}/></label><label>Recovery distance <small>(optional)</small><input value={rep.recovery.distance} onChange={e=>updateRecovery(rep.id,'distance',e.target.value)} inputMode="decimal" aria-label={`Rep ${index+1} recovery distance`}/></label></>}</div>}</div>})}</div>
<div className="actual-summary">
<div>
<span>COMPLETED</span>
<strong>{intervalActualSummary.completed}/{repeats}</strong>
</div>
<div>
<span>QUALITY DISTANCE</span>
<strong>{intervalActualSummary.workDistance.toFixed(2)} mi</strong>
</div>
<div>
<span>AVG PACE</span>
<strong>{formatPace(intervalActualSummary.averagePace)}</strong>
</div>
<div>
<span>FASTEST / SLOWEST</span>
<strong>{formatPace(intervalActualSummary.fastest)} / {formatPace(intervalActualSummary.slowest)}</strong>
</div>
<div>
<span>PACE FADE</span>
<strong className={intervalActualSummary.fade > 5 ? 'warning' : ''}>{intervalActualSummary.fade.toFixed(1)}%</strong>
</div>
</div>
<div className="recovery-summary"><span>ACTIVE RECOVERY</span><strong>{intervalActualSummary.recoveryDistance.toFixed(2)} mi · {Math.round(intervalActualSummary.recoverySeconds/60*10)/10} min</strong><small>Total session distance {intervalActualSummary.totalDistance.toFixed(2)} mi. Recovery never changes work pace.</small></div>
</>}
</div>}
      {mode === 'circuit' && <div className="cardio-pane">
<div className="field-grid three">
<label>Rounds<input value={rounds} onChange={e => setRounds(e.target.value)} inputMode="numeric" />
</label>
<label>Rest between stations<input value={stationRest} onChange={e => setStationRest(e.target.value)} inputMode="numeric" />
</label>
<label>Rest between rounds<input value={roundRest} onChange={e => setRoundRest(e.target.value)} inputMode="numeric" />
</label>
</div>
<div className="station-list">
<span className="field-caption">STATIONS PER ROUND</span>{stations.map((station,index) => <div className="station-row" key={station.id}>
<b>{index + 1}</b>
<input value={station.name} onChange={e => updateStation(station.id, 'name', e.target.value)} placeholder="Exercise" />
<input value={station.value} onChange={e => updateStation(station.id, 'value', e.target.value)} placeholder="Amount" />
<select value={station.unit} onChange={e => updateStation(station.id, 'unit', e.target.value)}>
<option>reps</option>
<option>seconds</option>
<option>minutes</option>
<option>meters</option>
<option>yards</option>
<option>miles</option>
<option>calories</option>
<option>floors</option>
</select>
<div className="station-actions"><button type="button" onClick={()=>duplicateStation(station.id)} title="Duplicate station">Copy</button><button type="button" onClick={() => setStations(items => items.filter(item => item.id !== station.id))} title="Remove station">×</button></div>
</div>)}<button className="add-station" onClick={addStation}>＋ Add station</button>
</div>
<div className="circuit-summary">
<strong>{rounds} rounds × {stations.length} stations</strong>
<span>{stationRest}s between stations · {roundRest}s between rounds</span>
<small>Each station keeps its own unit; Forge will not combine incompatible measurements.</small>
</div>
</div>}
      {mode === 'custom' && <div className="cardio-pane">
<div className="field-grid">
<label>Activity name<input value={activity} onChange={e => setActivity(e.target.value)} placeholder="e.g. Sled pushes" />
</label>
<label>Measure by<select value={unit} onChange={e => setUnit(e.target.value)}>
<option>minutes</option>
<option>reps</option>
<option>rounds</option>
<option>meters</option>
<option>yards</option>
<option>miles</option>
<option>calories</option>
<option>floors</option>
<option>steps</option>
</select>
</label>
<label>Result<input value={distance} onChange={e => setDistance(e.target.value)} inputMode="decimal" />
</label>
<label>Duration (optional)<input value={duration} onChange={e => setDuration(e.target.value)} inputMode="decimal" />
</label>
</div>
<label>Notes<textarea rows={2} placeholder="Add structure or context that the measurements do not capture." />
</label>
</div>}
      <div className="composer-actions">
<button className="button ghost" onClick={() => {setEditingEntryId(null);setOpen(false)}}>Cancel</button>
<button className="button" onClick={commitEntry}>{editingEntryId?'Update cardio':'Add to workout'}</button>
</div>
    </div>}
  </section>;
}
