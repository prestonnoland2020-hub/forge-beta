import { useSearchParams } from 'react-router-dom';
import { ExerciseLibrary } from '../components/ExerciseLibrary';
import { WorkoutLibrary } from '../components/WorkoutLibrary';

export type LibraryTab = 'lifts' | 'cardio' | 'circuits';
const TABS: Array<[LibraryTab, string]> = [['lifts', 'Lifts'], ['cardio', 'Cardio'], ['circuits', 'Circuits']];

/* CONTROLS ON TOP. Lifts, cardio and saved circuits are three tabs at the
   head of the page, so circuits are one tap away instead of under the whole
   exercise list. The tab lives in the URL (?tab=), and the coach's "See it in
   Saved circuits" link (?show=circuits) opens straight onto Circuits. */
export function ExerciseLibraryPage() {
  const [params, setParams] = useSearchParams();
  const asked = params.get('tab');
  const tab: LibraryTab = asked === 'cardio' || asked === 'circuits' || asked === 'lifts' ? asked : params.get('show') === 'circuits' ? 'circuits' : 'lifts';
  const choose = (next: LibraryTab) => {
    const copy = new URLSearchParams(params);
    copy.set('tab', next); copy.delete('show'); copy.delete('circuit');
    setParams(copy, { replace: true });
  };
  return <div className="stack-xl">
    <div className="lib-tabs" role="tablist" aria-label="Library">
      {TABS.map(([key, label]) => <button key={key} type="button" role="tab" aria-selected={tab === key} className={tab === key ? 'active' : ''} onClick={() => choose(key)}>{label}</button>)}
    </div>
    {tab === 'circuits' ? <WorkoutLibrary /> : <ExerciseLibrary tab={tab} />}
  </div>;
}
