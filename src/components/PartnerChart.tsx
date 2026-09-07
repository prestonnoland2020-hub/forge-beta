import { useMemo, useState } from 'react';
import { formatMetric, hasVerdict, lowerIsBetter, type SeriesPoint } from '../features/friends/partnerService';
import { indexToStart } from '../lib/partnerStats';

/* TWO ATHLETES, ONE SET OF AXES.

   One chart, one metric, two lines — and the two lines are the whole point, so
   they get a fixed pair of hues rather than the athlete's chosen accent. Forge
   lets people pick from six accents, one of which (harbor) is a slate grey; a
   series colour derived from that would collide with the axes on one theme and
   with the other series on another. Blue and orange are validated against
   Forge's card surface in both tones: worst-pair colour-blind separation ΔE 25
   light / 27 dark, well past the 8 the check asks for, and both clear 3:1
   contrast. Identity never rests on colour: each line is named at its own end.

   Gaps are bridged rather than broken. A week without a logged bench is not a
   week the athlete got weaker; it is a week they did something else. */

/* Slot 1 and slot 2 of the validated categorical order, each at the step for
   its own surface. */
const SERIES = {
  mine: { light: '#2a78d6', dark: '#3987e5' },
  theirs: { light: '#eb6834', dark: '#d95926' },
};

type Props = {
  points: SeriesPoint[];
  metric: string;
  unit: string;
  myName: string;
  theirName: string;
};

/* WHAT THE CHART PLOTS IS PROGRESS, NOT THE RAW NUMBER.

   Two athletes' bench numbers on one axis tell you which of them is stronger,
   which they both already know, and the weaker one stops opening the screen.
   Each line here is that athlete against their OWN first logged week, in
   percent, so both start together and the question becomes who has moved
   further — a race either of them can win, and the one that reflects the
   training rather than the starting point.

   Pace is inverted on the way in, so up is better on every metric that HAS a
   better. Body weight does not, and is plotted as plain change.

   WHAT WAS TAKEN OUT, AND WHY. This carried two gridlines labelled with the
   window's extremes (+39% / −35%), and a legend whose two keys were also
   toggles. Neither survived contact with a phone: the extremes are an artefact
   of the window rather than anything the athlete did, and nobody hides one of
   two lines on a chart whose only subject is the pair of them. What is left is
   the one line that means something — where you both started — and the names,
   which now sit on the lines instead of under them. */
