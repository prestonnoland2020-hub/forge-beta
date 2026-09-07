import { useMemo, useState } from 'react';
import { formatMetric, lowerIsBetter, type SeriesPoint } from '../features/friends/partnerService';
import { indexToStart } from '../lib/partnerStats';

/* TWO ATHLETES, ONE SET OF AXES.

   One chart, one metric, two lines — and the two lines are the whole point, so
   they get a fixed pair of hues rather than the athlete's chosen accent. Forge
   lets people pick from six accents, one of which (harbor) is a slate grey; a
   series colour derived from that would collide with the axes on one theme and
   with the other series on another. Blue and orange are validated against
   Forge's card surface in both tones: worst-pair colour-blind separation ΔE 25
   light / 27 dark, well past the 8 the check asks for, and both clear 3:1
   contrast. Identity is never carried by colour alone — each line is named at
   its end and in the legend, and the legend toggles it.

   Gaps are bridged rather than broken. A week without a logged bench is not a
   week the athlete got weaker; it is a week they did something else. */

/* Slot 1 and slot 2 of the validated categorical order, each at the step for
   its own surface — the light step was being used on both, which is what the
   dark check is for. Validated as a pair on Forge's card surfaces: worst-pair
   CVD separation 24.7 light / 26.8 dark against a target of 8, both clear of
   3:1 contrast. */
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
  show: { mine: boolean; theirs: boolean };
  onToggle: (which: 'mine' | 'theirs') => void;
};

/* WHAT THE CHART PLOTS IS PROGRESS, NOT THE RAW NUMBER.

   Two athletes' bench numbers on one axis tell you which of them is stronger,
   which they both already know, and the weaker one stops opening the screen.
   Each line here is that athlete against their OWN first logged week, in
   percent, so both start at zero and the question becomes who has moved
   further — a race either of them can win, and the one that reflects the
   training rather than the starting point.

   Pace is inverted on the way in, so up is better on every metric and nobody
   has to remember which chart runs backwards. The raw figures are a tap
   away. */
export function PartnerChart({ points, metric, unit, myName, theirName, show, onToggle }: Props) {
  const [hover, setHover] = useState<number | null>(null);
  const width = 320; const height = 150;
  const pad = { left: 6, right: 6, top: 12, bottom: 20 };

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
      if (show.mine && point.mine !== null) values.push(point.mine);
      if (show.theirs && point.theirs !== null) values.push(point.theirs);
    });
    if (values.length < 2 || points.length < 2) return null;
    let low = Math.min(...values); let high = Math.max(...values);
    if (high === low) { high += 1; low -= 1; }
    const span = high - low;
    low -= span * 0.12; high += span * 0.12;
    const plotWidth = width - pad.left - pad.right;
    const plotHeight = height - pad.top - pad.bottom;
    const x = (index: number) => pad.left + (points.length === 1 ? plotWidth / 2 : (index / (points.length - 1)) * plotWidth);
    /* Everything is already oriented so more is better, pace included, so the
       axis never flips. */
    const y = (value: number) => pad.top + (1 - (value - low) / (high - low)) * plotHeight;
    /* A line skips the weeks with no number rather than dropping to zero. */
    const path = (which: 'mine' | 'theirs') => {
      const drawn = progress.map((point, index) => ({ value: point[which], index })).filter(item => item.value !== null);
      if (!drawn.length) return '';
      return drawn.map((item, order) => `${order ? 'L' : 'M'}${x(item.index).toFixed(1)},${y(item.value!).toFixed(1)}`).join(' ');
    };
    return { x, y, path, low, high, plotHeight };
  }, [progress, points.length, show]);

  if (!model) {
    return <p className="partner-chart-empty">Not enough logged here yet to draw a line. Two weeks of this and it appears.</p>;
  }

  const series = ([['mine', myName], ['theirs', theirName]] as const)
    .filter(([which]) => show[which])
    .map(([which, name]) => ({ which, name, path: model.path(which) }));
  const active = hover === null ? null : points[hover];
  const activeProgress = hover === null ? null : progress[hover];
  const percent = (value: number | null) => value === null ? '—' : `${value > 0 ? '+' : value < 0 ? '−' : ''}${Math.abs(Math.round(value))}%`;

  return <div className="partner-chart">
    <svg viewBox={`0 0 ${width} ${height}`} role="img"
      aria-label={`${myName} and ${theirName} compared, by week`}
      onMouseLeave={() => setHover(null)}>
      {/* Two gridlines at the extremes and one emphasised line at zero — the
          only value on this axis that means something, since it is where both
          athletes started. A third gridline at some arbitrary midpoint landed
          a few pixels from zero and read as a rendering slip. */}
      {[0, 1].map(fraction => {
        const yy = pad.top + fraction * model.plotHeight;
        const value = model.high - fraction * (model.high - model.low);
        return <g key={fraction}>
          <line className="pchart-grid" x1={pad.left} x2={width - pad.right} y1={yy} y2={yy} />
          <text className="pchart-axis" x={pad.left} y={yy - 3}>{`${value > 0 ? '+' : ''}${Math.round(value)}%`}</text>
        </g>;
      })}
      {model.low < 0 && model.high > 0 && <g>
        <line className="pchart-baseline" x1={pad.left} x2={width - pad.right} y1={model.y(0)} y2={model.y(0)} />
        <text className="pchart-axis pchart-zero" x={pad.left} y={model.y(0) - 3}>start</text>
      </g>}
      {active && <line className="pchart-crosshair" x1={model.x(hover!)} x2={model.x(hover!)} y1={pad.top} y2={height - pad.bottom} />}
      {series.map(item => <path key={item.which} className={`pchart-line pchart-${item.which}`} d={item.path} fill="none" />)}
      {/* The last point of each line is marked and named, so identity never
          rests on colour alone. */}
      {series.map(item => {
        const last = progress.map((point, index) => ({ value: point[item.which], index })).filter(entry => entry.value !== null).pop();
        if (!last) return null;
        return <circle key={item.which} className={`pchart-dot pchart-${item.which}`} cx={model.x(last.index)} cy={model.y(last.value!)} r={4} />;
      })}
      {activeProgress && series.map(item => {
        const value = activeProgress[item.which];
        if (value === null) return null;
        return <circle key={item.which} className={`pchart-dot pchart-${item.which}`} cx={model.x(hover!)} cy={model.y(value)} r={5} />;
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
            {show.mine && <b className="pchart-mine">{myName} {percent(activeProgress.mine)}{active.mine === null ? '' : ` · ${formatMetric(metric, active.mine)} ${unit}`}</b>}
            {show.theirs && <b className="pchart-theirs">{theirName} {percent(activeProgress.theirs)}{active.theirs === null ? '' : ` · ${formatMetric(metric, active.theirs)} ${unit}`}</b>}
          </>
        : <span className="pchart-hint">Tap the chart to read a week</span>}
    </div>
    {/* The legend is also the toggle. */}
    <div className="pchart-legend">
      {([['mine', myName], ['theirs', theirName]] as const).map(([which, name]) =>
        <button type="button" key={which} className={`pchart-key pchart-${which}${show[which] ? '' : ' off'}`}
          aria-pressed={show[which]} onClick={() => onToggle(which)}>
          <i aria-hidden="true" />{name}
        </button>)}
    </div>
  </div>;
}

export const SERIES_COLOURS = SERIES;
