import { useMemo,useState } from 'react';
import { parseCardioDescription } from '../lib/cardioParse';
import { requestCardioParse } from '../features/training/coachService';
import { planFromParsedRows } from '../lib/cardioPlanFromText';
import { Icon } from './Icon';
import { DialField } from './NumberDial';

export type CircuitStation={id:number;kind:'Cardio'|'Strength'|'Bodyweight'|'Rest';name:string;target:string;unit:string;load?:string;rest?:string;pace?:string};
export type PlannedCardio={id:number;activity:string;structure:'Steady'|'Intervals'|'Circuit'|'Custom';targetSource:'Goal generated'|'Manual plan';distance?:string;distanceUnit?:string;duration?:string;stationTime?:string;pace?:string;repeats?:string;intervalBasis?:'Distance'|'Time';workDistance?:string;workUnit?:string;rest?:string;recoveryType?:string;warmup?:string;cooldown?:string;rounds?:string;circuitFormat?:'Rounds'|'AMRAP'|'EMOM'|'For time';roundRest?:string;stationEntries?:CircuitStation[];customTarget?:string};

const activityUnits:Record<string,string>={Run:'miles',Bike:'miles',Rowing:'meters','Stair Climber':'floors',Elliptical:'minutes',Swimming:'yards',SkiErg:'meters',Circuit:'rounds'};
export const cardioActivities=Object.keys(activityUnits);
const stationDefaults:Record<CircuitStation['kind'],{name:string;unit:string}>={Cardio:{name:'Row',unit:'meters'},Strength:{name:'Kettlebell Swing',unit:'reps'},Bodyweight:{name:'Burpees',unit:'reps'},Rest:{name:'Rest',unit:'seconds'}};
const stationUnits:Record<CircuitStation['kind'],string[]>={Cardio:['meters','yards','miles','kilometers','calories','seconds','minutes'],Strength:['reps','seconds'],Bodyweight:['reps','seconds','meters'],Rest:['seconds','minutes']};
const distanceToMiles=(value:string,unit:string)=>{const distance=Number(value);if(!Number.isFinite(distance)||distance<=0)return 0;const normalized=unit.toLowerCase();if(normalized.startsWith('kilo'))return distance*.621371;if(normalized.startsWith('meter'))return distance/1609.344;if(normalized.startsWith('yard'))return distance/1760;return normalized.startsWith('mile')?distance:0};
const paceToMinutes=(value:string)=>{const match=value.trim().match(/^(\d{1,2}):(\d{2})(?:\s*\/?\s*mi)?$/i);if(match){const minutes=Number(match[1]),seconds=Number(match[2]);return seconds<60?minutes+seconds/60:0}const decimal=Number(value.replace(/\s*\/?\s*mi/i,''));return Number.isFinite(decimal)&&decimal>0?decimal:0};
const formatPace=(minutes:number)=>{const seconds=Math.round(minutes*60);return `${Math.floor(seconds/60)}:${String(seconds%60).padStart(2,'0')}/mi`};
/* Recoveries and rests are stored in seconds and picked as m:ss — "120" with
   no unit beside it was the field nobody could read. */
const secondsToClock=(value?:string)=>{const total=Math.round(Number(value)||0);return total>0?`${Math.floor(total/60)}:${String(total%60).padStart(2,'0')}`:''};
const clockToSeconds=(value:string)=>{const [minutes,seconds]=value.split(':').map(Number);return String((minutes||0)*60+(seconds||0))};
const STEADY_PACE='10:00/mi';
const RECOVERY_TYPES=['Rest','Jog','Walk','Easy movement'];

