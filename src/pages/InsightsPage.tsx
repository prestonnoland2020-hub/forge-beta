import { InsightsClassic } from '../components/InsightsClassic';

/* Progress tab, rebuilt on the original Forge web app's insights structure. */
export function InsightsPage({embedded=false}:{embedded?:boolean}={}){
  void embedded;
  return <div className="stack-xl insights-pro"><InsightsClassic/></div>;
}
