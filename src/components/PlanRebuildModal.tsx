import { useEffect, useRef, useState } from 'react';

/* A REBUILD IS A CONVERSATION, NOT A CONFIRMATION.

   The button used to say "Generate plan" beside a block that already existed,
   and pressing it asked one question — are you sure — with one honest answer:
   yes, throw this away and roll the dice again. An athlete who wanted the same
   block with less Saturday running had no way to say so; they regenerated and
   hoped, and if the new block was worse they regenerated again.

   So the button says REGENERATE, because that is what it does, and pressing it
   opens the same kind of AI box the log has: say what should be different, in
   your own words. Two ways out of it, because there are exactly two things an
   athlete wants here — a block with a change in it, or simply a fresh roll.

   What is typed here is a STANDING instruction, not a one-off. Forge rebuilds
   on its own when goals or the split move, and a silent rebuild that dropped
   the athlete's instruction would be Forge quietly undoing what it was told.
   It carries forward, prefilled and editable, until it is changed or cleared. */

const MAX_LENGTH = 400;

export function PlanRebuildModal({ saved, standing, busy, stage, error, onCancel, onRebuild }: {
  saved: boolean;
  standing?: string;
  busy: boolean;
  stage: string;
  error: string;
  onCancel: () => void;
  onRebuild: (adjustments: string | null) => void;
}) {
  const [text, setText] = useState(standing || '');
  const box = useRef<HTMLTextAreaElement>(null);
  const carried = Boolean(standing);
  const asked = text.trim();

  /* Escape closes it — but never mid-build, where closing would strand a
     generation the athlete cannot see the result of. */
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape' && !busy) onCancel(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [busy, onCancel]);

  useEffect(() => { if (!busy) box.current?.focus(); }, [busy]);

  return <div className="plan-rebuild-backdrop" role="dialog" aria-modal="true" aria-label="Regenerate your plan"
    onClick={() => { if (!busy) onCancel(); }}>
    <div className="plan-rebuild-sheet" onClick={event => event.stopPropagation()}>
      <header>
        <div>
          <strong>Regenerate your plan</strong>
          <small>{saved
            ? 'This replaces the block you saved. Tell Forge what should change, or just build a fresh one.'
            : 'Tell Forge what should change about this block, or just build a fresh one.'}</small>
        </div>
        <button type="button" className="plan-rebuild-close" aria-label="Close" disabled={busy} onClick={onCancel}>×</button>
      </header>

      <label>
        What would you like to change?
        <textarea
          ref={box}
          rows={4}
          maxLength={MAX_LENGTH}
          disabled={busy}
          value={text}
          onChange={event => setText(event.target.value)}
          placeholder="e.g. keep the long run on Sunday, less running overall, go heavier on squats, no speed work the week of the 14th"
        />
      </label>
      {carried
        ? <small className="plan-rebuild-hint">Carried over from your last rebuild — edit it, or clear the box and just regenerate.</small>
        : <small className="plan-rebuild-hint">Forge keeps the 8/6/4/2/1 wave and your goal lifts either way — this shapes everything around them.</small>}

      {busy ? <p className="plan-rebuild-busy">{stage || 'Building your program…'}</p> : null}
      {error && !busy ? <p className="plan-rebuild-error">{error}</p> : null}

      <footer>
        <button type="button" className="button" disabled={busy || !asked} onClick={() => onRebuild(asked)}>
          {busy ? 'Building…' : 'Rebuild with these changes'}
        </button>
        <button type="button" className="button secondary" disabled={busy} onClick={() => onRebuild(null)}>
          Just regenerate
        </button>
        <button type="button" className="button ghost" disabled={busy} onClick={onCancel}>Keep this plan</button>
      </footer>
      <small className="plan-rebuild-foot">
        {asked
          ? 'Rebuilds the block around what you asked for, and keeps that request in place for future rebuilds.'
          : 'A plain rebuild: a fresh block from your goals, split and logged bests, with no extra instructions.'}
      </small>
    </div>
  </div>;
}
