import type { CircuitStation, PlannedCardio } from '../components/CardioPlanBuilder';
import { enduranceTarget, goalClockSeconds } from './qualitySession';
import type { PaceModel } from './paceModel';

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
  /* A fixed shape instead of the rotation — a stations workout offered on a
     cardio day is always stations, whatever the HYROX-day rotation is up to. */
  shape?:HyroxShape;
  /* The HYROX goal's finish time as entered ("1:25:00" or "1:25:00 hh:mm:ss").
     When it reads, the runs are paced off it rather than off threshold. */
  goalTarget?:string;
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

/* WHAT A FINISH TIME ASKS FOR. A HYROX is close to half running and half
   stations, with five to seven minutes of Roxzone between them, so a goal time
   can be cut into the run pace and the station budget it needs. Three points
   anchor it, from Hunger in the Wild's pacing chart:

     60 min — 3:45/km runs, 3:15 per station
     75 min — 4:20/km runs, 4:20 per station
     90 min — 5:00/km runs, 5:30 per station

   Eight runs and eight stations at those numbers land five to six minutes
   under the goal at every anchor, and that remainder is the Roxzone, so the
   chart adds back up to the time it was built from. Between the anchors the
   numbers are interpolated; past either end the nearest segment carries on,
   which puts a 1:50 finish at about 5:53/km and 7:03 a station. The surprise
   the chart exists to make is that the run pace is slower than athletes expect
   and the station budget tighter: a 90-minute finisher jogs 5:00/km but has
   under five and a half minutes for every sled, carry and wall. */
const pad=(n:number)=>String(n).padStart(2,'0');
const PACE_ANCHORS:Array<[goalMinutes:number,runSecondsPerKm:number,stationSeconds:number]>=[[60,225,195],[75,260,260],[90,300,330]];
/* DOUBLES IS A DIFFERENT RACE. Each partner runs every kilometre but splits
   the stations, so the same run pace finishes far sooner: 5:00/km is a 1:11
   doubles and roughly a 1:30 singles. This is the Open Doubles pace table
   Preston supplied — run pace per km against finish time — read in reverse,
   finish time to pace. */
const DOUBLES_TABLE:Array<[finishMinutes:number,runSecondsPerKm:number]>=[
  [50,210],[53,225],[56,240],[59,255],[62,270],[65,280],[68,290],[71,300],[74,315],[77,330],[80,345],[83,360],[86,375],
  [89,390],[92,405],[95,420],[98,435],[101,450],[104,465],[107,480],[110,500],[113,520],[116,540],[119,555],[120,560],
];
export const isDoubles=(division?:string)=>/doubles/i.test(division||'');
/* Straight lines between the rows of a table, carried on past either end by
   the nearest segment. */
