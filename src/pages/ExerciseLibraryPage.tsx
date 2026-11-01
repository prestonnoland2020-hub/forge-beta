import { ExerciseLibrary } from '../components/ExerciseLibrary';
import { WorkoutLibrary } from '../components/WorkoutLibrary';

export function ExerciseLibraryPage(){
  return <div className="stack-xl"><ExerciseLibrary/><WorkoutLibrary/></div>;
}
