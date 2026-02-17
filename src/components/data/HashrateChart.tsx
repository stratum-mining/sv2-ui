import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { formatHashrate } from '@/lib/utils';

interface HashrateChartProps {
  data: { time: string; hashrate: number }[];
  title?: string;
  description?: string;
}

export function HashrateChart({
  data,
  title = 'Hashrate',
  description,
}: HashrateChartProps) {
  if (!data || data.length === 0) {
    return (
      <div className="rounded-xl border border-border bg-card p-5">
        <p className="text-xs text-muted-foreground mb-3">{title}</p>
        <div className="h-[180px] flex items-center justify-center text-sm text-muted-foreground">
          Collecting data...
        </div>
      </div>
    );
  }

  const hashrates = data.map(d => d.hashrate);
  const minHashrate = Math.min(...hashrates);
  const maxHashrate = Math.max(...hashrates);
  const padding = (maxHashrate - minHashrate) * 0.1 || maxHashrate * 0.1;
  const yMin = Math.max(0, minHashrate - padding);
  const yMax = maxHashrate + padding;

  return (
    <div className="rounded-xl border border-border bg-card p-5">
      <div className="flex items-baseline justify-between mb-3">
        <p className="text-xs text-muted-foreground">{title}</p>
        {description && (
          <p className="text-xs text-muted-foreground">{description}</p>
        )}
      </div>
      <div className="h-[180px] w-full">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data}>
            <defs>
              <linearGradient id="colorHashrate" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="hsl(var(--chart-1))" stopOpacity={0.2} />
                <stop offset="95%" stopColor="hsl(var(--chart-1))" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid
              strokeDasharray="3 3"
              vertical={false}
              stroke="hsl(var(--border))"
              opacity={0.3}
            />
            <XAxis
              dataKey="time"
              axisLine={false}
              tickLine={false}
              tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 10 }}
              dy={8}
              interval="preserveStartEnd"
            />
            <YAxis
              axisLine={false}
              tickLine={false}
              tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 10 }}
              domain={[yMin, yMax]}
              tickFormatter={(value) => formatHashrate(value)}
              width={65}
            />
            <Tooltip
              contentStyle={{
                backgroundColor: 'hsl(var(--popover))',
                borderRadius: '8px',
                border: '1px solid hsl(var(--border))',
                fontSize: '12px',
              }}
              itemStyle={{ color: 'hsl(var(--foreground))' }}
              formatter={(value: number) => [formatHashrate(value), 'Hashrate']}
              labelFormatter={(label) => label}
            />
            <Area
              type="monotone"
              dataKey="hashrate"
              stroke="hsl(var(--chart-1))"
              strokeWidth={1.5}
              fillOpacity={1}
              fill="url(#colorHashrate)"
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