const lerp=(rows:Array<[number,number]>,x:number)=>{
  let index=0;
  while(index<rows.length-2&&x>rows[index+1][0])index+=1;
  const [x0,y0]=rows[index];const [x1,y1]=rows[index+1];
  return y0+(y1-y0)*(x-x0)/(x1-x0);
};
export type HyroxTargets={goalSeconds:number;runSecondsPerKm:number;runSecondsPerMile:number;stationSeconds:number;runningSeconds:number;roxzoneSeconds:number;doubles:boolean};
export function hyroxTargets(goalTarget?:string|number,division?:string):HyroxTargets|null{
  const goalSeconds=typeof goalTarget==='number'?goalTarget:goalClockSeconds(goalTarget);
  /* Under 50 minutes is beyond the elite field and over two and a half hours
     is a walk; neither is a pace the chart can speak to. A relay splits the
     running itself, so no table here describes it. */
  if(!(goalSeconds>=50*60&&goalSeconds<=150*60))return null;
  if(/relay/i.test(division||''))return null;
  const minutes=goalSeconds/60;
  if(isDoubles(division)){
    /* The doubles table gives the run; what is left after eight runs and six
       minutes of Roxzone is the stations, shared between two. */
    const runSecondsPerKm=Math.round(lerp(DOUBLES_TABLE,minutes));
    const roxzoneSeconds=360;
    const stationSeconds=Math.max(60,Math.round((goalSeconds-8*runSecondsPerKm-roxzoneSeconds)/8));
    return{goalSeconds,runSecondsPerKm,runSecondsPerMile:runSecondsPerKm*1.609344,stationSeconds,runningSeconds:runSecondsPerKm*8,roxzoneSeconds,doubles:true};
  }
  const segment=minutes<=PACE_ANCHORS[1][0]?0:1;
  const [m0,r0,s0]=PACE_ANCHORS[segment];const [m1,r1,s1]=PACE_ANCHORS[segment+1];
  const along=(minutes-m0)/(m1-m0);
  const runSecondsPerKm=Math.round(r0+(r1-r0)*along);
  const stationSeconds=Math.round(s0+(s1-s0)*along);
  return{goalSeconds,runSecondsPerKm,runSecondsPerMile:runSecondsPerKm*1.609344,stationSeconds,runningSeconds:runSecondsPerKm*8,roxzoneSeconds:Math.max(0,goalSeconds-8*(runSecondsPerKm+stationSeconds)),doubles:false};
}

/* EVERY TRAINING PACE FROM THE RACE PACE. A HYROX athlete's running is built
   around one number — the pace of the eight race kilometres — and the rest
   hang off it. This is the Repz training-paces cheatsheet, seconds per km:
   HYROX run pace, then recovery run, long run, threshold run and VO2 max
   intervals. Recovery sits about 22% slower than race pace, the long run 15%,
   threshold 6.5% quicker and VO2 work 15.5% quicker, steadily down the table. */
const REPZ_TABLE:Array<[race:number,recovery:number,long:number,threshold:number,vo2:number]>=[
  [210,257,242,196,177],[240,294,276,224,203],[270,330,311,252,228],[300,367,345,281,254],[330,403,380,309,279],
  [360,438,414,337,304],[390,474,449,365,330],[420,509,483,393,355],[450,544,518,421,380],
];
export type HyroxTrainingPaces={race:number;recovery:number;long:number;threshold:number;vo2:number};
export function hyroxTrainingPaces(raceSecondsPerKm:number):HyroxTrainingPaces|null{
  if(!(raceSecondsPerKm>0))return null;
  const column=(index:1|2|3|4)=>Math.round(lerp(REPZ_TABLE.map(row=>[row[0],row[index]] as [number,number]),raceSecondsPerKm));
  return{race:raceSecondsPerKm,recovery:column(1),long:column(2),threshold:column(3),vo2:column(4)};
}

/* THE HYROX GOAL SETS THE PLAN'S RUNNING — WITHIN WHAT THE LOG SUPPORTS.
   An athlete training for HYROX and no running race had no race to pace the
   week from, so the plan fell back on whatever its last run implied. With a
   HYROX goal time the paces come from the table above instead. Each one is the
   SLOWER of the table and the athlete's own evidence: the goal decides what
   the training is for, and a pace the log has not shown yet is not handed out
   as an easy run. A running race goal, when there is one, still owns the
   paces — it is the more specific claim about how fast to run. */
