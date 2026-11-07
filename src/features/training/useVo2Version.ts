import { useEffect, useState } from 'react';

/* Re-render when a new reading lands, so goal cards do not wait for a reload. */
export function useVo2Version(): number {
  const [version, setVersion] = useState(0);
  useEffect(() => {
    const bump = () => setVersion(value => value + 1);
    window.addEventListener('forge:vo2', bump);
    return () => window.removeEventListener('forge:vo2', bump);
  }, []);
  return version;
}
