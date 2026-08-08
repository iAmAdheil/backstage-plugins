import { useApi } from '@backstage/core-plugin-api';
import { observabilityApiRef } from '../api/ObservabilityApi';
import { Filters, HttpMetrics, MetricType, ResourceMetrics } from '../types';
import { Entity } from '@backstage/catalog-model';
import { CHOREO_ANNOTATIONS } from '@openchoreo/backstage-plugin-common';
import {
  calculateTimeRange,
  useOpenChoreoQuery,
} from '@openchoreo/backstage-plugin-react';
import { calculateStep } from '../components/Metrics/utils';

export function useMetrics(
  filters: Filters,
  entity: Entity,
  namespaceName: string,
  project: string,
  metricType: MetricType = 'resource',
  /**
   * Consumer-supplied gate — the page only wants metrics fetched once its own
   * preconditions hold (metrics-view permission, HTTP-metrics enabled). Folded
   * into the query's `enabled` so no request fires while the gate is false,
   * preserving the old imperative "call fetchMetrics() only when allowed" flow.
   * @default true
   */
  enabled: boolean = true,
) {
  const observabilityApi = useApi(observabilityApiRef);

  const componentName =
    entity.metadata.annotations?.[CHOREO_ANNOTATIONS.COMPONENT];

  const { data, loading, isRefetching, error, refetch } = useOpenChoreoQuery<
    ResourceMetrics | HttpMetrics
  >(
    [
      'metrics',
      namespaceName,
      project,
      filters.environment?.name ?? null,
      componentName ?? null,
      filters.timeRange,
      filters.customStartTime,
      filters.customEndTime,
      metricType,
    ],
    () => {
      if (!componentName) {
        throw new Error('Component name not found in entity annotations');
      }

      const { startTime, endTime } = calculateTimeRange(filters.timeRange, {
        startTime: filters.customStartTime,
        endTime: filters.customEndTime,
      });
      const step = calculateStep(filters.timeRange, startTime, endTime);

      return observabilityApi.getMetrics(
        filters.environment.name,
        componentName,
        namespaceName,
        project,
        { startTime, endTime, step, type: metricType },
      );
    },
    {
      enabled:
        enabled &&
        !!filters.environment &&
        !!filters.timeRange &&
        !!componentName,
    },
  );

  return {
    metrics: data ?? null,
    loading,
    isRefetching,
    error: error ? error.message || 'Failed to fetch metrics' : null,
    fetchMetrics: (_reset: boolean = false) => refetch(),
    refresh: refetch,
  };
}
