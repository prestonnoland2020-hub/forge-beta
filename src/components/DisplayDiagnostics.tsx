import { useEffect, useState } from 'react';
import { measuredInsets, isStandalone } from '../lib/homeIndicatorFallback';

/* WHY THIS EXISTS.

   The bottom bar sat off the bottom of Preston's screen through four rounds of
   fixes, and each round was a different cause. The last two rounds were not
   fixes at all, they were guesses: first that the app would report itself as
   standalone (it does not), then that a phone with a home-indicator strip
   would at least report a top inset (unproven). Both were inferred from a
   screenshot, both shipped, neither worked.

   The numbers exist on his device and nowhere else. This puts them on the
   screen so they can be read out once, instead of another round of shipping a
   guess and waiting to be told it is still wrong. It is six numbers and no
   interpretation — the interpretation is the thing that has been wrong. */
export function DisplayDiagnostics() {
  const [readout, setReadout] = useState<Array<[string, string]>>([]);

  useEffect(() => {
    const read = () => {
      const viewport = window.visualViewport;
      const insets = measuredInsets(document);
      const mode = ['standalone', 'fullscreen', 'minimal-ui', 'browser']
        .find(candidate => window.matchMedia?.(`(display-mode: ${candidate})`).matches) || 'unknown';
      setReadout([
        ['safe-area top / bottom', `${round(insets.top)} / ${round(insets.bottom)}`],
        ['window inner height', String(window.innerHeight)],
        ['layout viewport height', String(document.documentElement.clientHeight)],
        ['visual viewport height', viewport ? round(viewport.height) : 'unsupported'],
        ['visual scale / offset', viewport ? `${round(viewport.scale, 3)} / ${round(viewport.offsetTop)}` : '—'],
        ['screen height', String(window.screen?.height ?? 0)],
        ['display mode', `${mode}${isStandalone() ? ' · standalone flag set' : ''}`],
        ['bar lift in use', getComputedStyle(document.documentElement).getPropertyValue('--safe-b-fallback').trim() || 'none (12px floor)'],
      ]);
    };
    read();
    const viewport = window.visualViewport;
    viewport?.addEventListener('resize', read);
    window.addEventListener('orientationchange', read);
    return () => {
      viewport?.removeEventListener('resize', read);
      window.removeEventListener('orientationchange', read);
    };
  }, []);

  return <section className="card form-card display-diagnostics">
    <div className="section-title compact-title"><div>
      <h3>Display report</h3>
      <p>What this device tells Forge about its own screen. Read these out if the tab bar is sitting wrong.</p>
    </div></div>
    <dl>
      {readout.map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}
    </dl>
  </section>;
}

const round = (value: number, places = 1) => String(Math.round(value * 10 ** places) / 10 ** places);
