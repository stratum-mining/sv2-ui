import { type ReactNode } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Area,
  CartesianGrid,
  ComposedChart,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { formatHashrate } from '@/lib/utils';

export type TimeRange = '5m' | '15m' | '1h';
export type ChartMetric = 'hashrate' | 'power' | 'efficiency';

interface HashrateChartProps {
  data: {
    time: string;
    hashrate: number;
    powerW?: number | null;
    efficiencyJTh?: number | null;
  }[];
  title?: string;
  description?: string;
  info?: ReactNode;
  timeRange?: TimeRange;
  onTimeRangeChange?: (range: TimeRange) => void;
  metric?: ChartMetric;
  onMetricChange?: (metric: ChartMetric) => void;
  availableMetrics?: ChartMetric[];
}

/**
 * Computes a clean Y-axis scale targeting ~4 evenly-spaced ticks.
 * Divides by 3 (not 4) so the step rounds up to a larger nice value,
 * keeping the final tick count at 4-5 instead of 6-7.
 */
function getNiceYAxisScale(values: number[]): {
  domain: [number, number];
  ticks: number[];
} {
  if (!values.length) return { domain: [0, 10], ticks: [0, 5, 10] };

  const dataMax = Math.max(...values);
  const dataMin = Math.min(...values);

  if (dataMax === 0) return { domain: [0, 10], ticks: [0, 5, 10] };

  const range = dataMax - dataMin;
  const topPad  = range === 0 ? dataMax * 0.3 : range * 0.25;
  const rawMax  = dataMax + topPad;
  const rawMin  = range === 0 ? 0 : Math.max(0, dataMin - range * 0.1);
  const rawRange = rawMax - rawMin;

  // Dividing by 3 nudges the step to the next magnitude band,
  // which naturally produces ~4 ticks instead of 6-7.
  const magnitude = Math.pow(10, Math.floor(Math.log10(rawRange / 3)));
  const norm      = (rawRange / 3) / magnitude;
  const niceNorm  = norm < 1.5 ? 1 : norm < 3 ? 2 : norm < 7 ? 5 : 10;
  const step      = niceNorm * magnitude;

  const niceMin = Math.floor(rawMin / step) * step;
  const niceMax = Math.ceil(rawMax  / step) * step;

  const ticks: number[] = [];
  for (let t = niceMin; t <= niceMax + step * 0.01; t += step) {
    ticks.push(Math.round(t * 1e10) / 1e10); // strip float noise
  }

  return { domain: [niceMin, niceMax], ticks };
}

/**
 * Y-axis label formatter — strips the ".00" noise that the general
 * formatHashrate() adds.  Shows integers as-is; keeps one decimal
 * only when genuinely needed (e.g. "1.5 GH/s").
 */
function formatHashrateAxis(value: number): string {
  if (value === 0) return '0';
  const units = ['H/s', 'KH/s', 'MH/s', 'GH/s', 'TH/s', 'PH/s', 'EH/s'];
  const k = 1000;
  const i = Math.min(Math.floor(Math.log(value) / Math.log(k)), units.length - 1);
  const v = value / Math.pow(k, i);
  // Drop the decimal when the tick is a whole number (which it will be
  // after getNiceYAxisScale snaps to a clean step).
  const label = Number.isInteger(v) ? String(v) : v.toFixed(1).replace(/\.0$/, '');
  return `${label} ${units[i]}`;
}

function formatPower(value: number | null | undefined): string {
  if (value == null) return '-';
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(2)} MW`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(1)} kW`;
  return `${Math.round(value)} W`;
}

function formatPowerAxis(value: number): string {
  if (value === 0) return '0';
  if (value >= 1_000_000) return `${Number((value / 1_000_000).toFixed(1))} MW`;
  if (value >= 1_000) return `${Number((value / 1_000).toFixed(1))} kW`;
  return `${Math.round(value)} W`;
}

function formatEfficiency(value: number | null | undefined): string {
  return value == null ? '-' : `${value.toFixed(1)} J/TH`;
}

function formatEfficiencyAxis(value: number): string {
  return `${Number(value.toFixed(1))}`;
}

/**
 * Hashrate history chart component.
 * Displays real accumulated data - no mock data.
 */
const TIME_RANGE_OPTIONS: { value: TimeRange; label: string }[] = [
  { value: '5m', label: '5 min' },
  { value: '15m', label: '15 min' },
  { value: '1h', label: '1 hr' },
];

const METRIC_OPTIONS: { value: ChartMetric; label: string }[] = [
  { value: 'hashrate', label: 'Hashrate' },
  { value: 'power', label: 'Power' },
  { value: 'efficiency', label: 'Efficiency' },
];

const METRIC_CONFIG: Record<ChartMetric, {
  dataKey: 'hashrate' | 'powerW' | 'efficiencyJTh';
  label: string;
  yAxisFormatter: (value: number) => string;
  tooltipFormatter: (value: number) => string;
  isLine: boolean;
}> = {
  hashrate: {
    dataKey: 'hashrate',
    label: 'Hashrate',
    yAxisFormatter: formatHashrateAxis,
    tooltipFormatter: formatHashrate,
    isLine: false,
  },
  power: {
    dataKey: 'powerW',
    label: 'Power',
    yAxisFormatter: formatPowerAxis,
    tooltipFormatter: formatPower,
    isLine: false,
  },
  efficiency: {
    dataKey: 'efficiencyJTh',
    label: 'Efficiency',
    yAxisFormatter: formatEfficiencyAxis,
    tooltipFormatter: formatEfficiency,
    isLine: true,
  },
};

