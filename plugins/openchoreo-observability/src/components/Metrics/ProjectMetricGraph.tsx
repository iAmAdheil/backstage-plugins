import { useState, useMemo } from 'react';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  LegendPayload,
} from 'recharts';
import { ChartLine, MetricSeriesMap } from '../../types';
import {
  formatAxisTime,
  formatTooltipTime,
  formatMetricValue,
  calculateTimeDomain,
  calculateProjectMemoryYAxis,
  transformProjectMetricsData,
  getLineOpacity,
} from './utils';
import { useMetricGraphStyles } from './styles';
import { ChartTooltip } from './ChartTooltip';

interface ProjectMetricGraphProps {
  /** The exact lines to draw, from `buildChartLines`: one metric, one line per
   *  component. The chart plots what it is given and never narrows a wider
   *  map, so the caller alone decides what appears on this card. */
  lines: ChartLine[];
  /** Line colour for a component. The caller owns what colour means. */
  colorOf: (component: string) => string;
  /** Drives value formatting and the memory Y axis only. */
  usageType: 'cpu' | 'memory' | 'networkThroughput' | 'networkLatency';
  timeRange?: string;
  customStartTime?: string;
  customEndTime?: string;
}

/**
 * The breakdown chart: one line per entry in `lines`, on shared axes.
 *
 * Every card plots one metric, so each line is one component. Colour carries
 * the component, and every line is solid. The legend lists components, one
 * entry each, and hovering an entry lights that component's line.
 *
 * The unique `dataKey` Recharts needs per line is generated here and never
 * leaves this file, so no component name has to survive a round trip through
 * a composite key.
 *
 * The default project view does not use this chart; it renders the aggregate
 * with `MetricGraphByComponent`, exactly as the component page does.
 */
export const ProjectMetricGraph = ({
  lines,
  colorOf,
  usageType,
  timeRange,
  customStartTime,
  customEndTime,
}: ProjectMetricGraphProps) => {
  const classes = useMetricGraphStyles();
  const [hoveredComponent, setHoveredComponent] = useState<
    string | undefined
  >();

  // Recharts addresses a line by `dataKey`, so each one gets an opaque index.
  const chartLines = useMemo(
    () => lines.map((line, index) => ({ dataKey: `s${index}`, ...line })),
    [lines],
  );

  // Recharts hands the legend a `dataKey`; this is how the component behind one
  // is recovered, so the key itself never has to carry the name.
  const componentOf = useMemo(() => {
    const byDataKey = new Map(
      chartLines.map(line => [line.dataKey, line.component]),
    );
    return (dataKey: unknown) => byDataKey.get(String(dataKey));
  }, [chartLines]);

  const plotted: MetricSeriesMap = useMemo(
    () =>
      Object.fromEntries(chartLines.map(line => [line.dataKey, line.points])),
    [chartLines],
  );

  const transformedData = useMemo(
    () => transformProjectMetricsData(plotted),
    [plotted],
  );

  const { ticks, daysRange, domain } = useMemo(
    () =>
      calculateTimeDomain(transformedData, timeRange, 5, {
        startTime: customStartTime,
        endTime: customEndTime,
      }),
    [transformedData, timeRange, customStartTime, customEndTime],
  );

  const memoryYAxis = useMemo(
    () =>
      usageType === 'memory' ? calculateProjectMemoryYAxis(plotted) : undefined,
    [usageType, plotted],
  );

  const handleMouseEnter = (payload: LegendPayload) =>
    setHoveredComponent(componentOf(payload.dataKey));

  const handleMouseLeave = () => setHoveredComponent(undefined);

  return (
    <div className={classes.chartContainer}>
      {transformedData.length === 0 && (
        <div className={classes.emptyOverlay}>No data available</div>
      )}
      <LineChart
        className={classes.lineChart}
        responsive
        data={transformedData}
      >
        <CartesianGrid strokeDasharray="3 3" />
        <XAxis
          dataKey="timestamp"
          type="number"
          domain={domain}
          tickFormatter={ts => formatAxisTime(ts, daysRange)}
          ticks={ticks}
          tick={{ fontSize: 12 }}
        />
        <YAxis
          width="auto"
          tickFormatter={v => formatMetricValue(v, usageType)}
          ticks={memoryYAxis?.ticks}
          domain={memoryYAxis?.domain}
        />
        <Tooltip
          content={
            <ChartTooltip
              labelFormatter={formatTooltipTime}
              formatter={(value: number) => formatMetricValue(value, usageType)}
            />
          }
        />
        {/* One entry per component. Recharts 3 builds the legend from the
            rendered <Line>s and dropped the `payload` override, so the entries
            are keyed and labelled by component with `payloadUniqBy`.
            Bounded height + scroll so a project with many components can't
            push the chart out of its card. */}
        <Legend
          payloadUniqBy={entry => componentOf(entry.dataKey)}
          formatter={(_value, entry) => componentOf(entry.dataKey)}
          wrapperStyle={{ maxHeight: 72, overflowY: 'auto' }}
          onMouseEnter={handleMouseEnter}
          onMouseLeave={handleMouseLeave}
        />
        {chartLines.map(line => (
          <Line
            key={line.dataKey}
            type="monotone"
            dataKey={line.dataKey}
            name={line.component}
            stroke={colorOf(line.component)}
            strokeOpacity={getLineOpacity(line.component, hoveredComponent)}
            dot={false}
            activeDot={{ r: 4 }}
            connectNulls={false}
          />
        ))}
      </LineChart>
    </div>
  );
};
