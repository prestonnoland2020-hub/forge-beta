export type CardioStructure='steady'|'intervals'|'circuit'|'custom';
export type CardioSegmentRole='warmup'|'work'|'recovery'|'cooldown'|'station'|'rest';
export type CardioEntrySource='manual'|'wearable'|'imported';
export type RecoveryKind='Passive rest'|'Walk'|'Easy jog'|'Easy bike'|'Easy row'|'Custom';

export type IntervalActual={
  id:number;
  repeatIndex:number;
  distance:string;
  time:string;
  completed:boolean;
  source:CardioEntrySource;
  recovery:{kind:RecoveryKind;duration:string;distance:string;activity:string};
};

export type CardioRecommendation={
  mode:Exclude<CardioStructure,'custom'>;
  label:string;
  title:string;
  summary:string;
  reason:string;
  preferred:boolean;
};

export type CardioLogDraft={
  id:string;
  structure:CardioStructure;
  activity:string;
  summary:string;
  prescription:Record<string,unknown>;
  intervalActuals?:IntervalActual[];
  circuitStations?:Array<{name:string;value:string;unit:string}>;
};

export type LegacyCardioInterval={cardioType?:string;activity?:string;unit?:string;distanceUnit?:string;distance?:number|string;time?:number|string};
export type CardioTotals={minutes:number;workMinutes:number;recoveryMinutes:number;distance:number;workDistance:number;recoveryDistance:number;completed:number};

export function legacyCardioIntervals(draft:CardioLogDraft):LegacyCardioInterval[]{
  const value=draft.prescription.legacyIntervals;
  return Array.isArray(value)?value as LegacyCardioInterval[]:[];
}

const distanceMiles=(distance:number,unit:string)=>{const normalized=unit.trim().toLowerCase();if(normalized.startsWith('km')||normalized.includes('kilometer'))return distance/1.609344;if(normalized.startsWith('meter')||normalized==='m')return distance/1609.344;if(normalized.startsWith('yard')||normalized==='yd'||normalized==='yds')return distance/1760;return normalized.startsWith('mile')||normalized==='mi'?distance:0};
const isRunning=(value:string)=>/run|jog|walk/i.test(value);
const isNonRunningCardio=(value:string)=>/row|bike|cycle|ski|elliptical|erg|wall ball|sled|burpee|circuit/i.test(value);
const isMileageInterval=(activity:string,unit:string)=>!isNonRunningCardio(activity)&&(/mile|^mi$|kilometer|^km$|meter|^m$|yard|^yds?$/.test(unit.trim().toLowerCase())||isRunning(activity));
export function cardioMiles(draft:CardioLogDraft):number{
  const legacy=legacyCardioIntervals(draft);
  if(legacy.length)return legacy.reduce((total,line)=>{const activity=String(line.cardioType||line.activity||draft.activity);const unit=String(line.unit||line.distanceUnit||(isRunning(activity)?'miles':''));return total+(isMileageInterval(activity,unit)?distanceMiles(Number(line.distance)||0,unit):0)},0);
  const unit=String(draft.prescription.distanceUnit||'miles');
  if(!isMileageInterval(draft.activity,unit))return 0;
  const totals=summarizeCardioDraft(draft);return distanceMiles(totals.distance,unit);
}

export function isRunningCardio(draft:CardioLogDraft):boolean{
  if(isNonRunningCardio(draft.activity)||/\bwalk\b/i.test(draft.activity))return false;
  const legacy=legacyCardioIntervals(draft);
  if(legacy.length)return legacy.some(line=>{const activity=String(line.cardioType||line.activity||draft.activity);const unit=String(line.unit||line.distanceUnit||(isRunning(activity)?'miles':''));return !isNonRunningCardio(activity)&&!/\bwalk\b/i.test(activity)&&isMileageInterval(activity,unit)&&(Number(line.distance)||0)>0});
  return cardioMiles(draft)>0;
}

export function formatCardioMinutes(value:number){const seconds=Math.max(0,Math.round(value*60));const hours=Math.floor(seconds/3600),minutes=Math.floor((seconds%3600)/60),remainder=seconds%60;return hours?`${hours}:${String(minutes).padStart(2,'0')}:${String(remainder).padStart(2,'0')}`:`${minutes}:${String(remainder).padStart(2,'0')}`}
export function formatCardioPace(draft:CardioLogDraft){
  let miles=cardioMiles(draft);let minutes=summarizeCardioDraft(draft).minutes;
  if(!miles||!minutes){
    const distanceMatch=draft.summary.match(/(\d+(?:\.\d+)?)\s*(?:mi(?:les?)?\b)/i);
    const timeMatch=draft.summary.match(/\b(\d{1,2}:\d{2}(?::\d{2})?)\b/);
    if(distanceMatch&&timeMatch){
      miles=Number(distanceMatch[1]);
      const parts=timeMatch[1].split(':').map(Number);
      minutes=parts.length===3?parts[0]*60+parts[1]+parts[2]/60:parts[0]+parts[1]/60;
    }
  }
  if(!miles||!minutes)return'';
  const looksLikeRunning=/run|jog|walk/i.test(draft.activity)||/\bmi(?:les?)?\b/i.test(draft.summary);
  return looksLikeRunning?`${formatCardioMinutes(minutes/miles)}\u00a0/mi`:'';
}
const tidy=(value:number)=>Number(value.toFixed(2)).toString();
/* "1 miles" reads as a bug even though it is only grammar. */
const unitLabel=(value:number,unit:string)=>Math.abs(value)===1?unit.replace(/s$/,''):unit;
export function formatCardioSummary(draft:CardioLogDraft){
  const legacy=legacyCardioIntervals(draft);
  if(!legacy.length){const pace=formatCardioPace(draft);return[draft.summary,pace].filter(Boolean).join(' · ')}
  const minutes=legacy.reduce((sum,line)=>sum+(Number(line.time)||0),0);const distances=new Map<string,number>();legacy.forEach(line=>{const distance=Number(line.distance)||0,activity=String(line.cardioType||line.activity||draft.activity),unit=String(line.unit||line.distanceUnit||(isRunning(activity)?'mi':'')).trim();if(distance&&unit)distances.set(unit,(distances.get(unit)||0)+distance)});
  const distanceText=[...distances].map(([unit,distance])=>`${tidy(distance)}\u00a0${unitLabel(distance,unit)}`).join(' + ');return [draft.activity,distanceText,minutes?formatCardioMinutes(minutes):'',formatCardioPace(draft)].filter(Boolean).join(' · ');
}

