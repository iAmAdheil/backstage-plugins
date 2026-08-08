import { MetricsTimeSeriesItem } from '../../types';

/**
 * Flip a component-keyed metrics map into the componentName -> single-series
 * shape `ProjectMetricGraph` charts, picking one series per component.
 *
 * The project charts plot usage only (one line per component). Requests/limits
 * are per-component configuration rather than behaviour, and overlaying them
 * would put 3N lines on a chart whose whole point is cross-component comparison.
 */
export const pickComponentSeries = <T>(
  byComponent: Record<string, T>,
  select: (metrics: T) => MetricsTimeSeriesItem[] | undefined,
): Record<string, MetricsTimeSeriesItem[]> => {
  const result: Record<string, MetricsTimeSeriesItem[]> = {};
  Object.entries(byComponent).forEach(([name, metrics]) => {
    result[name] = select(metrics) ?? [];
  });
  return result;
};
