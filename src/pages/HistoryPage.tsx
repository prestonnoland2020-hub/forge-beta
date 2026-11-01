import { useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { PageIntro } from '../components/AppShell';
import { useWorkoutHistory, type WorkoutRecord } from '../features/training/WorkoutHistoryProvider';
import { useProfileSetup } from '../features/profile/ProfileSetupProvider';
import { cardioMiles, formatCardioSummary } from '../lib/cardioSession';
import { Icon } from '../components/Icon';

const formatDate=(date:string)=>new Date(`${date}T12:00:00`).toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'});
const months=['January','February','March','April','May','June','July','August','September','October','November','December'];
const iso=(year:number,month:number,day:number)=>`${year}-${String(month+1).padStart(2,'0')}-${String(day).padStart(2,'0')}`;
const nonStrengthMuscles=new Set(['cardio','none','rest','n/a','na']);
const strengthMuscles=(record:WorkoutRecord)=>record.muscles.filter(muscle=>{const normalized=muscle.trim().toLowerCase();return normalized&&!nonStrengthMuscles.has(normalized)});

/* "1 h 12 min", "48 min": how long the session took, as the watch timed it. */
const sessionLength=(minutes:number)=>{const total=Math.round(minutes);return total>=60?`${Math.floor(total/60)} h ${total%60} min`:`${total} min`};

export function HistoryPage({embedded=false}:{embedded?:boolean}={}){
  const {records}=useWorkoutHistory();const {setup}=useProfileSetup();const weightUnit=setup?.units==='Metric'?'kg':'lb';const now=new Date();
  const recordTopSets=(record:WorkoutRecord)=>record.topSets?.length?record.topSets.filter(set=>set.completed!==false):(record.lift&&record.weight&&record.reps?[{muscle:record.muscles[0]||'Primary',lift:record.lift,weight:record.weight,reps:record.reps,calculatedMax:record.calculatedMax}]:[]);
  const hasStrength=(record:WorkoutRecord)=>strengthMuscles(record).length>0||recordTopSets(record).length>0;
  const hasCardio=(record:WorkoutRecord)=>(record.cardioSessions||[]).length>0;
  const hasTraining=(record:WorkoutRecord)=>hasStrength(record)||hasCardio(record);
  const trainingRecords=records.filter(hasTraining);
  /* HISTORY OPENS ON TODAY. It opened on the most recent training day, so the
     morning after a session it read "Oct 31" on Nov 1 and looked a day behind.
     Today is selected; the last session is a dot on the grid, one tap away. */
  const openOn=iso(now.getFullYear(),now.getMonth(),now.getDate());
  const [selectedId,setSelectedId]=useState(trainingRecords.find(record=>record.date===openOn)?.id??'');const [selectedDate,setSelectedDate]=useState(openOn);/* THE MONTH ON SCREEN AND THE DAY UNDER IT HAVE TO AGREE. The calendar
     opened on the current month while the card beneath it read out the most
     recent training day — so an athlete who last trained in August landed on
     an empty September grid, 0.0 miles, 0 lifts, above a card describing
     Aug 23. The selection is the one source: the grid opens on its month. */
  const [cursor,setCursor]=useState(()=>new Date(now.getFullYear(),now.getMonth(),1));const selected=records.find(record=>record.id===selectedId&&record.date===selectedDate);const year=cursor.getFullYear(),month=cursor.getMonth(),days=new Date(year,month+1,0).getDate(),leading=(new Date(year,month,1).getDay()+6)%7;
  const activeDateKinds=trainingRecords.reduce((map,record)=>{const current=map.get(record.date)||{strength:false,cardio:false};map.set(record.date,{strength:current.strength||hasStrength(record),cardio:current.cardio||hasCardio(record)});return map},new Map<string,{strength:boolean;cardio:boolean}>());
  const cursorMonthPrefix=`${year}-${String(month+1).padStart(2,'0')}`;const monthRecords=records.filter(record=>record.date.startsWith(cursorMonthPrefix));
  const monthStrengthDays=new Set(monthRecords.filter(hasStrength).map(record=>record.date)).size;const monthCardioDays=new Set(monthRecords.filter(hasCardio).map(record=>record.date)).size;const monthMiles=monthRecords.reduce((total,record)=>total+(record.cardioSessions||[]).reduce((sum,session)=>sum+cardioMiles(session),0),0);const monthWeights=monthRecords.map(record=>record.bodyWeight).filter((value):value is number=>typeof value==='number'&&value>0);const monthAverageWeight=monthWeights.length?monthWeights.reduce((sum,value)=>sum+value,0)/monthWeights.length:null;
  /* Today is always marked, whether or not it is the day being previewed and
     whether or not anything is logged on it — a calendar that only ever
     highlights the selection loses the reader's place in the month. */
  const todayIso=iso(now.getFullYear(),now.getMonth(),now.getDate());
  const calendarTouchStart=useRef<number|null>(null);
  /* CUSTOM DAYS THAT LOST THEIR MUSCLES. Before the cardio-first fix, a
     custom day with a run on it saved only "Cardio" and dropped the muscles
     ticked — and no copy was kept anywhere to restore them from. These are
     the days that look like it: a custom workout, not on the split, with
     cardio and no strength at all. Each is one tap from its edit screen,
     where the chips are back. A day that really was only a run can be set
     aside, and is not asked about again on this device. */
  const [setAside,setSetAside]=useState<string[]>(()=>{try{return JSON.parse(localStorage.getItem('forge-muscle-review-skip')||'[]')}catch{return[]}});
  const missingMuscles=records.filter(record=>!record.splitPosition&&/custom workout/i.test(record.title||'')&&hasCardio(record)&&!hasStrength(record)&&!setAside.includes(record.id)).sort((a,b)=>b.date.localeCompare(a.date));
  const skipDay=(id:string)=>setSetAside(current=>{const next=[...current,id];try{localStorage.setItem('forge-muscle-review-skip',JSON.stringify(next))}catch{/* per-device */}return next});

  const selectDate=(date:string)=>{setSelectedDate(date);const record=trainingRecords.find(item=>item.date===date);setSelectedId(record?.id||'')};const selectedHasTraining=selected?hasTraining(selected):false;const shiftMonth=(change:number)=>setCursor(new Date(year,month+change,1));

  return <div className="stack-xl history-page">
    {/* THE SAME INSTRUCTION, TWICE. "Tap a day to see it — or to add and edit
        what you did" sat above the calendar, and "Tap a day · swipe to change
        month" sat inside it. One of them had to go, and the one that goes is
        the one further from the thing it describes. */}
    {missingMuscles.length>0&&<section className="card muscle-review"><header><span className="eyebrow">ADD WHAT YOU TRAINED</span><h3>{missingMuscles.length===1?'1 custom day has no muscles on it':`${missingMuscles.length} custom days have no muscles on them`}</h3><p>Tick the muscles once and they count as strength here and in muscle frequency.</p></header><ul>{missingMuscles.slice(0,6).map(record=><li key={record.id}><Link to={`/workout?edit=${record.id}`}><strong>{formatDate(record.date)}</strong><span>{(record.cardioSessions||[]).map(session=>session.activity).join(' · ')||'Custom workout'}</span><b>Add muscles</b></Link><button type="button" onClick={()=>skipDay(record.id)} aria-label={`${formatDate(record.date)} was only cardio`}>Only cardio</button></li>)}</ul></section>}
    {records.length?<>
      <section className="card history-calendar restored-calendar classic-calendar" onTouchStart={event=>{calendarTouchStart.current=event.touches[0]?.clientX??null}} onTouchEnd={event=>{if(calendarTouchStart.current===null)return;const distance=(event.changedTouches[0]?.clientX??calendarTouchStart.current)-calendarTouchStart.current;calendarTouchStart.current=null;if(Math.abs(distance)>55)shiftMonth(distance<0?1:-1)}}><div className="history-toolbar"><button onClick={()=>shiftMonth(-1)} aria-label="Previous month" className="month-step"><Icon name="left" size={20} stroke={2.4} /></button><div><h3>{months[month]} {year}</h3><small>Tap a day · swipe to change month</small></div><button onClick={()=>shiftMonth(1)} aria-label="Next month" className="month-step"><Icon name="right" size={20} stroke={2.4} /></button></div><div className="history-summary calendar-kpis"><div><strong>{monthMiles.toFixed(1)}</strong><span>Miles</span></div><div><strong>{monthStrengthDays}</strong><span>Lifts</span></div><div><strong>{monthCardioDays}</strong><span>Cardio</span></div><div><strong>{monthAverageWeight===null?'—':monthAverageWeight.toFixed(1)}</strong><span>Avg {weightUnit}</span></div></div><div className="weekday-row">{['MO','TU','WE','TH','FR','SA','SU'].map(day=><span key={day}>{day}</span>)}</div><div className="calendar-grid">{Array.from({length:leading}).map((_,index)=><i key={`empty-${index}`}/>)}{Array.from({length:days},(_,index)=>index+1).map(day=>{const date=iso(year,month,day);const activity=activeDateKinds.get(date);const trained=Boolean(activity);const isToday=date===todayIso;return <button key={date} className={`${trained?'trained ':''}${isToday?'is-today ':''}${selectedDate===date?'selected':''}`} onClick={()=>selectDate(date)} aria-label={`${formatDate(date)}${isToday?' — today':''}${trained?' — preview training day':' — preview empty day'}`} aria-current={isToday?'date':undefined}><span>{day}</span>{activity&&<span className="calendar-markers">{activity.strength&&<i className="strength"/>}{activity.cardio&&<i className="cardio"/>}</span>}</button>})}</div><div className="calendar-legend"><span><i className="strength"/>Lift</span><span><i className="cardio"/>Cardio</span></div></section>
      <section className="card simple-day-preview compact-day-preview"><header><div><span className="eyebrow">SELECTED DAY</span><h2>{formatDate(selectedDate)}</h2></div><Link className="button" to={selectedHasTraining&&selected?`/workout?edit=${selected.id}`:`/workout?date=${selectedDate}`}>{selectedHasTraining?'Edit day':'Add training'}</Link></header>{selectedHasTraining&&selected?<><p>{[strengthMuscles(selected).join(' · ')||(hasCardio(selected)?'Cardio day':''),selected.durationMinutes?sessionLength(selected.durationMinutes):''].filter(Boolean).join(' · ')}</p>{/* "Completed from Forge recommendation · split position 7" is how the
                record is stored, not what happened. What happened is that Forge
                asked for this day and the athlete did it. The position is a
                cursor into the split — useful in a bug report, meaningless on a
                Tuesday. */}
            {selected.recommendationId&&<small className="recommendation-lineage">Forge planned this day</small>}<div className="simple-preview-results">{recordTopSets(selected).map((set,index)=><div key={`${set.lift}-${index}`}><strong>{set.lift}</strong><span>{set.weight} {weightUnit} ×{set.reps}</span></div>)}{recordTopSets(selected).length===0&&strengthMuscles(selected).length>0&&<div><strong>Strength workout</strong><span>{strengthMuscles(selected).join(' · ')} · no historical top set recorded</span></div>}{(selected.cardioSessions||[]).map(session=><div key={session.id}><strong>{session.activity}</strong><span>{formatCardioSummary(session)}{session.recorded?.averageHr?` · ${session.recorded.averageHr} bpm avg`:''}</span></div>)}</div>{selected.notes&&<aside className="selected-day-notes"><span className="eyebrow">NOTES</span><p>{selected.notes}</p></aside>}</>:<p>No training is logged for this date.</p>}</section>
    </>:<section className="card history-first-empty"><strong>No workouts yet</strong><span>Every workout you finish shows up here.</span><Link className="button" to="/workout?source=blank">Log a workout <Icon name="arrow"/></Link></section>}
  </div>;
}