export function recommendCardioOptions({readiness,strengthFatigue,goalText}:{readiness:number;strengthFatigue:'Low'|'Moderate'|'High';goalText:string}):CardioRecommendation[]{
  const goal=goalText.toLowerCase();
  const preferred:CardioRecommendation['mode']=readiness<60||strengthFatigue==='High'?'steady':goal.includes('hyrox')?'circuit':goal?'intervals':'steady';
  const options:Omit<CardioRecommendation,'preferred'>[]=[
    {mode:'steady',label:'Steady',title:'Easy aerobic',summary:'Conversational effort · 25–40 min',reason:preferred==='steady'?'Best fit for today’s recovery and accumulated strength fatigue.':'Lower-fatigue aerobic work that preserves recovery.'},
    {mode:'intervals',label:'Intervals',title:'Goal-paced intervals',summary:'Structured work + recoveries',reason:preferred==='intervals'?'Best direct support for the active endurance goal.':'A higher-quality option when you feel ready for structured work.'},
    {mode:'circuit',label:'Circuit',title:'Mixed conditioning',summary:'Rounds · measurable stations',reason:preferred==='circuit'?'Best match for the event’s mixed running and station demands.':'A selectable conditioning alternative with independently measured stations.'},
  ];
  return options.map(option=>({...option,preferred:option.mode===preferred}));
}

export function makeIntervalActual(index:number,distance:string,recoveryDuration:string,recoveryKind:RecoveryKind):IntervalActual{
  return{id:index+1,repeatIndex:index+1,distance,time:'',completed:true,source:'manual',recovery:{kind:recoveryKind,duration:recoveryDuration,distance:'',activity:recoveryKind==='Custom'?'':recoveryKind}};
}

export function copyIntervalActual(source:IntervalActual,target:IntervalActual):IntervalActual{
  return{...source,id:target.id,repeatIndex:target.repeatIndex,source:'manual',recovery:{...source.recovery}};
}

export function isActiveRecovery(kind:RecoveryKind){return kind!=='Passive rest'}
export function personalizeSteadyMinutes({weeklyMileage,runningDays,readiness}:{weeklyMileage:number;runningDays:number;readiness:number}){return Math.round(Math.max(20,Math.min(45,24+weeklyMileage*.55+(runningDays-3)*2))*(readiness<60?.75:1)/5)*5}

const clockSeconds=(value:string)=>{const parts=value.split(':').map(Number);if(parts.some(Number.isNaN))return 0;if(parts.length===2)return parts[0]*60+parts[1];return parts[0]||0};
export function summarizeCardioDraft(draft:CardioLogDraft):CardioTotals{
  const legacy=legacyCardioIntervals(draft);if(legacy.length){const minutes=legacy.reduce((sum,line)=>sum+(Number(line.time)||0),0);return{minutes,workMinutes:minutes,recoveryMinutes:0,distance:cardioMiles(draft),workDistance:cardioMiles(draft),recoveryDistance:0,completed:legacy.length}}
  if(draft.structure==='intervals'){
    const reps=(draft.intervalActuals||[]).filter(rep=>rep.completed);
    const workSeconds=reps.reduce((sum,rep)=>sum+clockSeconds(rep.time),0);
    const recoverySeconds=reps.reduce((sum,rep)=>sum+clockSeconds(rep.recovery.duration),0);
    const workDistance=reps.reduce((sum,rep)=>sum+(Number(rep.distance)||0),0);
    const recoveryDistance=reps.reduce((sum,rep)=>sum+(isActiveRecovery(rep.recovery.kind)?Number(rep.recovery.distance)||0:0),0);
    return{minutes:(workSeconds+recoverySeconds)/60,workMinutes:workSeconds/60,recoveryMinutes:recoverySeconds/60,distance:workDistance+recoveryDistance,workDistance,recoveryDistance,completed:reps.length};
  }
  if(draft.structure==='steady')return{minutes:Number(draft.prescription.duration)||0,workMinutes:Number(draft.prescription.duration)||0,recoveryMinutes:0,distance:Number(draft.prescription.distance)||0,workDistance:Number(draft.prescription.distance)||0,recoveryDistance:0,completed:1};
  return{minutes:0,workMinutes:0,recoveryMinutes:0,distance:0,workDistance:0,recoveryDistance:0,completed:1};
}

/* Endurance work splits into running and everything else — nothing finer.
   Session names in the imported history are training *intensities* ("Base",
   "Easy", "Speed Run", "Long Run"), which are all running and should never have
   been shown as separate cardio categories. */
export function enduranceGroup(draft:CardioLogDraft):'Running'|'Other'{
  return isRunningCardio(draft)?'Running':'Other';
}