export function cardioPlanSummary(plan:PlannedCardio){if(plan.activity==='HYROX'&&plan.customTarget)return plan.customTarget;if(plan.structure==='Intervals'){/* "120s recovery" read as a code; the recovery is said the way a coach says it: "1:30 jog". */const rest=secondsToClock(plan.rest);const kind=(plan.recoveryType||'Rest').toLowerCase();return [plan.activity,`${plan.repeats} × ${plan.intervalBasis==='Time'?secondsToClock(plan.workDistance)||`${plan.workDistance} sec`:`${plan.workDistance} ${plan.workUnit}`}`,plan.pace||'',rest?`${rest} ${kind}`:''].filter(Boolean).join(' · ')}if(plan.structure==='Circuit')return plan.circuitFormat==='For time'?`For time · ${plan.rounds||'1'} rounds · ${plan.stationEntries?.length||0} stations · ${plan.duration||'—'} min target`:`${plan.circuitFormat||'Rounds'} · ${plan.rounds||'3'} ${plan.circuitFormat==='AMRAP'||plan.circuitFormat==='EMOM'?'min':'rounds'} · ${plan.stationEntries?.length||0} stations`;if(plan.structure==='Custom')return `${plan.activity} · ${plan.customTarget||'custom target'}`;/* A steady session is stated by whatever it actually carries. A prescribed
   run gives a distance and a pace and no duration, and printing "— min"
   between them reads as a broken field rather than a run. */
  return [plan.activity, plan.distance?`${plan.distance} ${plan.distanceUnit}`:'', plan.duration?`${plan.duration} min`:'', plan.pace||''].filter(Boolean).join(' · ')}

