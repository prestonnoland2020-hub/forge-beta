import { supabase } from '../../lib/supabase';

/* A GARMIN HISTORY WITHOUT GARMIN'S HISTORY PERMISSION.

   Garmin's API backfills past activities only to Enterprise programs. Every
   athlete, though, can download their own history from Garmin Connect, in
   one of two shapes, and both are read here — on the phone, nothing uploaded
   but the activities themselves:

     • the full data export (Account → Data Management → Export your data):
       a .zip Garmin emails within a couple of days. Inside it,
       DI_CONNECT/DI-Connect-Fitness/*_summarizedActivities.json holds every
       activity with Garmin's own activityId and heart rate;
     • the Activities list's "Export CSV": instant, but no ids, and in the
       distance units the athlete's Garmin Connect is set to.

   Rows go to garmin-connect in batches; the import then brings them into the
   log through the same dedupe as every other source. */

export type ExportActivity = {
  provider: 'garmin' | 'garmin-export';
  id: string;
  type: string;
  name: string;
  startUtc: string;
  startLocal: string;
  distanceMeters?: number;
  movingSeconds?: number;
  elapsedSeconds?: number;
  averageHr?: number;
  maxHr?: number;
};

/* ── A minimal zip reader ────────────────────────────────────────────────
   Reads the central directory, then inflates only the entries asked for with
   the browser's own DecompressionStream ("deflate-raw"), so no library is
   shipped for a file read once. Stored (method 0) and deflated (8) entries;
   anything else is skipped. */
