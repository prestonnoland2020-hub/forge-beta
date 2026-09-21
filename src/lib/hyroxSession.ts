import type { CircuitStation, PlannedCardio } from '../components/CardioPlanBuilder';

/* FORGE WRITES THE HYROX DAY. The race has a fixed shape — eight stations at
   fixed distances, each preceded by a 1 km run — so the session does not need
   a model to invent it. What changes from week to week is which half of the
   course, how much of each station, how fast the runs, and when the athlete
   rehearses the whole thing. All of that is arithmetic on three inputs: how
   many HYROX sessions have been done, the athlete's threshold pace, and how far
   away race day is. Nothing here is random, so the same inputs always produce
   the same session and a test can pin every number.

   Three shapes rotate. STATIONS: four stations at race distance with a 1 km
   run before each, runs a little slower than race pace because the station
   is the point. COMPROMISED RUNNING: shorter stations, no rest, runs at race
   pace — the skill of running well straight off a sled. SIMULATION: the course
   in order, half of it the first time, all of it the next, and it counts as
   evidence for the HYROX goal because it IS the event. Race week gets a short
   sharpener instead of any of those. */

export type HyroxShape='stations'|'compromised'|'simulation'|'race-week';
export type HyroxInput={
  /* How many HYROX sessions the athlete has already completed. Drives the rotation. */
  sessionIndex:number;
  /* Seconds per mile at threshold; 0 when no run has established one. */
  thresholdSecondsPerMile:number;
  division?:string;
  weeksToRace?:number|null;
  readiness?:number;
  metric?:boolean;
};
export type HyroxSession={
  shape:HyroxShape;
  title:string;
  summary:string;
  rationale:string;
  runPace:string;
  runs:number;
  plan:PlannedCardio;
};

export const HYROX_CYCLE=6;
export const HYROX_READINESS_FLOOR=58;
/* Seconds per mile ADDED to threshold for each shape's 1 km runs. Eight runs
   with stations between them are held slower than a continuous 10 km, and a
   stations day slower again — the athlete is there for the sled, not the run. */
export const RUN_OFFSET:Record<HyroxShape,number>={stations:35,compromised:15,simulation:25,'race-week':25};
export const EASED_OFFSET=20;

type Station={name:string;kind:CircuitStation['kind'];target:number;unit:'meters'|'reps';minutes:number;load?:Record<Division,string>;targetFor?:Partial<Record<Division,number>>};
type Division='mo'|'wo'|'mp'|'wp';

/* The course, in race order, at race distance. Loads are the current HYROX
   standards for each division; women's open wall balls are 75 reps. Station
   names match the exercise library so the logger recognises them. */
export const HYROX_STATIONS:Station[]=[
  {name:'SkiErg',kind:'Cardio',target:1000,unit:'meters',minutes:4},
  {name:'Sled Push',kind:'Strength',target:50,unit:'meters',minutes:3,load:{mo:'152 kg',wo:'102 kg',mp:'202 kg',wp:'152 kg'}},
  {name:'Sled Pull',kind:'Strength',target:50,unit:'meters',minutes:4,load:{mo:'103 kg',wo:'78 kg',mp:'153 kg',wp:'103 kg'}},
  {name:'Burpee Broad Jumps',kind:'Bodyweight',target:80,unit:'meters',minutes:5},
  {name:'Rowing',kind:'Cardio',target:1000,unit:'meters',minutes:4.5},
  {name:'Farmers Carry',kind:'Strength',target:200,unit:'meters',minutes:2,load:{mo:'2 × 24 kg',wo:'2 × 16 kg',mp:'2 × 32 kg',wp:'2 × 24 kg'}},
  {name:'Sandbag Lunges',kind:'Strength',target:100,unit:'meters',minutes:4,load:{mo:'20 kg',wo:'10 kg',mp:'30 kg',wp:'20 kg'}},
  {name:'Wall Balls',kind:'Strength',target:100,unit:'reps',minutes:5,targetFor:{wo:75},load:{mo:'6 kg · 10 ft',wo:'4 kg · 9 ft',mp:'9 kg · 10 ft',wp:'6 kg · 10 ft'}},
];