export function withHyroxPaces<T extends PaceModel>(model:T,goals:Array<{type?:string;exercise?:string;title?:string;target?:string;eventDivision?:string;date?:string}>):T{
  if(enduranceTarget(goals))return model;
  const goal=hyroxGoalOf(goals);
  const targets=hyroxTargets(goal?.target,goal?.eventDivision);
  const table=targets&&hyroxTrainingPaces(targets.runSecondsPerKm);
  if(!table)return model;
  const mile=(perKm:number)=>perKm*1.609344;
  const slower=(fromTable:number,logged:number)=>model.supported&&logged>0?Math.max(fromTable,logged):fromTable;
  return{
    ...model,
    source:model.supported?model.source:'goal',
    easyFast:slower(mile(table.long),model.easyFast),
    easySlow:slower(mile(table.recovery),model.easySlow),
    /* The long run's pace is the nearest thing a HYROX plan has to marathon
       pace; nothing in the table is quicker than VO2 work, so repetitions
       share it. */
    marathon:slower(mile(table.long),model.marathon),
    threshold:slower(mile(table.threshold),model.threshold),
    interval:slower(mile(table.vo2),model.interval),
    repetition:slower(mile(table.vo2),model.repetition),
  };
}
const clock=(seconds:number)=>`${Math.floor(Math.round(seconds)/60)}:${pad(Math.round(seconds)%60)}`;
const finishClock=(seconds:number)=>{const total=Math.round(seconds);return `${Math.floor(total/3600)}:${pad(Math.floor(total%3600/60))}:${pad(total%60)}`;};
/* Seconds per mile added to GOAL pace for each shape. The race is run at goal
   pace and no faster — bank nothing on the first four runs — so compromised
   running, simulations and race week all sit on it. A stations day is there
   for the sled, and its runs ease off a little. */
export const GOAL_OFFSET:Record<HyroxShape,number>={stations:15,compromised:0,simulation:0,'race-week':0};

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
  const rotation=hyroxShape(input.sessionIndex,input.weeksToRace);
  const shape=rotation==='race-week'?rotation:input.shape||rotation;
  const eased=(input.readiness??100)<HYROX_READINESS_FLOOR;
  const threshold=input.thresholdSecondsPerMile>0?input.thresholdSecondsPerMile:0;
  /* A goal time sets the runs. It is never run faster than threshold, though:
     eight kilometres between stations is not a race a goal can make someone
     faster than an hour's running effort, and asking for it is how the first
     four runs get banked and the lunges get walked. */
  const targets=hyroxTargets(input.goalTarget,input.division);
  const goalPace=targets?Math.max(targets.runSecondsPerMile,threshold):0;
  const heldAtThreshold=Boolean(targets&&threshold&&threshold>targets.runSecondsPerMile);
  const basePace=goalPace?goalPace+GOAL_OFFSET[shape]:threshold?threshold+RUN_OFFSET[shape]:0;
  const paceSeconds=basePace?basePace+(eased?EASED_OFFSET:0):0;
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
  const paceText=paceSeconds?`${runPace}${split?` (${split} per km)`:''}`:'controlled effort — no run pace until a run establishes one';
  /* What the goal time asks of race day, said once, so the session reads as a
     step toward a number rather than a pace from nowhere. */
  const goalLine=targets?` A ${finishClock(targets.goalSeconds)} finish is ${clock(targets.runSecondsPerKm)}/km on all eight runs, about ${clock(targets.stationSeconds)} per station and ${Math.round(targets.roxzoneSeconds/60)} minutes in the Roxzone.${heldAtThreshold?` That run pace is quicker than your threshold, so the runs hold at threshold until a faster run says otherwise.`:''}`:'';

  const title=shape==='stations'?`HYROX stations · ${half} half`:shape==='compromised'?'HYROX compromised running':shape==='simulation'?`HYROX ${full?'full':'half'} simulation`:'HYROX race-week sharpener';
  const summary=shape==='stations'?`${runs} × 1 km at ${runPace} · ${names} at race distance`
    :shape==='compromised'?`${runs} × 1 km at ${runPace} · ${names} at ${eased?'40%':'half'} distance, no rest`
    :shape==='simulation'?`${full?'The full course':'First half of the course'} in order · ${runs} × 1 km at ${runPace}`
    :`3 × 1 km at ${runPace} · short sled, wall balls, SkiErg`;
  const rationale=(shape==='stations'?`Station execution is the point today, so the runs sit a little under race pace at ${paceText}. Each station is at ${division==='wo'||division==='wp'?"women's":"men's"} ${division.endsWith('p')?'pro':'open'} distance and load; rest a minute after each.`
    :shape==='compromised'?`Race-pace running straight off the stations — ${paceText} — with the stations cut to ${eased?'40%':'half'} so the runs stay honest. No rest between pieces.`
    :shape==='simulation'?`${full?'The whole race':'Half the race'}, in order, at a pace you can hold across all eight runs: ${paceText}. Log the total time — it becomes evidence for your HYROX goal.`
    :`Race is inside a week. Three short runs at race pace (${paceText}) and a touch of three stations. Nothing here should leave a mark.`)
    +goalLine
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