async function zipEntries(buffer: ArrayBuffer, wanted: (name: string) => boolean): Promise<Array<{ name: string; text: string }>> {
  const view = new DataView(buffer);
  let eocd = -1;
  for (let i = buffer.byteLength - 22; i >= Math.max(0, buffer.byteLength - 65_557); i--) {
    if (view.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) throw new Error('That file is not a zip archive.');
  const count = view.getUint16(eocd + 10, true);
  let offset = view.getUint32(eocd + 16, true);
  const decoder = new TextDecoder();
  const out: Array<{ name: string; text: string }> = [];
  for (let n = 0; n < count; n++) {
    if (view.getUint32(offset, true) !== 0x02014b50) break;
    const method = view.getUint16(offset + 10, true);
    const compressed = view.getUint32(offset + 20, true);
    const nameLength = view.getUint16(offset + 28, true);
    const extraLength = view.getUint16(offset + 30, true);
    const commentLength = view.getUint16(offset + 32, true);
    const local = view.getUint32(offset + 42, true);
    const name = decoder.decode(new Uint8Array(buffer, offset + 46, nameLength));
    offset += 46 + nameLength + extraLength + commentLength;
    if (!wanted(name) || (method !== 0 && method !== 8)) continue;
    const start = local + 30 + view.getUint16(local + 26, true) + view.getUint16(local + 28, true);
    const bytes = new Uint8Array(buffer, start, compressed);
    const data = method === 0 ? bytes : new Uint8Array(await new Response(new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate-raw'))).arrayBuffer());
    out.push({ name, text: decoder.decode(data) });
  }
  return out;
}

const isoLocal = (ms: number) => new Date(ms).toISOString().slice(0, 19);

/* ── The full export's summarizedActivities ──────────────────────────────
   Garmin writes times as epoch milliseconds, durations in milliseconds and
   distance in centimetres. startTimeLocal is the device's wall clock written
   as if it were UTC, which is exactly the local day the log needs. */
export function fromSummarizedActivities(json: unknown): ExportActivity[] {
  const lists = (Array.isArray(json) ? json : [json]).flatMap(block => (block as { summarizedActivitiesExport?: unknown[] })?.summarizedActivitiesExport || []);
  const out: ExportActivity[] = [];
  for (const raw of lists as Array<Record<string, unknown>>) {
    const id = raw.activityId; const startGmt = Number(raw.startTimeGmt); const startLocal = Number(raw.startTimeLocal || raw.startTimeGmt);
    if (!id || !(startGmt > 0)) continue;
    const ms = (value: unknown) => { const n = Number(value); return n > 0 ? n / 1000 : undefined; };
    let meters = Number(raw.distance) > 0 ? Number(raw.distance) / 100 : undefined;
    const seconds = ms(raw.movingDuration) || ms(raw.duration);
    /* Centimetres is the export's unit; a value that would mean walking pace
       for a run read as metres was already metres. */
    if (meters && seconds && /run/i.test(String(raw.activityType || raw.sportType)) && meters / seconds < 0.5 && Number(raw.distance) / seconds >= 1.5) meters = Number(raw.distance);
    out.push({
      provider: 'garmin', id: String(id),
      type: String(raw.activityType || raw.sportType || 'other'),
      name: String(raw.name || raw.activityType || 'Activity'),
      startUtc: new Date(startGmt).toISOString(), startLocal: isoLocal(startLocal),
      distanceMeters: meters, movingSeconds: seconds, elapsedSeconds: ms(raw.elapsedDuration) || ms(raw.duration),
      averageHr: Number(raw.avgHr) || undefined, maxHr: Number(raw.maxHr) || undefined,
    });
  }
  return out;
}

/* ── The Activities CSV ──────────────────────────────────────────────────
   Columns by name, not position (Garmin adds and reorders them). Distance is
   in the athlete's Garmin Connect units; Forge's own unit setting decides. */
const csvRows = (text: string): string[][] => {
  const rows: string[][] = []; let row: string[] = []; let cell = ''; let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) { if (c === '"' && text[i + 1] === '"') { cell += '"'; i++; } else if (c === '"') quoted = false; else cell += c; }
    else if (c === '"') quoted = true;
    else if (c === ',') { row.push(cell); cell = ''; }
    else if (c === '\n' || c === '\r') { if (c === '\r' && text[i + 1] === '\n') i++; row.push(cell); rows.push(row); row = []; cell = ''; }
    else cell += c;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  return rows.filter(r => r.some(value => value.trim()));
};
const clockSeconds = (value: string) => { const parts = value.trim().split(':').map(Number); if (!parts.length || parts.some(Number.isNaN)) return undefined; return parts.reduce((total, part) => total * 60 + part, 0) || undefined; };
const hash = (value: string) => { let h = 2166136261; for (let i = 0; i < value.length; i++) { h ^= value.charCodeAt(i); h = Math.imul(h, 16777619); } return (h >>> 0).toString(36); };

export function fromActivitiesCsv(text: string, metric: boolean, timezoneOffsetMinutes = new Date().getTimezoneOffset()): ExportActivity[] {
  const [header, ...rows] = csvRows(text.replace(/^﻿/, ''));
  if (!header) return [];
  const col = (...names: string[]) => header.findIndex(h => names.some(name => h.trim().toLowerCase() === name));
  const type = col('activity type'); const date = col('date'); const title = col('title');
  const distance = col('distance'); const time = col('time', 'moving time'); const elapsed = col('elapsed time');
  const avgHr = col('avg hr', 'average heart rate'); const maxHr = col('max hr', 'max heart rate');
  if (type < 0 || date < 0) throw new Error('That CSV is not a Garmin Connect activities export.');
  const out: ExportActivity[] = [];
  for (const row of rows) {
    const when = (row[date] || '').trim().replace(' ', 'T');
    if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(when)) continue;
    /* The CSV's date is the device's local time; the UTC instant is that plus
       this device's offset, which is right for anyone importing at home. */
    const startUtc = new Date(new Date(`${when.slice(0, 19)}Z`).getTime() + timezoneOffsetMinutes * 60_000).toISOString();
    const rawDistance = parseFloat((row[distance] || '').replace(/,/g, ''));
    const number = (index: number) => { const n = parseFloat((row[index] || '').replace(/,/g, '')); return n > 0 ? n : undefined; };
    out.push({
      provider: 'garmin-export',
      id: `csv-${hash(`${when}|${row[type]}|${row[title] || ''}`)}`,
      type: (row[type] || 'other').trim().toUpperCase().replace(/[^A-Z0-9]+/g, '_'),
      name: (row[title] || row[type] || 'Activity').trim(),
      startUtc, startLocal: when.slice(0, 19),
      distanceMeters: rawDistance > 0 ? rawDistance * (metric ? 1000 : 1609.344) : undefined,
      movingSeconds: time >= 0 ? clockSeconds(row[time] || '') : undefined,
      elapsedSeconds: elapsed >= 0 ? clockSeconds(row[elapsed] || '') : undefined,
      averageHr: avgHr >= 0 ? number(avgHr) : undefined,
      maxHr: maxHr >= 0 ? number(maxHr) : undefined,
    });
  }
  return out;
}

/* Whichever file the athlete picked: the export zip, the JSON from inside
   it, or the CSV. */
export async function readGarminExport(file: File, metric: boolean): Promise<ExportActivity[]> {
  const name = file.name.toLowerCase();
  if (name.endsWith('.zip')) {
    const entries = await zipEntries(await file.arrayBuffer(), entry => /summarizedActivities.*\.json$/i.test(entry));
    if (!entries.length) throw new Error('No activities in that export. Use the zip Garmin emails from "Export your data".');
    return entries.flatMap(entry => fromSummarizedActivities(JSON.parse(entry.text)));
  }
  if (name.endsWith('.json')) return fromSummarizedActivities(JSON.parse(await file.text()));
  if (name.endsWith('.csv')) return fromActivitiesCsv(await file.text(), metric);
  throw new Error('Choose the .zip from Garmin’s data export, or the CSV from your Activities list.');
}

/* Sent in batches the server accepts; returns how many were stored. */
export async function uploadGarminHistory(activities: ExportActivity[], onProgress?: (done: number) => void): Promise<number> {
  let stored = 0;
  for (let start = 0; start < activities.length; start += 500) {
    const { data, error } = await supabase.functions.invoke('garmin-connect', { body: { action: 'import', activities: activities.slice(start, start + 500) } });
    if (error || data?.error) throw new Error(data?.error || error?.message || 'Garmin history could not be saved.');
    stored += Number(data?.stored) || 0;
    onProgress?.(Math.min(activities.length, start + 500));
  }
  return stored;
}
