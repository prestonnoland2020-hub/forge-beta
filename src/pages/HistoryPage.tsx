import { useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { PageIntro } from '../components/AppShell';
import { useWorkoutHistory, type WorkoutRecord } from '../features/training/WorkoutHistoryProvider';
import { useProfileSetup } from '../features/profile/ProfileSetupProvider';
import { cardioMiles, formatCardioSummary } from '../lib/cardioSession';

const formatDate=(date:string)=>new Date(`${date}T12:00:00`).toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'});
const months=['January','February','March','April','May','June','July','August','September','October','November','December'];
const iso=(year:number,month:number,day:number)=>`${year}-${String(month+1).padStart(2,'0')}-${String(day).padStart(2,'0')}`;
const nonStrengthMuscles=new Set(['cardio','none','rest','n/a','na']);
const strengthMuscles=(record:WorkoutRecord)=>record.muscles.filter(muscle=>{const normalized=muscle.trim().toLowerCase();return normalized&&!nonStrengthMuscles.has(normalized)});

export function HistoryPage({embedded=false}:{embedded?:boolean}={}){
  const {records}=useWorkoutHistory();const {setup}=useProfileSetup();const weightUnit=setup?.units==='Metric'?'kg':'lb';const now=new Date();
  const recordTopSets=(record:WorkoutRecord)=>record.topSets?.length?record.topSets.filter(set=>set.completed!==false):(record.lift&&record.weight&&record.reps?[{muscle:record.muscles[0]||'Primary',lift:record.lift,weight:record.weight,reps:record.reps,calculatedMax:record.calculatedMax}]:[]);
  const hasStrength=(record:WorkoutRecord)=>strengthMuscles(record).length>0||recordTopSets(record).length>0;
  const hasCardio=(record:WorkoutRecord)=>(record.cardioSessions||[]).length>0;
  const hasTraining=(record:WorkoutRecord)=>hasStrength(record)||hasCardio(record);
  const trainingRecords=records.filter(hasTraining);
  const [selectedId,setSelectedId]=useState(trainingRecords[0]?.id??'');const [selectedDate,setSelectedDate]=useState(trainingRecords[0]?.date??iso(now.getFullYear(),now.getMonth(),now.getDate()));const [query,setQuery]=useState('');const [cursor,setCursor]=useState(new Date(now.getFullYear(),now.getMonth(),1));const selected=records.find(record=>record.id===selectedId&&record.date===selectedDate);const year=cursor.getFullYear(),month=cursor.getMonth(),days=new Date(year,month+1,0).getDate(),leading=(new Date(year,month,1).getDay()+6)%7;
  const activeDateKinds=trainingRecords.reduce((map,record)=>{const current=map.get(record.date)||{strength:false,cardio:false};map.set(record.date,{strength:current.strength||hasStrength(record),cardio:current.cardio||hasCardio(record)});return map},new Map<string,{strength:boolean;cardio:boolean}>());
  const cursorMonthPrefix=`${year}-${String(month+1).padStart(2,'0')}`;const monthRecords=records.filter(record=>record.date.startsWith(cursorMonthPrefix));
  const shownRecords=useMemo(()=>{const term=query.trim().toLowerCase();return term?trainingRecords.filter(record=>`${record.date} ${record.title} ${record.lift??''} ${(record.topSets||[]).map(set=>`${set.muscle} ${set.lift}`).join(' ')} ${record.muscles.join(' ')} ${(record.cardioSessions||[]).map(formatCardioSummary).join(' ')}`.toLowerCase().includes(term)):trainingRecords},[query,trainingRecords]);
  const cardioSummary=(record:WorkoutRecord)=>record.cardioSessions?.length?record.cardioSessions.map(formatCardioSummary).join(' · '):'—';
  /* The log used to be one flat run of every session, paged twelve at a time.
     Grouped by month, only the newest month is expanded on arrival and the
     rest collapse to a one-line header, so five years of history is something
     you scan rather than scroll. A closed month renders no rows at all. */
  const logGroups=useMemo(()=>{
    const groups=new Map<string,WorkoutRecord[]>();
    shownRecords.forEach(record=>{const key=record.date.slice(0,7);const list=groups.get(key);list?list.push(record):groups.set(key,[record])});
    return [...groups.entries()].map(([key,items])=>({key,items,
      label:`${months[Number(key.slice(5,7))-1]} ${key.slice(0,4)}`,
      miles:items.reduce((total,record)=>total+(record.cardioSessions||[]).reduce((sum,session)=>sum+cardioMiles(session),0),0)}));
  },[shownRecords]);
  /* Preston's call: EVERY month arrives collapsed, the newest included — the
     log opens as a table of contents, one tap deep. Searching still opens
     everything, since a hit inside a collapsed month reads as no result. */
  const [openMonths,setOpenMonths]=useState<string[]>([]);
  const searching=Boolean(query.trim());
  const isMonthOpen=(key:string)=>searching||openMonths.includes(key);
  const toggleMonth=(key:string)=>setOpenMonths(current=>current.includes(key)?current.filter(item=>item!==key):[...current,key]);
  const monthStrengthDays=new Set(monthRecords.filter(hasStrength).map(record=>record.date)).size;const monthCardioDays=new Set(monthRecords.filter(hasCardio).map(record=>record.date)).size;const monthMiles=monthRecords.reduce((total,record)=>total+(record.cardioSessions||[]).reduce((sum,session)=>sum+cardioMiles(session),0),0);const monthWeights=monthRecords.map(record=>record.bodyWeight).filter((value):value is number=>typeof value==='number'&&value>0);const monthAverageWeight=monthWeights.length?monthWeights.reduce((sum,value)=>sum+value,0)/monthWeights.length:null;
  /* Today is always marked, whether or not it is the day being previewed and
     whether or not anything is logged on it — a calendar that only ever
     highlights the selection loses the reader's place in the month. */
  const todayIso=iso(now.getFullYear(),now.getMonth(),now.getDate());
  const calendarTouchStart=useRef<number|null>(null);
  const streaks=useMemo(()=>{const activeDays=[...new Set(trainingRecords.map(record=>record.date))].sort();if(!activeDays.length)return{current:0,best:0};const dayNumber=(date:string)=>Math.floor(new Date(`${date}T12:00:00`).getTime()/86400000);let best=1,run=1;for(let index=1;index<activeDays.length;index+=1){run=dayNumber(activeDays[index])-dayNumber(activeDays[index-1])===1?run+1:1;best=Math.max(best,run)}let current=1;for(let index=activeDays.length-1;index>0;index-=1){if(dayNumber(activeDays[index])-dayNumber(activeDays[index-1])!==1)break;current+=1}const latestGap=dayNumber(iso(now.getFullYear(),now.getMonth(),now.getDate()))-dayNumber(activeDays[activeDays.length-1]);return{current:latestGap<=1?current:0,best}},[trainingRecords,now]);
  const selectRecord=(record:WorkoutRecord)=>{setSelectedId(record.id);setSelectedDate(record.date);const date=new Date(`${record.date}T12:00:00`);setCursor(new Date(date.getFullYear(),date.getMonth(),1))};const selectDate=(date:string)=>{setSelectedDate(date);const record=trainingRecords.find(item=>item.date===date);setSelectedId(record?.id||'')};const selectedHasTraining=selected?hasTraining(selected):false;const shiftMonth=(change:number)=>setCursor(new Date(year,month+change,1));

  return <div className="stack-xl history-page">
    {!embedded&&<PageIntro eyebrow="TRAINING HISTORY" title="Every completed workout" copy="Pick a day on the calendar, or search your log below."/>}
    {records.length?<>
      <section className="classic-streak"><span className="section-title">ACTIVITY STREAK</span><div><article><strong>{streaks.current}</strong><span>Day streak</span></article><article><strong>{streaks.best}</strong><span>Best streak</span></article></div></section>
      <section className="card history-calendar restored-calendar classic-calendar" onTouchStart={event=>{calendarTouchStart.current=event.touches[0]?.clientX??null}} onTouchEnd={event=>{if(calendarTouchStart.current===null)return;const distance=(event.changedTouches[0]?.clientX??calendarTouchStart.current)-calendarTouchStart.current;calendarTouchStart.current=null;if(Math.abs(distance)>55)shiftMonth(distance<0?1:-1)}}><div className="history-toolbar"><button onClick={()=>shiftMonth(-1)} aria-label="Previous month">‹</button><div><span className="eyebrow">CALENDAR</span><h3>{months[month]} {year}</h3><small>Tap a day · swipe to change month</small></div><button onClick={()=>shiftMonth(1)} aria-label="Next month">›</button></div><div className="history-summary calendar-kpis"><div><strong>{monthMiles.toFixed(1)}</strong><span>Miles</span></div><div><strong>{monthStrengthDays}</strong><span>Lifts</span></div><div><strong>{monthCardioDays}</strong><span>Cardio</span></div><div><strong>{monthAverageWeight===null?'—':monthAverageWeight.toFixed(1)}</strong><span>Avg Wt</span></div></div><div className="weekday-row">{['MO','TU','WE','TH','FR','SA','SU'].map(day=><span key={day}>{day}</span>)}</div><div className="calendar-grid">{Array.from({length:leading}).map((_,index)=><i key={`empty-${index}`}/>)}{Array.from({length:days},(_,index)=>index+1).map(day=>{const date=iso(year,month,day);const activity=activeDateKinds.get(date);const trained=Boolean(activity);const isToday=date===todayIso;return <button key={date} className={`${trained?'trained ':''}${isToday?'is-today ':''}${selectedDate===date?'selected':''}`} onClick={()=>selectDate(date)} aria-label={`${formatDate(date)}${isToday?' — today':''}${trained?' — preview training day':' — preview empty day'}`} aria-current={isToday?'date':undefined}><span>{day}</span>{activity&&<span className="calendar-markers">{activity.strength&&<i className="strength"/>}{activity.cardio&&<i className="cardio"/>}</span>}</button>})}</div><div className="calendar-legend"><span><i className="strength"/>Lift</span><span><i className="cardio"/>Cardio</span></div></section>
      <section className="card simple-day-preview compact-day-preview"><header><div><span className="eyebrow">SELECTED DAY</span><h2>{formatDate(selectedDate)}</h2></div><Link className="button" to={selectedHasTraining&&selected?`/workout?edit=${selected.id}`:`/workout?date=${selectedDate}`}>{selectedHasTraining?'Edit day':'Add training'}</Link></header>{selectedHasTraining&&selected?<><p>{strengthMuscles(selected).join(' · ')||(hasCardio(selected)?'Cardio day':'')}</p>{selected.recommendationId&&<small className="recommendation-lineage">Completed from Forge recommendation · split position {selected.splitPosition||'—'}</small>}<div className="simple-preview-results">{recordTopSets(selected).map((set,index)=><div key={`${set.lift}-${index}`}><strong>{set.lift}</strong><span>{set.weight} {weightUnit} ×{set.reps}</span></div>)}{recordTopSets(selected).length===0&&strengthMuscles(selected).length>0&&<div><strong>Strength workout</strong><span>{strengthMuscles(selected).join(' · ')} · no historical top set recorded</span></div>}{(selected.cardioSessions||[]).map(session=><div key={session.id}><strong>{session.activity}</strong><span>{formatCardioSummary(session)}</span></div>)}</div>{selected.notes&&<aside className="selected-day-notes"><span className="eyebrow">NOTES</span><p>{selected.notes}</p></aside>}</>:<p>No training is logged for this date.</p>}</section>
      <section className="card history-log-card">
        <header>
          <div><span className="eyebrow">ALL WORKOUTS</span><h3>Your log</h3></div>
          <small>{query?`${shownRecords.length} of ${trainingRecords.length}`:`${trainingRecords.length} sessions`}</small>
        </header>
        <label className="history-log-search"><span className="field-caption">SEARCH</span><input type="search" value={query} onChange={event=>setQuery(event.target.value)} placeholder="Exercise, muscle, cardio, or date"/></label>
        <div className="history-log-months">
          {logGroups.map(group=>{const open=isMonthOpen(group.key);return <section className={`history-log-month${open?' open':''}`} key={group.key}>
            <button type="button" className="history-month-toggle" onClick={()=>toggleMonth(group.key)} aria-expanded={open}>
              <span className="history-month-name">{group.label}</span>
              <span className="history-month-meta">{group.items.length} session{group.items.length===1?'':'s'}{group.miles>=0.1?` · ${group.miles.toFixed(1)} mi`:''}</span>
              <b aria-hidden="true">{open?'−':'+'}</b>
            </button>
            {open&&<div className="history-log-list">
              {group.items.map(record=><button type="button" className={selected?.id===record.id?'selected':''} onClick={()=>selectRecord(record)} key={record.id}>
                <span className="history-log-when"><strong>{formatDate(record.date)}</strong><small>{strengthMuscles(record).join(' · ')||'Cardio'}</small></span>
                <span className="history-log-what">{recordTopSets(record).length?<b>{recordTopSets(record)[0].lift} · {recordTopSets(record)[0].weight} {weightUnit} ×{recordTopSets(record)[0].reps}</b>:null}{hasCardio(record)&&<em>{cardioSummary(record)}</em>}</span>
              </button>)}
            </div>}
          </section>})}
          {!shownRecords.length&&<p className="history-log-empty">No workouts match that search.</p>}
        </div>
      </section>
    </>:<section className="card history-first-empty"><strong>Your history starts with your first completed workout.</strong><span>Nothing is prefilled or estimated here—only saved results appear.</span><Link className="button" to="/workout?source=blank">Log a workout →</Link></section>}
  </div>;
}
