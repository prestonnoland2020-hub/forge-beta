import type { PlannedCardio } from '../../components/CardioPlanBuilder';

/* THE SPLIT'S SHAPES, shared by the split editor (pages/TrainingPlanPage) and
   the step-by-step guide (components/SplitGuide), so a day built either way
   is the same day. */
/* STARTING POINTS. Building a split from a blank day means naming days,
   picking a type, picking muscles and picking lifts, seven times over. Most
   people want one of four shapes; each is a tap, and every day stays
   editable after. */
export const TEMPLATES:Array<{id:string;label:string;copy:string;days:Array<[string,DayType,string[]]>}>=[
  {id:'full',label:'Full body',copy:'3 days · every muscle each day',days:[['Full Body A','strength',['Quads','Chest','Back']],['Full Body B','strength',['Hamstrings','Shoulders','Back']],['Full Body C','strength',['Glutes','Chest','Biceps','Triceps']]]},
  {id:'upper-lower',label:'Upper / Lower',copy:'4 days · upper and lower twice',days:[['Upper A','strength',['Chest','Back','Shoulders']],['Lower A','strength',['Quads','Hamstrings','Glutes']],['Upper B','strength',['Back','Chest','Biceps','Triceps']],['Lower B','strength',['Hamstrings','Quads','Glutes']]]},
  {id:'ppl',label:'Push / Pull / Legs',copy:'3 days · push, pull, legs',days:[['Push','strength',['Chest','Shoulders','Triceps']],['Pull','strength',['Back','Biceps']],['Legs','strength',['Quads','Hamstrings','Glutes']]]},
  {id:'hybrid',label:'Hybrid',copy:'4 days · lifting and running',days:[['Upper','strength',['Chest','Back','Shoulders']],['Quality Run','cardio',[]],['Lower','strength',['Quads','Hamstrings','Glutes']],['Long Run','cardio',[]]]},
];
export const DAY_TYPES:Array<[DayType,string]>=[['strength','Lift'],['cardio','Run'],['mixed','Both'],['rest','Rest'],['hyrox','HYROX']];
/* CARDIO IS A TAP, NOT A FORM. Choosing your own session meant a policy
   switch, a builder over the sheet, four session shapes, seven activities and
   a dial for every number — to say "easy run". Most planned sessions are one
   of these; tapping one puts it on the day as it stands, and Edit opens the
   full builder on it for anyone who wants to change a number. Distances
   follow the athlete's units. */
export const cardioPresets=(metric:boolean):Array<{label:string;plan:Omit<PlannedCardio,'id'>}>=>{const unit=metric?'kilometers':'miles';return[
  {label:'Easy 30 min run',plan:{activity:'Run',structure:'Steady',targetSource:'Goal generated',duration:'30',distanceUnit:unit,pace:'Easy'}},
  {label:metric?'Tempo 6 km':'Tempo 4 mi',plan:{activity:'Run',structure:'Steady',targetSource:'Goal generated',distance:metric?'6':'4',distanceUnit:unit,pace:'Tempo'}},
  {label:'6 × 400 m',plan:{activity:'Run',structure:'Intervals',targetSource:'Goal generated',repeats:'6',intervalBasis:'Distance',workDistance:'400',workUnit:'meters',pace:'5K pace',rest:'90',recoveryType:'Jog',warmup:metric?'1.5 km':'1 mile',cooldown:metric?'1.5 km':'1 mile'}},
  {label:metric?'Long run 12 km':'Long run 8 mi',plan:{activity:'Run',structure:'Steady',targetSource:'Goal generated',distance:metric?'12':'8',distanceUnit:unit,pace:'Easy'}},
  {label:'Easy 45 min bike',plan:{activity:'Bike',structure:'Steady',targetSource:'Goal generated',duration:'45',distanceUnit:unit,pace:'Zone 2'}},
  {label:'20 min row',plan:{activity:'Rowing',structure:'Steady',targetSource:'Goal generated',duration:'20',distanceUnit:'meters',pace:'Steady'}},
]};

export const SPLIT_MUSCLES=['Chest','Back','Shoulders','Quads','Hamstrings','Glutes','Biceps','Triceps','Forearms','Abs'];
export type CardioPolicy='none'|'forge'|'planned';
export type DayType='strength'|'cardio'|'mixed'|'rest'|'hyrox';
export type TrainingDay={name:string;weekday:string;dayType:DayType;muscles:string[];exercises:string[];cardioPolicy:CardioPolicy;cardio:PlannedCardio[];recoveryStyle:'Full rest'|'Mobility'|'Active recovery';maxDuration:string;strengthDuration:string};
export const plannedCardioMinutes=(plan:PlannedCardio)=>{if(plan.structure==='Steady'||plan.structure==='Custom')return Math.max(0,Number(plan.duration)||0);if(plan.structure==='Intervals'){const work=/seconds?/i.test(plan.workUnit||'')?Number(plan.workDistance||0)/60:/minutes?/i.test(plan.workUnit||'')?Number(plan.workDistance||0):0;return Math.ceil(Math.max(0,Number(plan.repeats)||0)*work+Math.max(0,(Number(plan.repeats)||0)-1)*(Number(plan.rest)||0)/60)}if(plan.structure==='Circuit'){if(plan.circuitFormat==='For time'&&Number(plan.duration)>0)return Number(plan.duration);if(plan.circuitFormat==='AMRAP'||plan.circuitFormat==='EMOM')return Math.max(0,Number(plan.rounds)||0);const rounds=Math.max(0,Number(plan.rounds)||0);return Math.ceil(rounds*8+Math.max(0,rounds-1)*(Number(plan.roundRest)||0)/60)}return 0};
export const durationForDay=(day:TrainingDay,cardio=day.cardio)=>{const cardioMinutes=cardio.reduce((total,plan)=>total+plannedCardioMinutes(plan),0);if(day.dayType==='strength')return day.strengthDuration;if(day.dayType==='cardio')return cardioMinutes?String(cardioMinutes):'';if(day.dayType==='hyrox')return '';if(day.dayType==='mixed')return String((Number(day.strengthDuration)||0)+cardioMinutes);return ''};
