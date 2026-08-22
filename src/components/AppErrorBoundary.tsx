import { Component, type ErrorInfo, type ReactNode } from 'react';

type Props={children:ReactNode};type State={failed:boolean};
export class AppErrorBoundary extends Component<Props,State>{
  state:State={failed:false};
  static getDerivedStateFromError(){return{failed:true}}
  componentDidCatch(error:Error,details:ErrorInfo){console.error('Forge could not render',error,details)}
  private resetPreview=()=>{if(!window.confirm('Reset the saved Forge data in this browser preview? This affects only this browser, but removes its locally saved workouts, goals, and setup.'))return;Object.keys(localStorage).filter(key=>key.startsWith('forge-')).forEach(key=>localStorage.removeItem(key));window.location.assign(`${window.location.origin}${window.location.pathname}#/onboarding`)};
  render(){if(!this.state.failed)return this.props.children;return <main className="app-recovery"><section><span>FORGE PREVIEW RECOVERY</span><h1>This browser has incompatible saved preview data.</h1><p>Your project files are safe. Reload first. If this embedded preview remains stuck, reset only its locally saved preview data.</p><div><button className="button" onClick={()=>window.location.reload()}>Reload preview</button><button className="button ghost" onClick={this.resetPreview}>Reset this preview</button></div></section></main>}
}
