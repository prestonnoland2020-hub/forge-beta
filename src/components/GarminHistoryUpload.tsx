import { useRef, useState } from 'react';
import { useWorkoutHistory } from '../features/training/WorkoutHistoryProvider';
import { useProfileSetup } from '../features/profile/ProfileSetupProvider';
import { readGarminExport, uploadGarminHistory } from '../features/training/garminExportImport';
import { importStravaActivities } from '../features/training/stravaImportService';

/* ADD A GARMIN HISTORY FROM GARMIN'S OWN EXPORT. Until Garmin grants this app
   historical data, the connection only carries what the watch records from
   now on. This is the way to bring the years before it: pick the file Garmin
   Connect exports, and every activity in it lands in the log through the same
   dedupe as everything else — nothing already logged is doubled. */
export function GarminHistoryUpload() {
  const { records, addRecord, updateRecord } = useWorkoutHistory();
  const { setup } = useProfileSetup();
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState('');
  const [open, setOpen] = useState(false);

  const pick = async (file?: File) => {
    if (!file) return;
    setBusy(true); setNote('Reading your Garmin export…');
    try {
      const activities = await readGarminExport(file, setup?.units === 'Metric');
      if (!activities.length) { setNote('No activities were found in that file.'); return; }
      await uploadGarminHistory(activities, done => setNote(`Saving ${done.toLocaleString()} of ${activities.length.toLocaleString()} activities…`));
      const merged = await importStravaActivities(records, addRecord, updateRecord).catch(() => null);
      setNote(`${activities.length.toLocaleString()} Garmin activities added${merged?.imported ? ` — ${merged.imported.toLocaleString()} new to your training log` : ''}. Anything already logged was filled in, not doubled.`);
    } catch (reason) {
      setNote(reason instanceof Error ? reason.message : 'That file could not be read.');
    } finally {
      setBusy(false);
      if (input.current) input.current.value = '';
    }
  };

  return <div className="cx-upload">
    <div className="cx-upload-row">
      <div>
        <strong>Add your Garmin history</strong>
        <span>Bring in past activities from a Garmin Connect export.</span>
      </div>
      <button type="button" className="cx-secondary" disabled={busy} onClick={() => input.current?.click()}>{busy ? 'Adding…' : 'Choose file'}</button>
    </div>
    <input ref={input} type="file" accept=".zip,.csv,.json,application/zip,text/csv,application/json" hidden onChange={event => void pick(event.target.files?.[0])} />
    {note && <p className="cx-note" role="status">{note}</p>}
    <button type="button" className="cx-howto-toggle" aria-expanded={open} onClick={() => setOpen(value => !value)}>{open ? 'Hide how to export' : 'How to export from Garmin'}</button>
    {open && <ol className="cx-howto">
      <li><b>Everything, with heart rate:</b> on connect.garmin.com open Account Settings → Data Management → Export Your Data. Garmin emails a .zip, usually within a couple of days. Choose that .zip here.</li>
      <li><b>Right now:</b> open Activities → All Activities on connect.garmin.com, scroll to load the range you want, and choose Export CSV. Choose that file here.</li>
    </ol>}
  </div>;
}