export function PartnerChart({ points, metric, unit, myName, theirName }: Props) {
  const [hover, setHover] = useState<number | null>(null);
  const width = 320; const height = 168;
  const pad = { left: 6, right: 52, top: 14, bottom: 18 };

  /* Each athlete indexed against their own start, before anything is drawn. */
  const progress = useMemo(() => {
    const lower = lowerIsBetter(metric);
    const mine = indexToStart(points.map(point => point.mine), lower);
    const theirs = indexToStart(points.map(point => point.theirs), lower);
    return points.map((point, index) => ({ bucket: point.bucket, mine: mine[index] ?? null, theirs: theirs[index] ?? null }));
  }, [points, metric]);

  const model = useMemo(() => {
    const values: number[] = [0];
    progress.forEach(point => {
      if (point.mine !== null) values.push(point.mine);
      if (point.theirs !== null) values.push(point.theirs);
    });
    if (values.length < 2 || points.length < 2) return null;
    let low = Math.min(...values); let high = Math.max(...values);
    if (high === low) { high += 1; low -= 1; }
    const span = high - low;
    low -= span * 0.14; high += span * 0.14;
    const plotWidth = width - pad.left - pad.right;
    const plotHeight = height - pad.top - pad.bottom;
    const x = (index: number) => pad.left + (points.length === 1 ? plotWidth / 2 : (index / (points.length - 1)) * plotWidth);
    const y = (value: number) => pad.top + (1 - (value - low) / (high - low)) * plotHeight;
    /* A line skips the weeks with no number rather than dropping to zero. */
    const drawn = (which: 'mine' | 'theirs') =>
      progress.map((point, index) => ({ value: point[which], index })).filter(item => item.value !== null) as Array<{ value: number; index: number }>;
    return { x, y, drawn, low, high, plotHeight };
  }, [progress, points.length]);

  if (!model) {
    return <p className="partner-chart-empty">Not enough logged here yet to draw a line. Two weeks of this and it appears.</p>;
  }

  /* The name rides at the end of its own line. When the two lines finish
     within a label's height of each other the labels would collide, so the
     lower one is pushed down — the dots stay where the data is. */
  const ends = ([['mine', myName], ['theirs', theirName]] as const).map(([which, name]) => {
    const last = model.drawn(which).at(-1);
    return last ? { which, name, x: model.x(last.index), y: model.y(last.value) } : null;
  }).filter(Boolean) as Array<{ which: 'mine' | 'theirs'; name: string; x: number; y: number }>;
  const labelY = ends.map(end => end.y);
  if (ends.length === 2 && Math.abs(labelY[0] - labelY[1]) < 12) {
    const lower = labelY[0] > labelY[1] ? 0 : 1;
    labelY[lower] = labelY[1 - lower] + 12;
  }

  const active = hover === null ? null : points[hover];
  const activeProgress = hover === null ? null : progress[hover];
  const percent = (value: number | null) => value === null ? '—' : `${value > 0 ? '+' : value < 0 ? '−' : ''}${Math.abs(Math.round(value))}%`;

  return <div className="partner-chart">
    <svg viewBox={`0 0 ${width} ${height}`} role="img"
      aria-label={`${myName} and ${theirName} compared, by week`}
      onMouseLeave={() => setHover(null)}>
      {/* One line, and it is the only value on this axis that means anything:
          where the two of you started. */}
      {model.low < 0 && model.high > 0 && <g>
        <line className="pchart-baseline" x1={pad.left} x2={width - pad.right} y1={model.y(0)} y2={model.y(0)} />
        <text className="pchart-axis" x={pad.left} y={model.y(0) - 4}>start</text>
      </g>}
      {active && <line className="pchart-crosshair" x1={model.x(hover!)} x2={model.x(hover!)} y1={pad.top} y2={height - pad.bottom} />}
      {ends.map(end => <path key={end.which} className={`pchart-line pchart-${end.which}`} fill="none"
        d={model.drawn(end.which).map((item, order) => `${order ? 'L' : 'M'}${model.x(item.index).toFixed(1)},${model.y(item.value).toFixed(1)}`).join(' ')} />)}
      {ends.map((end, index) => <g key={end.which}>
        <circle className={`pchart-dot pchart-${end.which}`} cx={end.x} cy={end.y} r={4} />
        <text className={`pchart-name pchart-${end.which}`} x={end.x + 8} y={labelY[index] + 4}>{end.name}</text>
      </g>)}
      {activeProgress && ends.map(end => {
        const value = activeProgress[end.which];
        if (value === null) return null;
        return <circle key={end.which} className={`pchart-dot pchart-${end.which}`} cx={model.x(hover!)} cy={model.y(value)} r={5} />;
      })}
      {/* One wide hit target per week, so a thumb can find it. */}
      {points.map((_, index) => <rect key={index} className="pchart-hit"
        x={model.x(index) - (width / points.length) / 2} y={0}
        width={width / points.length} height={height}
        onMouseEnter={() => setHover(index)} onTouchStart={() => setHover(index)} />)}
    </svg>
    <div className="pchart-readout" aria-live="polite">
      {active && activeProgress
        ? <><span>{new Date(`${active.bucket}T12:00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</span>
            {/* The percentage is what the line plots; the real number is what
                the athlete actually did, and both belong here. */}
            <b className="pchart-mine">{myName} {percent(activeProgress.mine)}{active.mine === null ? '' : ` · ${formatMetric(metric, active.mine)} ${unit}`}</b>
            <b className="pchart-theirs">{theirName} {percent(activeProgress.theirs)}{active.theirs === null ? '' : ` · ${formatMetric(metric, active.theirs)} ${unit}`}</b>
          </>
        : <span className="pchart-hint">{hasVerdict(metric) ? 'Tap a week to read it' : 'Change only — Forge does not judge this one'}</span>}
    </div>
  </div>;
}

export const SERIES_COLOURS = SERIES;
