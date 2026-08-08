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
import { DataKey } from 'recharts/types/util/types';
import { MetricsTimeSeriesItem } from '../../types';
import {
  formatAxisTime,
  formatTooltipTime,
  formatMetricValue,
  calculateTimeDomain,
  calculateMemoryYAxis,
  transformMetricsData,
  getComponentLineColor,
  getLineOpacity,
} from './utils';
import { useProjectMetricGraphStyles } from './styles';
import { ChartTooltip } from './ChartTooltip';

interface ProjectMetricGraphProps {
  /** componentName -> that component's series for the metric being charted. */
  seriesByComponent: Record<string, MetricsTimeSeriesItem[]>;
  usageType: 'cpu' | 'memory' | 'networkThroughput' | 'networkLatency';
  timeRange?: string;
  customStartTime?: string;
  customEndTime?: string;
}

/**
 * Project-level counterpart to `MetricGraphByComponent`: one line per component
 * on a shared time axis, so a spike in one component can be read against the
 * others. The component-level chart plots usage/requests/limits for a single
 * component and is deliberately left untouched.
 */
export const ProjectMetricGraph = ({
  seriesByComponent,
  usageType,
  timeRange,
  customStartTime,
  customEndTime,
}: ProjectMetricGraphProps) => {
  const classes = useProjectMetricGraphStyles();
  const [hoveringDataKey, setHoveringDataKey] = useState<
    DataKey<any> | undefined
  >();

  // A component with no points contributes no line; keeping it would put an
  // empty entry in the legend with nothing to hover.
  const componentNames = useMemo(
    () =>
      Object.keys(seriesByComponent)
        .filter(name => (seriesByComponent[name]?.length ?? 0) > 0)
        .sort(),
    [seriesByComponent],
  );

  const plottedSeries = useMemo(() => {
    const result: Record<string, MetricsTimeSeriesItem[]> = {};
    componentNames.forEach(name => {
      result[name] = seriesByComponent[name];
    });
    return result;
  }, [componentNames, seriesByComponent]);

  const transformedData = useMemo(
    () => transformMetricsData(plottedSeries),
    [plottedSeries],
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
    () => (usageType === 'memory' ? calculateMemoryYAxis(plottedSeries) : undefined),
    [usageType, plottedSeries],
  );

  const handleMouseEnter = (payload: LegendPayload) =>
    setHoveringDataKey(payload.dataKey);

  const handleMouseLeave = () => setHoveringDataKey(undefined);

  return (
    <div className={classes.chartContainer}>
      {transformedData.length === 0 && (
        <div className={classes.emptyOverlay}>No data available</div>
      )}
      <LineChart className={classes.lineChart} responsive data={transformedData}>
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
        {/* Bounded height + scroll so a project with many components can't push
            the chart out of its card. */}
        <Legend
          wrapperStyle={{ maxHeight: 72, overflowY: 'auto' }}
          onMouseEnter={handleMouseEnter}
          onMouseLeave={handleMouseLeave}
        />
        {componentNames.map((name, index) => (
          <Line
            key={name}
            type="monotone"
            dataKey={name}
            name={name}
            strokeOpacity={getLineOpacity(name, hoveringDataKey)}
            stroke={getComponentLineColor(index)}
            dot={false}
            activeDot={{ r: 4 }}
            connectNulls={false}
          />
        ))}
      </LineChart>
    </div>
  );
};
