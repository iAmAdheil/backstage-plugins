import { useEffect, useMemo, useRef } from 'react';
import {
  Button,
  Card,
  CardContent,
  CardHeader,
  Divider,
  Grid,
  Typography,
} from '@material-ui/core';
import { Alert } from '@material-ui/lab';
import { ProjectMetricGraph } from './ProjectMetricGraph';
import { Filters, HttpMetrics, ProjectHttpMetrics } from '../../types';
import { useDataPlaneNetPolProvider, useProjectMetrics } from '../../hooks';
import { pickComponentSeries } from './projectMetricsSeries';

type ProjectHTTPMetricsSectionProps = {
  filters: Filters;
  components: string[];
  namespaceName: string;
  project: string;
  refreshNonce: number;
  /** Page-level gate (per-environment metrics permission). */
  enabled: boolean;
};

/**
 * Project counterpart to `HTTPMetricsSection`. Same Cilium gate — HTTP metrics
 * come from the data plane's network policy provider, which is per-environment,
 * not per-component — but fanned out across the project's components.
 */
export const ProjectHTTPMetricsSection = ({
  filters,
  components,
  namespaceName,
  project,
  refreshNonce,
  enabled,
}: ProjectHTTPMetricsSectionProps) => {
  const { networkPolicyProvider, loading: netPolLoading } =
    useDataPlaneNetPolProvider(
      namespaceName,
      filters.environment?.dataPlaneRef,
    );
  const httpEnabled = networkPolicyProvider === 'cilium';

  const { metrics, error, refresh } = useProjectMetrics(
    filters,
    components,
    namespaceName,
    project,
    'http',
    enabled && httpEnabled,
  );
  const httpMetrics = metrics as ProjectHttpMetrics | undefined;

  // Filters live in the query key, so a filter change refetches on its own.
  // Only the parent's explicit refresh (a `refreshNonce` bump, same key) needs
  // a manual poke.
  const previousRefreshNonceRef = useRef(refreshNonce);
  useEffect(() => {
    if (previousRefreshNonceRef.current !== refreshNonce) {
      previousRefreshNonceRef.current = refreshNonce;
      if (httpEnabled && enabled) refresh();
    }
  }, [refreshNonce, httpEnabled, enabled, refresh]);

  const byComponent = useMemo(
    () => httpMetrics?.byComponent ?? {},
    [httpMetrics],
  );

  const requestSeries = useMemo(
    () =>
      pickComponentSeries<HttpMetrics>(
        byComponent,
        m => m.networkThroughput?.requestCount,
      ),
    [byComponent],
  );
  const failedRequestSeries = useMemo(
    () =>
      pickComponentSeries<HttpMetrics>(
        byComponent,
        m => m.networkThroughput?.unsuccessfulRequestCount,
      ),
    [byComponent],
  );
  const latencySeries = useMemo(
    () =>
      pickComponentSeries<HttpMetrics>(
        byComponent,
        m => m.networkLatency?.meanLatency,
      ),
    [byComponent],
  );

  if (netPolLoading || !httpEnabled) {
    return null;
  }

  if (error) {
    const isMetricsModuleError = error.toLowerCase().includes('metrics module');
    const isObservabilityDisabled = error.includes(
      'Observability is not enabled',
    );

    let headline = 'Failed to load HTTP metrics.';
    if (isObservabilityDisabled) {
      headline =
        'HTTP metrics are unavailable: observability is not enabled for this project in the current environment.';
    } else if (isMetricsModuleError) {
      headline =
        'HTTP metrics are unavailable. Check the metrics module configuration.';
    }

    return (
      <Grid item xs={12}>
        <Alert severity={isObservabilityDisabled ? 'info' : 'error'}>
          <Typography variant="body1">{headline}</Typography>
          {!isObservabilityDisabled && (
            <Typography variant="body2">{error}</Typography>
          )}
          {!isMetricsModuleError && !isObservabilityDisabled && (
            <Button onClick={() => refresh()} color="inherit" size="small">
              Retry
            </Button>
          )}
        </Alert>
      </Grid>
    );
  }

  return (
    <>
      <Grid item xs={12} md={6}>
        <Card>
          <CardHeader title="Request Throughput" />
          <Divider />
          <CardContent>
            <ProjectMetricGraph
              seriesByComponent={requestSeries}
              usageType="networkThroughput"
              timeRange={filters.timeRange}
              customStartTime={filters.customStartTime}
              customEndTime={filters.customEndTime}
            />
          </CardContent>
        </Card>
      </Grid>
      <Grid item xs={12} md={6}>
        <Card>
          <CardHeader title="Failed Requests" />
          <Divider />
          <CardContent>
            <ProjectMetricGraph
              seriesByComponent={failedRequestSeries}
              usageType="networkThroughput"
              timeRange={filters.timeRange}
              customStartTime={filters.customStartTime}
              customEndTime={filters.customEndTime}
            />
          </CardContent>
        </Card>
      </Grid>
      <Grid item xs={12} md={6}>
        <Card>
          <CardHeader title="Request Latency (mean)" />
          <Divider />
          <CardContent>
            <ProjectMetricGraph
              seriesByComponent={latencySeries}
              usageType="networkLatency"
              timeRange={filters.timeRange}
              customStartTime={filters.customStartTime}
              customEndTime={filters.customEndTime}
            />
          </CardContent>
        </Card>
      </Grid>
    </>
  );
};