export const divisionKey=(division?:string):Division=>{
  const text=(division||'').toLowerCase();
  const women=text.includes('women');
  const pro=text.includes('pro');
  return women?(pro?'wp':'wo'):(pro?'mp':'mo');
};

const pad=(n:number)=>String(n).padStart(2,'0');
export const formatRunPace=(secondsPerMile:number,metric=false)=>{
  if(!(secondsPerMile>0))return 'controlled effort';
  const seconds=Math.round(metric?secondsPerMile/1.609344:secondsPerMile);
  return `${Math.floor(seconds/60)}:${pad(seconds%60)}/${metric?'km':'mi'}`;
};
/* 1 km at a per-mile pace, as a clock, so the athlete knows the split to hit. */
export const kmSplit=(secondsPerMile:number)=>{
  if(!(secondsPerMile>0))return '';
  const seconds=Math.round(secondsPerMile/1.609344);
  return `${Math.floor(seconds/60)}:${pad(seconds%60)}`;
};

export function hyroxShape(sessionIndex:number,weeksToRace?:number|null):HyroxShape{
  if(weeksToRace!=null&&weeksToRace<=1)return 'race-week';
  const slot=((sessionIndex%HYROX_CYCLE)+HYROX_CYCLE)%HYROX_CYCLE;
  if(slot===HYROX_CYCLE-1)return 'simulation';
  return slot%2===0?'stations':'compromised';
}
/* Stations days alternate halves of the course; simulations alternate half
   and full. Both keyed off how many of that shape have come before. */
export const stationsHalf=(sessionIndex:number):'front'|'back'=>Math.floor(sessionIndex/2)%2===0?'front':'back';
export const simulationFull=(sessionIndex:number)=>Math.floor(sessionIndex/HYROX_CYCLE)%2===1;

const scaleTarget=(station:Station,share:number,division:Division)=>{
  const raw=(station.targetFor?.[division]??station.target)*share;
  if(station.unit==='reps')return Math.max(10,Math.round(raw/5)*5);
  return Math.max(10,Math.round(raw/10)*10);
};

