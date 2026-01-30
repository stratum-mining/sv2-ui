import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
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

/**
 * Hashrate history chart component.
 * Displays real accumulated data - no mock data.
 */
export function HashrateChart({ 
  data,
  title = 'Hashrate History',
  description,
}: HashrateChartProps) {
  // Don't render chart if no data
  if (!data || data.length === 0) {
    return (
      <Card className="glass-card border-none shadow-sm bg-card/40">
        <CardHeader>
          <CardTitle className="text-base font-normal text-muted-foreground">
            {title}
          </CardTitle>
          {description && (
            <CardDescription>{description}</CardDescription>
          )}
        </CardHeader>
        <CardContent>
          <div className="h-[200px] w-full flex items-center justify-center text-muted-foreground text-sm">
            Collecting data... Chart will appear shortly.
          </div>
        </CardContent>
      </Card>
    );
  }

  // Calculate min/max for better Y axis scaling
  const hashrates = data.map(d => d.hashrate);
  const minHashrate = Math.min(...hashrates);
  const maxHashrate = Math.max(...hashrates);
  const padding = (maxHashrate - minHashrate) * 0.1 || maxHashrate * 0.1;
  const yMin = Math.max(0, minHashrate - padding);
  const yMax = maxHashrate + padding;

  return (
    <Card className="glass-card border-none shadow-sm bg-card/40">
      <CardHeader>
        <CardTitle className="text-base font-normal text-muted-foreground">
          {title}
        </CardTitle>
        {description && (
          <CardDescription>{description}</CardDescription>
        )}
      </CardHeader>
      <CardContent className="pl-0">
        <div className="h-[200px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={data}>
              <defs>
                <linearGradient id="colorHashrate" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="hsl(var(--chart-1))" stopOpacity={0.3} />
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
                dy={10}
                interval="preserveStartEnd"
              />
              <YAxis
                axisLine={false}
                tickLine={false}
                tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 11 }}
                domain={[yMin, yMax]}
                tickFormatter={(value) => formatHashrate(value)}
                width={70}
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: 'hsl(var(--popover))',
                  borderRadius: '8px',
                  border: '1px solid hsl(var(--border))',
                  boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
                }}
                itemStyle={{ color: 'hsl(var(--foreground))' }}
                formatter={(value: number) => [formatHashrate(value), 'Hashrate']}
                labelFormatter={(label) => `Time: ${label}`}
              />
              <Area
                type="monotone"
                dataKey="hashrate"
                stroke="hsl(var(--chart-1))"
                strokeWidth={2}
                fillOpacity={1}
                fill="url(#colorHashrate)"
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
}
