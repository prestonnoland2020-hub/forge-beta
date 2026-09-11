import { useEffect } from 'react';

/* THE GATE HAS TO ASK THE EDITOR, NOT GUESS FROM THE URL.

   The onboarding gate sends an athlete back to setup when their lifting days
   name no movements — which is right, and which a split editor triggers the
   moment the athlete empties a day to refill it. The exemption was a list of
   paths, '/split' and '/plan', so it was correct for exactly the two screens
   someone had thought of and wrong everywhere else: any other surface that lets
   a day be emptied ejects the athlete mid-edit, and the gate has no idea it
   happened. A screen that edits the split says so instead. */

let editors = 0;
const listeners = new Set<() => void>();
const changed = () => listeners.forEach(listener => listener());

export const isEditingSplit = () => editors > 0;
export const onSplitEditingChange = (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; };

/* Counted rather than a boolean: two editors can be mounted at once (a modal
   over a page), and the first to unmount must not clear the other's claim. */
export function useEditingSplit(active = true) {
  useEffect(() => {
    if (!active) return;
    editors += 1; changed();
    return () => { editors = Math.max(0, editors - 1); changed(); };
  }, [active]);
}