/* PLAN'S HYROX ROW. The day writes its own session, so the week can only say
   what that session is for — and with a goal time set, that is the race pace
   and station budget the time asks for, not a promise with no number in it. */
export const HYROX_PLAN_DEFAULT='Forge writes the session on the day — stations, compromised running or a simulation, paced off your threshold.';
/* HYROX TRAINING IS FOR A HYROX GOAL. A HYROX day in the split used to get the
   full session — sleds, wall balls, simulations — whether or not the athlete
   was training for one. Preston's rule: Forge builds HYROX work only when a
   HYROX race is in Goals. Without one the day stays open and says why. */
type HyroxGoalRef={type?:string;exercise?:string;title?:string;target?:string;eventDivision?:string;date?:string};
export const hyroxGoalOf=<T extends HyroxGoalRef>(goals:T[]|undefined|null):T|undefined=>(goals||[]).find(item=>item.type!=='Strength'&&/hyrox/i.test(`${item.exercise||''} ${item.title||''}`));
export const HYROX_NO_GOAL='Open day — add a HYROX goal and Forge writes HYROX sessions here.';
export function hyroxPlanDetail(goals:HyroxGoalRef[]):string{
  const goal=hyroxGoalOf(goals);
  if(!goal)return HYROX_NO_GOAL;
  const targets=hyroxTargets(goal.target,goal.eventDivision);
  return targets?`Forge writes the session on the day. Your ${finishClock(targets.goalSeconds)} asks for ${clock(targets.runSecondsPerKm)}/km runs and about ${clock(targets.stationSeconds)} per station.`:HYROX_PLAN_DEFAULT;
}

/* How many HYROX sessions are in the log — any day whose cardio was logged
   as HYROX, or whose title says so. Counts days, not entries. */
export function hyroxSessionsDone(records:Array<{date:string;title?:string;cardioSessions?:Array<{activity?:string;summary?:string}>}>,before?:string){
  return records.filter(record=>(!before||record.date<before)&&(/hyrox/i.test(record.title||'')||(record.cardioSessions||[]).some(session=>/hyrox/i.test(`${session.activity||''} ${session.summary||''}`)))).length;
}

/* Days since the last HYROX session in the log, before `today`; Infinity when
   there has never been one. */
export function daysSinceHyrox(records:Array<{date:string;title?:string;cardioSessions?:Array<{activity?:string;summary?:string}>}>,today:string){
  const last=records.filter(record=>record.date<today&&(/hyrox/i.test(record.title||'')||(record.cardioSessions||[]).some(session=>/hyrox/i.test(`${session.activity||''} ${session.summary||''}`)))).map(record=>record.date).sort().pop();
  if(!last)return Infinity;
  return Math.round((new Date(`${today}T12:00:00`).getTime()-new Date(`${last}T12:00:00`).getTime())/86400000);
}
/* A week without station work is a week the race gets harder. */
export const HYROX_STATIONS_EVERY_DAYS=7;

export const weeksUntil=(iso:string|undefined,today:string):number|null=>{
  if(!iso)return null;
  const target=new Date(`${iso}T12:00:00`).getTime();const now=new Date(`${today}T12:00:00`).getTime();
  if(!Number.isFinite(target)||!Number.isFinite(now))return null;
  return Math.round((target-now)/(7*86400000)*10)/10;
};
