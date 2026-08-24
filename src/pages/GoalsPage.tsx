import { useMemo,useState } from 'react';
import { PageIntro } from '../components/AppShell';
import { GoalBuilder } from '../components/GoalBuilder';
import { useGoals } from '../features/goals/GoalsProvider';
import { buildGoalRoadmaps } from '../lib/goalPlanEngine';
import { GoalProgressCard } from '../components/GoalProgressCard';
import { formatGoalTarget } from '../lib/time';

export function GoalsPage({embedded=false}:{embedded?:boolean}={}){
  const {goals,saveGoal}=useGoals();const roadmaps=useMemo(()=>buildGoalRoadmaps(goals),[goals]);const [open,setOpen]=useState(false);const [editing,setEditing]=useState<number|null>(null);const [selected,setSelected]=useState(0);const activeIndex=Math.min(selected,Math.max(0,goals.length-1));const openBuilder=(index:number|null=null)=>{setEditing(index);setOpen(true)};
  return <div className="stack-xl goals-workspace goals-single-page">{!embedded&&<PageIntro eyebrow="TRAINING OUTCOMES" title="What you're training toward" copy="Set the outcome, then track the simplest useful estimate from completed work."/>}
    {open&&<GoalBuilder initialGoal={editing===null?undefined:goals[editing]} onClose={()=>setOpen(false)} onSave={goal=>{saveGoal(goal,editing);setOpen(false);setEditing(null);if(editing===null)setSelected(goals.length)}}/>}
    <section className="card compact-goal-list"><header><div><span className="eyebrow">ACTIVE GOALS</span><h2>{goals.length?`${goals.length} ${goals.length===1?'goal':'goals'}`:'No goals yet'}</h2></div>{goals.length?<button className="button secondary small-button" onClick={()=>openBuilder()}>＋ New</button>:null}</header>{goals.length?<div className="compact-goal-table slim"><div className="goal-table-head" aria-hidden="true"><span>Goal</span><span>Target</span><span>Due</span><span/></div>{goals.map((goal,index)=><div className={index===activeIndex?'compact-goal-row active':'compact-goal-row'} key={`${goal.title}-${index}`}><button className="compact-goal-select" onClick={()=>setSelected(index)} aria-pressed={index===activeIndex}><span className="goal-row-name"><b className={`goal-type-tag ${goal.type.toLowerCase()}`}>{goal.type==='Strength'?'STR':goal.type==='Endurance'?'END':'BODY'}</b><strong>{goal.title}</strong></span><strong className="goal-row-target">{formatGoalTarget(goal.target,goal.metric,goal.unit)}</strong><small className="goal-row-due">{new Date(`${goal.date}T12:00:00`).toLocaleDateString('en-US',{month:'short',year:'2-digit'}).replace(' ',' ’')}</small></button><button className="compact-goal-edit" onClick={()=>openBuilder(index)} aria-label={`Edit ${goal.title}`}>Edit</button></div>)}</div>:<div className="compact-goal-empty"><p>Create one clear strength, endurance, or body-composition target.</p><button className="button" onClick={()=>openBuilder()}>Create your first goal</button></div>}</section>
    {goals.length&&roadmaps.length?<section className="goal-selected-tracker"><GoalProgressCard goal={goals[activeIndex]} roadmap={roadmaps[activeIndex]}/></section>:null}
  </div>;
}