export function CardioPlanBuilder({initial,onClose,onSave}:{initial?:PlannedCardio;onClose:()=>void;onSave:(plan:PlannedCardio)=>void}){
  const [activity,setActivity]=useState(initial?.activity||'Run');const [structure,setStructure]=useState<PlannedCardio['structure']>(initial?.structure||'Steady');const [targetSource,setTargetSource]=useState<PlannedCardio['targetSource']>(initial?.targetSource||'Goal generated');
  /* A new session starts at 3 miles in 30 minutes; an existing one keeps what
     it has. "Easy 30 min run" from the day sheet has no distance, and Edit
     must not hand it one. */
  const [distance,setDistance]=useState(initial?initial.distance||'':'3');const [distanceUnit,setDistanceUnit]=useState(initial?.distanceUnit||activityUnits[initial?.activity||'Run']);const [duration,setDuration]=useState(initial?initial.duration||'':'30');const [pace,setPace]=useState(initial?.pace??STEADY_PACE);
  const [calculationSource,setCalculationSource]=useState<'pace'|'duration'>('pace');
  const [repeats,setRepeats]=useState(initial?.repeats||'6');const [intervalBasis,setIntervalBasis]=useState<PlannedCardio['intervalBasis']>(initial?.intervalBasis||'Distance');const [workDistance,setWorkDistance]=useState(initial?.workDistance||'600');const [workUnit,setWorkUnit]=useState(initial?.workUnit||'meters');const [rest,setRest]=useState(initial?.rest||'120');const [recoveryType,setRecoveryType]=useState(initial?.recoveryType||'Rest');const [warmup,setWarmup]=useState(initial?.warmup||'1 mile');const [cooldown,setCooldown]=useState(initial?.cooldown||'1 mile');
  const [rounds,setRounds]=useState(initial?.rounds||'3');const [circuitFormat,setCircuitFormat]=useState<PlannedCardio['circuitFormat']>(initial?.circuitFormat||'Rounds');const [roundRest,setRoundRest]=useState(initial?.roundRest||'90');const [stations,setStations]=useState<CircuitStation[]>(initial?.stationEntries||[{id:1,kind:'Cardio',name:'Row',target:'250',unit:'meters',rest:'20'},{id:2,kind:'Strength',name:'Kettlebell Swing',target:'15',unit:'reps',load:'35 lb',rest:'20'},{id:3,kind:'Cardio',name:'Bike',target:'45',unit:'seconds',rest:'20'}]);const [customTarget,setCustomTarget]=useState(initial?.customTarget||'');
  /* DESCRIBE IT AND FORGE FILLS THIS IN. Every field below is a real field
     the wave and the pace model read, which is why the builder has so many of
     them — and why planning a Tuesday tempo meant filling in eight. The
     logger already takes a sentence; the plan builder now takes the same one
     and lands it on the controls, where it stays editable. Nothing is saved
     from the sentence directly: what the reader produces is a starting point
     the athlete can see and correct before Save. */
  const [aiText,setAiText]=useState('');const [aiBusy,setAiBusy]=useState(false);const [aiNote,setAiNote]=useState('');const [aiSource,setAiSource]=useState<'ai'|'local'|''>('');
  const buildFromText=async()=>{
    const description=aiText.trim();
    if(!description||aiBusy)return;
    setAiBusy(true);setAiNote('');
    const local=parseCardioDescription(description);
    const parsed=await requestCardioParse(description,{savedCardioTypes:cardioActivities,intent:'plan'},local);
    const shape=planFromParsedRows(parsed.rows.map(row=>({cardioType:String(row.cardioType||''),distance:Number(row.distance)||0,unit:String(row.unit||''),timeMinutes:Number(row.timeMinutes)||0})),description);
    setAiSource(parsed.source);
    if(!shape){setAiNote(parsed.reflection||'Could not read a session from that. The fields below still work.');setAiBusy(false);return}
    /* The activity has to exist in the builder's own list or its unit menu and
       its summary have nothing to stand on. */
    const known=cardioActivities.find(item=>item.toLowerCase()===shape.activity.toLowerCase());
    if(known){setActivity(known);setDistanceUnit(activityUnits[known]||'minutes')}
    setStructure(shape.structure);
    if(shape.distance!==undefined)setDistance(shape.distance);
    if(shape.distanceUnit!==undefined)setDistanceUnit(shape.distanceUnit);
    if(shape.duration!==undefined)setDuration(shape.duration);
    if(shape.pace!==undefined)setPace(shape.pace);
    if(shape.repeats!==undefined)setRepeats(shape.repeats);
    if(shape.intervalBasis!==undefined)setIntervalBasis(shape.intervalBasis);
    if(shape.workDistance!==undefined)setWorkDistance(shape.workDistance);
    if(shape.workUnit!==undefined)setWorkUnit(shape.workUnit);
    if(shape.warmup!==undefined)setWarmup(shape.warmup);
    if(shape.cooldown!==undefined)setCooldown(shape.cooldown);
    if(shape.customTarget!==undefined)setCustomTarget(shape.customTarget);
    if(shape.rest!==undefined)setRest(shape.rest);
    if(shape.recoveryType!==undefined)setRecoveryType(shape.recoveryType);
    /* An interval set the sentence gave no pace for does not inherit the
       steady run's 10:00 a mile. */
    if(shape.structure==='Intervals'&&shape.pace===undefined&&pace===STEADY_PACE)setPace('');
    /* A sentence the reader could not shape into a set is not a failure worth
       hiding: it lands in Custom holding their words, and saying so is the
       difference between that and a silent wrong answer. */
    setAiNote(shape.structure==='Custom'
      ?'Kept as a custom target \u2014 that one did not fit a steady or interval shape. Edit it below.'
      :`Read as ${shape.structure.toLowerCase()}. Check the fields below before saving.`);
    setAiBusy(false);
  };
  const plan=useMemo<PlannedCardio>(()=>({id:initial?.id||Date.now(),activity,structure,targetSource,distance,distanceUnit,duration,pace,repeats,intervalBasis,workDistance,workUnit,rest,recoveryType,warmup,cooldown,rounds,circuitFormat,roundRest,stationEntries:stations,customTarget}),[initial?.id,activity,structure,targetSource,distance,distanceUnit,duration,pace,repeats,intervalBasis,workDistance,workUnit,rest,recoveryType,warmup,cooldown,rounds,circuitFormat,roundRest,stations,customTarget]);
  const updateStation=(id:number,change:Partial<CircuitStation>)=>setStations(items=>items.map(item=>item.id===id?{...item,...change}:item));const changeKind=(id:number,kind:CircuitStation['kind'])=>updateStation(id,{kind,...stationDefaults[kind],target:'',load:kind==='Strength'?'0 lb':undefined});const addStation=()=>setStations(items=>[...items,{id:Date.now(),kind:'Cardio',name:'Run',target:'200',unit:'meters',rest:'20'}]);const moveStation=(index:number,direction:-1|1)=>setStations(items=>{const target=index+direction;if(target<0||target>=items.length)return items;const next=[...items];[next[index],next[target]]=[next[target],next[index]];return next});
  const syncFromPace=(nextDistance=distance,nextUnit=distanceUnit,nextPace=pace)=>{const miles=distanceToMiles(nextDistance,nextUnit),minutes=paceToMinutes(nextPace);if(activity==='Run'&&miles&&minutes)setDuration(String(Math.round(miles*minutes*10)/10))};
  const syncFromDuration=(nextDistance=distance,nextUnit=distanceUnit,nextDuration=duration)=>{const miles=distanceToMiles(nextDistance,nextUnit),minutes=Number(nextDuration);if(activity==='Run'&&miles&&Number.isFinite(minutes)&&minutes>0)setPace(formatPace(minutes/miles))};
  const changeDistance=(value:string)=>{setDistance(value);calculationSource==='pace'?syncFromPace(value):syncFromDuration(value)};
  const changeUnit=(value:string)=>{setDistanceUnit(value);calculationSource==='pace'?syncFromPace(distance,value):syncFromDuration(distance,value)};
  const changeDuration=(value:string)=>{setDuration(value);setCalculationSource('duration');syncFromDuration(distance,distanceUnit,value)};
  const changePace=(value:string)=>{setPace(value);setCalculationSource('pace');syncFromPace(distance,distanceUnit,value)};
  const changeActivity=(value:string)=>{setActivity(value);setDistanceUnit(activityUnits[value]||'minutes');if(value==='Circuit')setStructure('Circuit')};
  /* A STEADY PACE IS NOT AN INTERVAL PACE. Switching to intervals carried
     the steady run's 10:00 a mile onto every 400, and switching back left an
     interval effort where a pace belongs. */
  const changeStructure=(next:PlannedCardio['structure'])=>{setStructure(next);if(next==='Intervals'&&pace===STEADY_PACE)setPace('');if(next==='Steady'&&!pace)syncFromDuration()};
  const chip=(active:boolean)=>active?'active':'';
  /* THE BUILDER IS A SHEET, NOT A FORM. It opened behind the split's day
     sheet with its Save under the tab bar, then spent its first screen on two
     cards choosing between "Goal guided" and "Manual plan" before a single
     number. What the session IS comes first now — activity, shape, numbers
     picked on the dial — and the plan's summary rides with Save, so the
     athlete reads the result where they confirm it. Goal guidance is one
     switch beside it. */
  return <div className="cardio-plan-backdrop" role="dialog" aria-modal="true" aria-label={initial?'Edit planned cardio':'Plan cardio'}><section className="cardio-plan-modal cardio-plan-sheet"><header><div><span className="eyebrow">PLAN CARDIO</span><h2>{initial?'Edit session':'New session'}</h2></div><button type="button" onClick={onClose} aria-label="Close">×</button></header><div className="cardio-ai-box plan-ai-box">
    <span className="cardio-ai-label"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6l1.4 1.4M17 17l1.4 1.4M5.6 18.4 7 17M17 7l1.4-1.4"/><circle cx="12" cy="12" r="4"/></svg>Describe it — Forge builds it</span>
    <textarea rows={2} value={aiText} onChange={e=>setAiText(e.target.value)} placeholder="“4 mile tempo at 7:10 pace” or “1 mile warmup, 6x400m with 90s jog, 1 mile cooldown”" />
    <div className="cardio-ai-actions">
      <button type="button" className="button small-button" disabled={aiBusy||!aiText.trim()} onClick={buildFromText}>{aiBusy?'Reading…':'Build it'}</button>
      <small>Or set it up below — nothing is saved until you press Save.</small>
    </div>
    {aiNote&&<p className={`cardio-ai-reflection${aiSource==='local'?' local':''}`}><b>{aiSource==='ai'?'FORGE':'QUICK PARSE'}</b>{aiNote}</p>}
  </div>
  <div className="cardio-plan-group"><span className="field-caption">SESSION</span><div className="ss-segment four cardio-plan-structure">{(['Steady','Intervals','Circuit','Custom'] as const).map(item=><button type="button" key={item} className={chip(structure===item)} onClick={()=>changeStructure(item)}>{item}</button>)}</div></div>
  {structure!=='Circuit'&&<div className="cardio-plan-group"><span className="field-caption">ACTIVITY</span><div className="cardio-plan-chips">{cardioActivities.filter(item=>item!=='Circuit').map(item=><button type="button" key={item} className={chip(activity===item)} onClick={()=>changeActivity(item)}>{item}</button>)}</div></div>}
  {structure==='Steady'&&<div className="cardio-plan-fields"><div className="cardio-plan-row with-unit"><DialField label="Distance" kind="distance" unit={distanceUnit} value={distance} onChange={changeDistance}/><label className="cardio-unit-pick"><span className="dial-field-label">Unit</span><select value={distanceUnit} onChange={e=>changeUnit(e.target.value)}>{['miles','kilometers','meters','yards','floors','calories'].map(unit=><option key={unit}>{unit}</option>)}</select></label></div><div className="cardio-plan-row"><DialField label="Duration" kind="minutes" unit="min" value={duration} onChange={changeDuration}/><label className="cardio-plan-text"><span className="dial-field-label">Pace or effort</span><input value={pace} onChange={e=>changePace(e.target.value)} placeholder="8:00/mi, Zone 2…"/></label></div>{activity==='Run'&&<small>Set the duration or the pace — Forge works out the other.</small>}</div>}
  {structure==='Intervals'&&<div className="cardio-plan-fields"><div className="ss-segment two"><button type="button" className={chip(intervalBasis==='Distance')} onClick={()=>{setIntervalBasis('Distance');if(['seconds','minutes'].includes(workUnit||''))setWorkUnit('meters')}}>By distance</button><button type="button" className={chip(intervalBasis==='Time')} onClick={()=>{setIntervalBasis('Time');setWorkUnit('seconds')}}>By time</button></div>
    <div className="cardio-plan-row reps"><DialField label="Reps" kind="count" value={repeats} onChange={setRepeats}/><b aria-hidden="true">×</b>{intervalBasis==='Distance'?<DialField label="Each rep" kind="distance" unit={workUnit} value={workDistance} onChange={setWorkDistance}/>:<DialField label="Each rep" kind="clock" value={secondsToClock(workDistance)} onChange={value=>setWorkDistance(clockToSeconds(value))} placeholder="0:00"/>}</div>
    {intervalBasis==='Distance'&&<div className="cardio-plan-chips small">{['meters','yards','miles','kilometers'].map(unit=><button type="button" key={unit} className={chip(workUnit===unit)} onClick={()=>setWorkUnit(unit)}>{unit}</button>)}</div>}
    <label className="cardio-plan-text"><span className="dial-field-label">Pace or effort</span><input value={pace} onChange={e=>setPace(e.target.value)} placeholder="5K pace, hard, Zone 4…"/></label>
    <div className="cardio-plan-row"><DialField label="Recovery" kind="clock" value={secondsToClock(rest)} onChange={value=>setRest(clockToSeconds(value))} placeholder="0:00"/><label className="cardio-unit-pick"><span className="dial-field-label">As</span><select value={recoveryType} onChange={e=>setRecoveryType(e.target.value)}>{(RECOVERY_TYPES.includes(recoveryType)?RECOVERY_TYPES:[...RECOVERY_TYPES,recoveryType]).map(item=><option key={item}>{item}</option>)}</select></label></div>
    <div className="cardio-plan-row"><label className="cardio-plan-text"><span className="dial-field-label">Warm-up</span><input value={warmup} onChange={e=>setWarmup(e.target.value)} placeholder="None"/></label><label className="cardio-plan-text"><span className="dial-field-label">Cooldown</span><input value={cooldown} onChange={e=>setCooldown(e.target.value)} placeholder="None"/></label></div></div>}
  {structure==='Circuit'&&<div className="cardio-plan-fields"><div className="ss-segment four">{(['Rounds','AMRAP','EMOM','For time'] as const).map(item=><button type="button" key={item} className={chip(circuitFormat===item)} onClick={()=>setCircuitFormat(item)}>{item}</button>)}</div><div className="cardio-plan-row">{circuitFormat==='AMRAP'||circuitFormat==='EMOM'?<DialField label="Duration" kind="minutes" unit="min" value={rounds} onChange={setRounds}/>:<DialField label="Rounds" kind="count" value={rounds} onChange={setRounds}/>}<DialField label="Round rest" kind="clock" value={secondsToClock(roundRest)} onChange={value=>setRoundRest(clockToSeconds(value))} placeholder="None"/></div>
    {/* ONE LINE PER STATION. Six stacked fields a station made three
        stations a page and a half; what a station is — the movement and its
        target — is the line, and its type, load and rest open beneath. */}
    <div className="circuit-stations compact"><span className="field-caption">STATIONS</span>{stations.map((station,index)=><article key={station.id}><div className="station-order"><b>{index+1}</b><button type="button" onClick={()=>moveStation(index,-1)} disabled={index===0} aria-label="Move up"><Icon name="up"/></button><button type="button" onClick={()=>moveStation(index,1)} disabled={index===stations.length-1} aria-label="Move down"><Icon name="down"/></button></div><div className="station-main"><input aria-label={`Station ${index+1} movement`} value={station.name} onChange={e=>updateStation(station.id,{name:e.target.value})} placeholder="Movement"/><div className="station-target"><input aria-label={`Station ${index+1} target`} inputMode="decimal" value={station.target} onChange={e=>updateStation(station.id,{target:e.target.value})} placeholder="Target"/><select aria-label={`Station ${index+1} unit`} value={station.unit} onChange={e=>updateStation(station.id,{unit:e.target.value})}>{(stationUnits[station.kind].includes(station.unit)?stationUnits[station.kind]:[station.unit,...stationUnits[station.kind]]).map(unit=><option key={unit}>{unit}</option>)}</select></div><details className="station-more"><summary>{[station.kind,station.load&&station.load!=='0 lb'?station.load:'',station.rest&&Number(station.rest)>0?`${station.rest}s rest after`:'no rest after'].filter(Boolean).join(' · ')}</summary><div><label>Type<select value={station.kind} onChange={e=>changeKind(station.id,e.target.value as CircuitStation['kind'])}><option>Cardio</option><option>Strength</option><option>Bodyweight</option><option>Rest</option></select></label>{station.kind==='Strength'&&<label>Load<input value={station.load||''} onChange={e=>updateStation(station.id,{load:e.target.value})} placeholder="35 lb"/></label>}<label>Rest after (sec)<input inputMode="numeric" value={station.rest||''} onChange={e=>updateStation(station.id,{rest:e.target.value})} placeholder="0"/></label></div></details></div><button type="button" className="remove-station" onClick={()=>setStations(items=>items.filter(item=>item.id!==station.id))} aria-label={`Remove station ${index+1}`}>×</button></article>)}<button type="button" className="add-station" onClick={addStation}>＋ Add station</button></div></div>}
  {structure==='Custom'&&<div className="cardio-plan-fields"><label className="cardio-plan-text"><span className="dial-field-label">What's the session?</span><textarea rows={4} value={customTarget} onChange={e=>setCustomTarget(e.target.value)} placeholder="e.g. 3 × 10 min at threshold, 2 min easy between"/></label></div>}
  <footer className="cardio-plan-footer"><div className="cardio-plan-preview"><span>THIS SESSION</span><strong>{cardioPlanSummary(plan)}</strong>{structure==='Intervals'&&(warmup||cooldown)?<small>{[warmup&&`${warmup} warm-up`,cooldown&&`${cooldown} cooldown`].filter(Boolean).join(' · ')}</small>:null}</div><label className="cardio-plan-adapt"><input type="checkbox" checked={targetSource==='Goal generated'} onChange={e=>setTargetSource(e.target.checked?'Goal generated':'Manual plan')}/><span><b>Let Forge adjust targets</b><small>{targetSource==='Goal generated'?'Paces and distances follow your endurance goal.':'These targets stay exactly as set.'}</small></span></label><div className="cardio-plan-actions"><button type="button" className="button ghost" onClick={onClose}>Cancel</button><button type="button" className="button" onClick={()=>onSave(plan)}>Save session</button></div></footer></section></div>}