export function hyroxSession(input:HyroxInput):HyroxSession{
  const shape=hyroxShape(input.sessionIndex,input.weeksToRace);
  const eased=(input.readiness??100)<HYROX_READINESS_FLOOR;
  const threshold=input.thresholdSecondsPerMile>0?input.thresholdSecondsPerMile:0;
  const paceSeconds=threshold?threshold+RUN_OFFSET[shape]+(eased?EASED_OFFSET:0):0;
  const runPace=formatRunPace(paceSeconds,input.metric);
  const split=kmSplit(paceSeconds);
  const division=divisionKey(input.division);
  const half=stationsHalf(input.sessionIndex);
  const full=simulationFull(input.sessionIndex);

  const picked:Array<{station:Station;share:number;rest:string}>=(()=>{
    if(shape==='stations'){
      const list=half==='front'?HYROX_STATIONS.slice(0,4):HYROX_STATIONS.slice(4);
      return list.map(station=>({station,share:1,rest:'60'}));
    }
    if(shape==='compromised'){
      /* The other half from the last stations day, at half distance, so the
         week covers the whole course between the two sessions. */
      const list=half==='front'?HYROX_STATIONS.slice(4):HYROX_STATIONS.slice(0,4);
      return list.map(station=>({station,share:eased?.4:.5,rest:'0'}));
    }
    if(shape==='simulation'){
      const list=full?HYROX_STATIONS:HYROX_STATIONS.slice(0,4);
      return list.map(station=>({station,share:1,rest:'0'}));
    }
    /* Race week: three short touches — the sled, the wall, the erg — at race
       distance is too much; a third each keeps the feel and spends nothing. */
    return [HYROX_STATIONS[1],HYROX_STATIONS[7],HYROX_STATIONS[0]].map(station=>({station,share:1/3,rest:'60'}));
  })();

  const entries:CircuitStation[]=[];
  let id=1;
  let minutes=0;
  picked.forEach(({station,share,rest})=>{
    entries.push({id:id++,kind:'Cardio',name:'Run',target:'1000',unit:'meters',pace:runPace,rest:'0'});
    minutes+=paceSeconds?paceSeconds/1.609344/60:5;
    const target=scaleTarget(station,share,division);
    entries.push({id:id++,kind:station.kind,name:station.name,target:String(target),unit:station.unit,load:station.load?.[division],rest});
    minutes+=station.minutes*share+Number(rest)/60;
  });
  const runs=picked.length;
  const names=picked.map(({station})=>station.name).join(', ');
  const paceText=threshold?`${runPace}${split?` (${split} per km)`:''}`:'controlled effort — no run pace until a run establishes one';

  const title=shape==='stations'?`HYROX stations · ${half} half`:shape==='compromised'?'HYROX compromised running':shape==='simulation'?`HYROX ${full?'full':'half'} simulation`:'HYROX race-week sharpener';
  const summary=shape==='stations'?`${runs} × 1 km at ${runPace} · ${names} at race distance`
    :shape==='compromised'?`${runs} × 1 km at ${runPace} · ${names} at ${eased?'40%':'half'} distance, no rest`
    :shape==='simulation'?`${full?'The full course':'First half of the course'} in order · ${runs} × 1 km at ${runPace}`
    :`3 × 1 km at ${runPace} · short sled, wall balls, SkiErg`;
  const rationale=(shape==='stations'?`Station execution is the point today, so the runs sit a little under race pace at ${paceText}. Each station is at ${division==='wo'||division==='wp'?"women's":"men's"} ${division.endsWith('p')?'pro':'open'} distance and load; rest a minute after each.`
    :shape==='compromised'?`Race-pace running straight off the stations — ${paceText} — with the stations cut to ${eased?'40%':'half'} so the runs stay honest. No rest between pieces.`
    :shape==='simulation'?`${full?'The whole race':'Half the race'}, in order, at a pace you can hold across all eight runs: ${paceText}. Log the total time — it becomes evidence for your HYROX goal.`
    :`Race is inside a week. Three short runs at race pace (${paceText}) and a touch of three stations. Nothing here should leave a mark.`)
    +(eased?` Readiness is under ${HYROX_READINESS_FLOOR}, so the pace is eased by ${EASED_OFFSET} s/mi.`:'');

  const plan:PlannedCardio={
    id:7000+input.sessionIndex,
    activity:'HYROX',
    structure:'Circuit',
    targetSource:'Goal generated',
    circuitFormat:'For time',
    rounds:'1',
    roundRest:'0',
    duration:String(Math.round(minutes)),
    stationEntries:entries,
    customTarget:summary,
  };
  return{shape,title,summary,rationale,runPace,runs,plan};
}

/* How many HYROX sessions are in the log — any day whose cardio was logged
   as HYROX, or whose title says so. Counts days, not entries. */
export function hyroxSessionsDone(records:Array<{date:string;title?:string;cardioSessions?:Array<{activity?:string;summary?:string}>}>,before?:string){
  return records.filter(record=>(!before||record.date<before)&&(/hyrox/i.test(record.title||'')||(record.cardioSessions||[]).some(session=>/hyrox/i.test(`${session.activity||''} ${session.summary||''}`)))).length;
}

export const weeksUntil=(iso:string|undefined,today:string):number|null=>{
  if(!iso)return null;
  const target=new Date(`${iso}T12:00:00`).getTime();const now=new Date(`${today}T12:00:00`).getTime();
  if(!Number.isFinite(target)||!Number.isFinite(now))return null;
  return Math.round((target-now)/(7*86400000)*10)/10;
};
