import { useMemo,useState } from 'react';
import { GoalBuilder } from '../components/GoalBuilder';
import { useGoals } from '../features/goals/GoalsProvider';
import { buildGoalRoadmaps } from '../lib/goalPlanEngine';
import { GoalProgressCard } from '../components/GoalProgressCard';
import { formatGoalTarget } from '../lib/time';

export function GoalsPage({embedded=false}:{embedded?:boolean}={}){
  const {goals,saveGoal}=useGoals();const roadmaps=useMemo(()=>buildGoalRoadmaps(goals),[goals]);const [open,setOpen]=useState(false);const [editing,setEditing]=useState<number|null>(null);/* Every goal's full read-out — the four stat tiles, the derivation, the Forge
   assessment — used to be open on the first goal the moment the page loaded,
   and there was no way to shut it again. With seven goals that buried the list
   they belong to. Nothing is expanded on arrival now, and tapping an open goal
   closes it. */
const [selected,setSelected]=useState<number|null>(null);const activeIndex=selected===null?null:Math.min(selected,Math.max(0,goals.length-1));const toggleGoal=(index:number)=>setSelected(current=>current===index?null:index);const openBuilder=(index:number|null=null)=>{setEditing(index);setOpen(true)};
  return <div className="stack-xl goals-workspace goals-single-page">
    {open&&<GoalBuilder initialGoal={editing===null?undefined:goals[editing]} onClose={()=>setOpen(false)} onSave={goal=>{saveGoal(goal,editing);setOpen(false);setEditing(null);if(editing===null)setSelected(goals.length)}}/>}
    <section className="card compact-goal-list"><header><div><span className="eyebrow">ACTIVE GOALS</span><h2>{goals.length?`${goals.length} ${goals.length===1?'goal':'goals'}`:'No goals yet'}</h2></div>{goals.length?<button className="button secondary small-button" onClick={()=>openBuilder()}>＋ New</button>:null}</header>{goals.length?<div className="compact-goal-table slim"><div className="goal-table-head" aria-hidden="true"><span>Goal</span><span>Target</span><span>Due</span><span/></div>{goals.map((goal,index)=><div className={index===activeIndex?'compact-goal-row active':'compact-goal-row'} key={`${goal.title}-${index}`}><button className="compact-goal-select" onClick={()=>toggleGoal(index)} aria-pressed={index===activeIndex} aria-expanded={index===activeIndex}><span className="goal-row-name"><b className={`goal-type-tag ${goal.type.toLowerCase()}`}>{goal.type==='Strength'?'STR':goal.type==='Endurance'?'END':'BODY'}</b><strong>{goal.title}</strong></span><strong className="goal-row-target">{formatGoalTarget(goal.target,goal.metric,goal.unit)}</strong><small className="goal-row-due">{new Date(`${goal.date}T12:00:00`).toLocaleDateString('en-US',{month:'short',year:'2-digit'}).replace(' ',' ’')}</small></button><button className="compact-goal-edit" onClick={()=>openBuilder(index)} aria-label={`Edit ${goal.title}`}>Edit</button>{index===activeIndex&&roadmaps[index]&&<div className="goal-row-detail"><GoalProgressCard goal={goal} roadmap={roadmaps[index]}/></div>}</div>)}</div>:<div className="compact-goal-empty"><p>Create one clear strength, endurance, or body-composition target.</p><button className="button" onClick={()=>openBuilder()}>Create your first goal</button></div>}</section>
  </div>;
}
