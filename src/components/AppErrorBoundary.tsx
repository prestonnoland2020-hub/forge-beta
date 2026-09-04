import { Component, type ErrorInfo, type ReactNode } from 'react';

type Props={children:ReactNode};type State={failed:boolean};
export class AppErrorBoundary extends Component<Props,State>{
  state:State={failed:false};
  static getDerivedStateFromError(){return{failed:true}}
  componentDidCatch(error:Error,details:ErrorInfo){console.error('Forge could not render',error,details)}
  /* Recovery for a real athlete, not a developer. The old screen talked
     about "preview data" and "project files" and offered a reset that wiped
     every cached workout. Reload first; the reset is there for a genuinely
     stuck app, keeps the device look, and says exactly what it clears — the
     account's own copy on the server is untouched. */
  private resetCache=()=>{if(!window.confirm('Clear the app data cached on this device and start again? Your account and everything saved to it are untouched.'))return;Object.keys(localStorage).filter(key=>key.startsWith('forge-')&&!key.startsWith('forge-appearance')).forEach(key=>localStorage.removeItem(key));window.location.assign(`${window.location.origin}${window.location.pathname}#/`)};
  render(){if(!this.state.failed)return this.props.children;return <main className="app-recovery"><section><span>SOMETHING WENT WRONG</span><h1>Forge hit a snag on this screen.</h1><p>Your training is saved to your account. Reload to pick up where you were; if it keeps happening, clear the app data cached on this device and sign in again.</p><div><button className="button" onClick={()=>window.location.reload()}>Reload</button><button className="button ghost" onClick={this.resetCache}>Clear cached data</button></div></section></main>}
}
