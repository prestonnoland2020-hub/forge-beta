import { FACETS, TRACE } from './ForgeStrikeMark';

/* EVERY WAIT IS JUST THE F. The launch animation in index.html ends on exactly
   this — the bare mark, no tile, centred — so when the app hands over to a
   loading screen nothing moves. The label is for screen readers; on screen the
   mark says it. Keep the two in step: sizes and colours live in brand.css
   (.forge-loader) and in the #forge-boot block in index.html. */
export function ForgeLoader({ label }: { label: string }) {
  return (
    <main className="forge-loader" role="status" aria-live="polite">
      <svg viewBox="0 0 732 620" aria-hidden="true">
        {FACETS.map(({ part, d }) => (
          <g key={part} className={`forge-loader-${part}`}>
            <g transform={TRACE}><path d={d} /></g>
          </g>
        ))}
      </svg>
      <span className="sr-only">{label}</span>
    </main>
  );
}