export function HashrateChart({
  data,
  title = 'Hashrate History',
  description,
  info,
  timeRange,
  onTimeRangeChange,
  metric = 'hashrate',
  onMetricChange,
  availableMetrics = ['hashrate', 'power', 'efficiency'],
}: HashrateChartProps) {
  const effectiveMetric = availableMetrics.includes(metric) ? metric : 'hashrate';
  const metricConfig = METRIC_CONFIG[effectiveMetric];
  const rangeSelector = timeRange && onTimeRangeChange ? (
    <div className="inline-flex items-center rounded-md bg-muted p-0.5 text-xs">
      {TIME_RANGE_OPTIONS.map(({ value, label }) => (
        <button
          key={value}
          type="button"
          onClick={() => onTimeRangeChange(value)}
          className={`px-2.5 py-1 rounded-sm font-medium transition-all ${
            timeRange === value
              ? 'bg-background text-foreground shadow-sm'
              : 'text-muted-foreground hover:text-foreground'
          }`}
        >
          {label}
        </button>
      ))}
    </div>
  ) : null;

  const metricSelector = onMetricChange ? (
    <div className="inline-flex items-center rounded-md bg-muted p-0.5 text-xs">
      {METRIC_OPTIONS.filter(({ value }) => availableMetrics.includes(value)).map(({ value, label }) => (
        <button
          key={value}
          type="button"
          onClick={() => onMetricChange(value)}
          className={`px-2.5 py-1 rounded-sm font-medium transition-all ${
            effectiveMetric === value
              ? 'bg-background text-foreground shadow-sm'
              : 'text-muted-foreground hover:text-foreground'
          }`}
        >
          {label}
        </button>
      ))}
    </div>
  ) : null;

  const metricValues = data
    .map((point) => point[metricConfig.dataKey])
    .filter((value): value is number => typeof value === 'number' && Number.isFinite(value));

  // Don't render chart if no data for the selected metric.
  if (!data || data.length === 0 || metricValues.length === 0) {
    return (
      <Card className="glass-card shadow-sm">
        <CardHeader>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <CardTitle className="text-base font-normal text-muted-foreground flex items-center gap-1.5">
              {title}
              {info}
            </CardTitle>
            <div className="flex flex-wrap items-center gap-2">
              {metricSelector}
              {rangeSelector}
            </div>
          </div>
          {description && <CardDescription>{description}</CardDescription>}
        </CardHeader>
        <CardContent>
          <div className="h-[200px] w-full flex items-center justify-center text-muted-foreground text-sm">
            Collecting data… Chart will appear shortly.
          </div>
        </CardContent>
      </Card>
    );
  }

  const { domain, ticks } = getNiceYAxisScale(metricValues);

  return (
    <Card className="glass-card shadow-sm">
      <CardHeader>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <CardTitle className="text-base font-normal text-muted-foreground flex items-center gap-1.5">
            {title}
            {info}
          </CardTitle>
          <div className="flex flex-wrap items-center gap-2">
            {metricSelector}
            {rangeSelector}
          </div>
        </div>
        {description && <CardDescription>{description}</CardDescription>}
      </CardHeader>
      {/* pr-4 keeps the right edge of the chart flush with the card padding */}
      <CardContent className="pl-2 pr-4">
        <div className="h-[200px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={data} margin={{ top: 4, right: 0, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id={`color-${effectiveMetric}`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%"  stopColor="hsl(var(--chart-1))" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="hsl(var(--chart-1))" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid
                strokeDasharray="3 3"
                vertical={false}
                stroke="hsl(var(--border))"
                opacity={0.4}
              />
              <XAxis
                dataKey="time"
                axisLine={false}
                tickLine={false}
                tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 11 }}
                dy={8}
                interval="preserveStartEnd"
              />
              <YAxis
                axisLine={false}
                tickLine={false}
                tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 11 }}
                domain={domain}
                ticks={ticks}
                tickFormatter={(v) => metricConfig.yAxisFormatter(v)}
                /* wide enough for labels like "1.20 GH/s" without truncation */
                width={76}
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: 'hsl(var(--popover))',
                  borderRadius: '8px',
                  border: '1px solid hsl(var(--border))',
                  boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
                }}
                itemStyle={{ color: 'hsl(var(--foreground))' }}
                formatter={(value: number) => [metricConfig.tooltipFormatter(value), metricConfig.label]}
                labelFormatter={(label) => `Time: ${label}`}
              />
              {metricConfig.isLine ? (
                <Line
                  type="monotone"
                  dataKey={metricConfig.dataKey}
                  stroke="hsl(var(--chart-1))"
                  strokeWidth={2}
                  dot={false}
                  connectNulls
                />
              ) : (
                <Area
                  type="monotone"
                  dataKey={metricConfig.dataKey}
                  stroke="hsl(var(--chart-1))"
                  strokeWidth={2}
                  fillOpacity={1}
                  fill={`url(#color-${effectiveMetric})`}
                  connectNulls
                />
              )}
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
}
