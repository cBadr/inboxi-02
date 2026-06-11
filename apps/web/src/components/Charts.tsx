import type { DayPoint } from '@/lib/timeseries';

// Dependency-free inline SVG charts. Server-renderable (no client JS).

export function Sparkline({
  values,
  color = '#4f46e5',
  width = 120,
  height = 32,
}: {
  values: number[];
  color?: string;
  width?: number;
  height?: number;
}) {
  if (values.length === 0) return null;
  const max = Math.max(1, ...values);
  const step = values.length > 1 ? width / (values.length - 1) : width;
  const pts: Array<[number, number]> = values.map((v, i) => [
    i * step,
    height - (v / max) * (height - 2) - 1,
  ]);
  const line = pts.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(' ');
  const area = `0,${height} ${line} ${width},${height}`;
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} className="overflow-visible">
      <polygon points={area} fill={color} opacity={0.1} />
      <polyline points={line} fill="none" stroke={color} strokeWidth={1.5} strokeLinejoin="round" />
    </svg>
  );
}

// Daily bar chart with a hover title per bar. `data` is oldest→newest.
export function BarChart({
  data,
  color = '#4f46e5',
  height = 140,
}: {
  data: DayPoint[];
  color?: string;
  height?: number;
}) {
  if (data.length === 0) {
    return <div className="py-8 text-center text-sm text-gray-400">No data.</div>;
  }
  const max = Math.max(1, ...data.map((d) => d.count));
  const gap = 2;
  const barW = 100 / data.length;
  return (
    <svg width="100%" height={height} viewBox={`0 0 100 ${height}`} preserveAspectRatio="none" className="block">
      {data.map((d, i) => {
        const h = (d.count / max) * (height - 4);
        return (
          <rect
            key={d.date}
            x={i * barW + gap / 2}
            y={height - h}
            width={barW - gap}
            height={Math.max(0, h)}
            rx={0.6}
            fill={color}
            opacity={d.count === 0 ? 0.15 : 0.85}
          >
            <title>{`${d.date}: ${d.count}`}</title>
          </rect>
        );
      })}
    </svg>
  );
}

// A titled card wrapping a chart with a headline total + sparkline.
export function TrendCard({
  label,
  total,
  data,
  color = '#4f46e5',
}: {
  label: string;
  total: number;
  data: DayPoint[];
  color?: string;
}) {
  return (
    <div className="rounded-xl border bg-white p-4">
      <div className="flex items-center justify-between">
        <div>
          <div className="text-xs uppercase tracking-wide text-gray-400">{label}</div>
          <div className="mt-1 text-2xl font-bold text-gray-900">{total.toLocaleString()}</div>
        </div>
        <Sparkline values={data.map((d) => d.count)} color={color} />
      </div>
    </div>
  );
}
