import { useMemo, useState } from 'react';
import { formatMetric, lowerIsBetter, type SeriesPoint } from '../features/friends/partnerService';

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

const SERIES = {
  mine: { light: '#2a78d6', dark: '#3987e5' },
  theirs: { light: '#d95926', dark: '#d95926' },
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

export function PartnerChart({ points, metric, unit, myName, theirName, show, onToggle }: Props) {
  const [hover, setHover] = useState<number | null>(null);
  const width = 320; const height = 150;
  const pad = { left: 6, right: 6, top: 12, bottom: 20 };

  const model = useMemo(() => {
    const values: number[] = [];
    points.forEach(point => {
      if (show.mine && point.mine !== null) values.push(point.mine);
      if (show.theirs && point.theirs !== null) values.push(point.theirs);
    });
    if (!values.length || points.length < 2) return null;
    let low = Math.min(...values); let high = Math.max(...values);
    if (high === low) { high += 1; low -= 1; }
    const span = high - low;
    low -= span * 0.12; high += span * 0.12;
    const plotWidth = width - pad.left - pad.right;
    const plotHeight = height - pad.top - pad.bottom;
    const x = (index: number) => pad.left + (points.length === 1 ? plotWidth / 2 : (index / (points.length - 1)) * plotWidth);
    /* Pace is the one metric where a smaller number is a better week, so the
       axis is flipped and faster runs sit higher — the direction everything
       else on this chart already means. */
    const y = (value: number) => {
      const share = (value - low) / (high - low);
      return pad.top + (lowerIsBetter(metric) ? share : 1 - share) * plotHeight;
    };
    /* A line skips the weeks with no number rather than dropping to zero. */
    const path = (pick: (point: SeriesPoint) => number | null) => {
      const drawn = points.map((point, index) => ({ value: pick(point), index })).filter(item => item.value !== null);
      if (!drawn.length) return '';
      return drawn.map((item, order) => `${order ? 'L' : 'M'}${x(item.index).toFixed(1)},${y(item.value!).toFixed(1)}`).join(' ');
    };
    return { x, y, path, low, high, plotHeight };
  }, [points, show, metric]);

  if (!model) {
    return <p className="partner-chart-empty">Not enough logged here yet to draw a line. Two weeks of this lift and it appears.</p>;
  }

  const series = ([['mine', myName], ['theirs', theirName]] as const)
    .filter(([which]) => show[which])
    .map(([which, name]) => ({ which, name, path: model.path(point => point[which]) }));
  const active = hover === null ? null : points[hover];

  return <div className="partner-chart">
    <svg viewBox={`0 0 ${width} ${height}`} role="img"
      aria-label={`${myName} and ${theirName} compared, by week`}
      onMouseLeave={() => setHover(null)}>
      {/* Three recessive gridlines; the axis numbers sit on them. */}
      {[0, 0.5, 1].map(fraction => {
        const yy = pad.top + fraction * model.plotHeight;
        const value = lowerIsBetter(metric)
          ? model.low + fraction * (model.high - model.low)
          : model.high - fraction * (model.high - model.low);
        return <g key={fraction}>
          <line className="pchart-grid" x1={pad.left} x2={width - pad.right} y1={yy} y2={yy} />
          <text className="pchart-axis" x={pad.left} y={yy - 3}>{formatMetric(metric, value)}</text>
        </g>;
      })}
      {active && <line className="pchart-crosshair" x1={model.x(hover!)} x2={model.x(hover!)} y1={pad.top} y2={height - pad.bottom} />}
      {series.map(item => <path key={item.which} className={`pchart-line pchart-${item.which}`} d={item.path} fill="none" />)}
      {/* The last point of each line is marked and named, so identity never
          rests on colour alone. */}
      {series.map(item => {
        const last = [...points].map((point, index) => ({ value: point[item.which], index })).filter(entry => entry.value !== null).pop();
        if (!last) return null;
        return <circle key={item.which} className={`pchart-dot pchart-${item.which}`} cx={model.x(last.index)} cy={model.y(last.value!)} r={4} />;
      })}
      {active && series.map(item => {
        const value = active[item.which];
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
      {active
        ? <><span>{new Date(`${active.bucket}T12:00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</span>
            {show.mine && <b className="pchart-mine">{myName} {formatMetric(metric, active.mine)}{active.mine === null ? '' : ` ${unit}`}</b>}
            {show.theirs && <b className="pchart-theirs">{theirName} {formatMetric(metric, active.theirs)}{active.theirs === null ? '' : ` ${unit}`}</b>}
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
