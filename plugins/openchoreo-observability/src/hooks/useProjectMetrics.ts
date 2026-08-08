import { useMemo } from 'react';
import { useApi } from '@backstage/core-plugin-api';
import { observabilityApiRef } from '../api/ObservabilityApi';
import {
  FailedComponentMetrics,
  Filters,
  HttpMetrics,
  MetricType,
  ProjectHttpMetrics,
  ProjectResourceMetrics,
  ResourceMetrics,
} from '../types';
import {
  calculateTimeRange,
  useOpenChoreoQuery,
} from '@openchoreo/backstage-plugin-react';
import { calculateStep } from '../components/Metrics/utils';

interface UseProjectMetricsResult {
  metrics: ProjectResourceMetrics | ProjectHttpMetrics | undefined;
  loading: boolean;
  /** A background refresh is in flight while data is already on screen. */
  isRefetching: boolean;
  error: string | undefined;
  refresh: () => void;
}

const messageOf = (reason: unknown): string =>
  reason instanceof Error
    ? reason.message || 'Failed to fetch metrics'
    : String(reason);

/**
 * Project-level metrics: the same per-component `getMetrics` call fanned out
 * across every selected component and merged into a component-keyed structure.
 *
 * The fan-out lives here rather than in the observer because the metrics
 * response schema (`ResourceMetricsTimeSeries` / `HttpMetricsTimeSeries`) is a
 * flat map of metric name -> series with no component dimension, so a single
 * project-scoped query could only ever return one aggregate series — which
 * defeats the point of a cross-component view.
 *
 * `Promise.allSettled`, not `Promise.all`: one component with observability
 * disabled (or deleted mid-session) must not blank the whole page. Failures are
 * collected into `failedComponents`; only an all-failed fan-out throws, so the
 * page can distinguish "partly degraded" from "nothing to show".
 */
export function useProjectMetrics(
  filters: Filters,
  components: string[],
  namespaceName: string,
  project: string,
  metricType: MetricType = 'resource',
  /** Consumer gate (permission, HTTP-metrics enablement). Folded into `enabled`. */
  enabled: boolean = true,
): UseProjectMetricsResult {
  const observabilityApi = useApi(observabilityApiRef);

  // Sorted + deduped so a re-ordered selection doesn't churn the query key.
  const componentNames = useMemo(
    () => Array.from(new Set(components)).sort(),
    [components],
  );

  const { data, loading, isRefetching, error, refetch } = useOpenChoreoQuery<
    ProjectResourceMetrics | ProjectHttpMetrics
  >(
    [
      'project-metrics',
      namespaceName,
      project,
      filters.environment?.name ?? null,
      componentNames.join(','),
      filters.timeRange,
      filters.customStartTime,
      filters.customEndTime,
      metricType,
    ],
    async () => {
      const { startTime, endTime } = calculateTimeRange(filters.timeRange, {
        startTime: filters.customStartTime,
        endTime: filters.customEndTime,
      });
      const step = calculateStep(filters.timeRange, startTime, endTime);

      const settled = await Promise.allSettled(
        componentNames.map(componentName =>
          observabilityApi.getMetrics(
            filters.environment.name,
            componentName,
            namespaceName,
            project,
            { startTime, endTime, step, type: metricType },
          ),
        ),
      );

      const byComponent: Record<string, ResourceMetrics & HttpMetrics> = {};
      const failedComponents: FailedComponentMetrics[] = [];

      settled.forEach((outcome, index) => {
        const name = componentNames[index];
        if (outcome.status === 'fulfilled') {
          byComponent[name] = outcome.value as ResourceMetrics & HttpMetrics;
        } else {
          failedComponents.push({ name, error: messageOf(outcome.reason) });
        }
      });

      // Every component failed — there is no partial view to render, so surface
      // it as a query error. The first message is kept verbatim so the page's
      // "Observability is not enabled" check still matches.
      if (failedComponents.length > 0 && failedComponents.length === settled.length) {
        throw new Error(failedComponents[0].error);
      }

      return { byComponent, failedComponents } as
        | ProjectResourceMetrics
        | ProjectHttpMetrics;
    },
    {
      enabled:
        enabled &&
        !!filters.environment &&
        !!filters.timeRange &&
        !!namespaceName &&
        !!project &&
        componentNames.length > 0,
    },
  );

  return {
    metrics: data,
    loading,
    isRefetching,
    error: error ? error.message || 'Failed to fetch metrics' : undefined,
    refresh: refetch,
  };
}
