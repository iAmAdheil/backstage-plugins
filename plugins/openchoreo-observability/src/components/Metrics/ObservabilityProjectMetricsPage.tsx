import { useMemo, useState } from 'react';
import {
  PageLoader,
  RefreshOverlay,
} from '@openchoreo/backstage-design-system';
import {
  Grid,
  Card,
  CardContent,
  CardHeader,
  Divider,
  Button,
  Typography,
  Box,
  useTheme,
} from '@material-ui/core';
import { Alert } from '@material-ui/lab';
import { useEntity } from '@backstage/plugin-catalog-react';
import { CHOREO_ANNOTATIONS } from '@openchoreo/backstage-plugin-common';
import {
  useProjectEnvironments,
  useMetricsPermission,
  ForbiddenState,
} from '@openchoreo/backstage-plugin-react';

import { MetricsFilters } from './MetricsFilters';
import { MetricsActions } from './MetricsActions';
import { MetricGraphByComponent } from './MetricGraphByComponent';
import { HTTPMetricsSection } from './HTTPMetricsSection';
import { ProjectMetricGraph } from './ProjectMetricGraph';
import { ProjectHTTPMetricsSection } from './ProjectHTTPMetricsSection';
import {
  buildProjectSeries,
  formatMetricName,
  getMetricConfigs,
} from './utils';
import { componentColorResolver } from './colors';
import {
  useGetComponentsByProject,
  useMetrics,
  useProjectMetrics,
  useUrlFilters,
} from '../../hooks';
import { EnvironmentsStatusNotice } from '../common';
import {
  CpuUsageMetrics,
  MemoryUsageMetrics,
  ProjectResourceMetrics,
  ResourceMetrics,
} from '../../types';
import { useObservabilityMetricsPageStyles } from './styles';

/** True when at least one series in the aggregate carries a point. */
const hasAnyPoints = (metrics?: ResourceMetrics | null): boolean =>
  Object.values(metrics?.cpuUsage ?? {}).some(series => series?.length > 0) ||
  Object.values(metrics?.memoryUsage ?? {}).some(series => series?.length > 0);

/**
 * Project (System entity) Metrics tab.
 *
 * Two modes over the same filter bar:
 *
 * - **No components selected (default).** One `getMetrics` call with the
 *   component omitted. The observer answers with a project-wide aggregate in
 *   the component page's exact schema, so it renders through the component
 *   page's own chart and HTTP section. The tab is meant to be
 *   indistinguishable from the component tab apart from the numbers.
 * - **Components selected.** A fan-out, one request per component. Usage,
 *   requests, and limits each get their own chart, one line per component,
 *   one colour each, so many components do not pile 3N lines on one card. The
 *   aggregate response carries no component dimension, so the breakdown can
 *   only come from separate requests.
 *
 * Both hooks are called unconditionally and gated by `enabled`, so the mode
 * switch never violates the rules of hooks and the inactive mode fires nothing.
 */
const ObservabilityProjectMetricsContent = () => {
  const classes = useObservabilityMetricsPageStyles();
  const { entity } = useEntity();

  const namespace =
    entity.metadata.annotations?.[CHOREO_ANNOTATIONS.NAMESPACE] || '';
  const projectName = entity.metadata.name || '';

  const {
    environments,
    loading: environmentsLoading,
    status: environmentsStatus,
  } = useProjectEnvironments(projectName, namespace);

  const {
    components,
    loading: componentsLoading,
    error: componentsError,
  } = useGetComponentsByProject(entity);

  const { filters, updateFilters } = useUrlFilters({ environments });

  // Off by default. A deep link that already names components opens with the
  // breakdown on, so the URL and the switch agree on first paint. Not written
  // to the URL: the `components` param is the only state a link needs.
  const [breakdownEnabled, setBreakdownEnabled] = useState(
    () => (filters.components ?? []).length > 0,
  );

  // Per-environment permission (ABAC `resource.environment`) — gates the
  // content and the fetch once an env is selected. See openchoreo#3408.
  const {
    canViewMetrics: canViewMetricsForEnv,
    loading: envPermissionLoading,
    deniedTooltip: envPermissionDenied,
    permissionName: envPermissionName,
  } = useMetricsPermission(filters.environment?.name);

  // Names from the URL are filtered against the project's real components, so a
  // stale `?components=` param naming a deleted component falls back to the
  // aggregate instead of fanning out to a 404. While the list is still loading
  // there is nothing to validate against, so the URL is trusted — otherwise a
  // deep link starts in aggregate mode, fires a wasted request, and swaps the
  // charts once the components resolve.
  const selectedComponents = useMemo(() => {
    if (componentsLoading) return filters.components ?? [];
    const known = new Set(components.map(component => component.name));
    return (filters.components ?? []).filter(name => known.has(name));
  }, [components, componentsLoading, filters.components]);

  const isBreakdown = selectedComponents.length > 0;

  // The project entity carries no component annotation, so `useMetrics` omits
  // the component and the observer answers with the project-wide aggregate.
  const aggregate = useMetrics(
    filters,
    entity,
    namespace,
    projectName,
    'resource',
    canViewMetricsForEnv && !isBreakdown,
  );

  const breakdown = useProjectMetrics(
    filters,
    selectedComponents,
    namespace,
    projectName,
    'resource',
    canViewMetricsForEnv && isBreakdown,
  );

  const metricsLoading = isBreakdown ? breakdown.loading : aggregate.loading;
  const isRefetching = isBreakdown
    ? breakdown.isRefetching
    : aggregate.isRefetching;
  const metricsError = isBreakdown ? breakdown.error : aggregate.error;
  const refreshMetrics = isBreakdown ? breakdown.refresh : aggregate.refresh;

  const aggregateMetrics = aggregate.metrics as ResourceMetrics | null;
  const byComponent = useMemo(
    () =>
      (breakdown.metrics as ProjectResourceMetrics | undefined)?.byComponent ??
      {},
    [breakdown.metrics],
  );
  const failedComponents =
    (breakdown.metrics as ProjectResourceMetrics | undefined)
      ?.failedComponents ?? [];

  const cpuSeries = useMemo(
    () => buildProjectSeries<ResourceMetrics>(byComponent, m => m.cpuUsage),
    [byComponent],
  );
  const memorySeries = useMemo(
    () => buildProjectSeries<ResourceMetrics>(byComponent, m => m.memoryUsage),
    [byComponent],
  );
  // One card per metric: CPU usage/requests/limits, then the same for memory.
  // Order follows the component chart's line order so both tabs read alike.
  const breakdownCharts = useMemo(
    () =>
      (
        [
          ['cpu', cpuSeries],
          ['memory', memorySeries],
        ] as const
      ).flatMap(([usageType, series]) =>
        Object.values(getMetricConfigs(usageType)).map(({ key }) => ({
          usageType,
          metricKey: key,
          series,
        })),
      ),
    [cpuSeries, memorySeries],
  );

  const theme = useTheme();
  const dark = theme.palette.type === 'dark';

  // Colour keys off the whole selection, not just the components that returned
  // data, so a component keeps its colour across time-range changes.
  const colorOf = useMemo(
    () => componentColorResolver(selectedComponents, dark),
    [selectedComponents, dark],
  );

  const [refreshNonce, setRefreshNonce] = useState(0);

  const handleFiltersChange = (newFilters: Partial<typeof filters>) => {
    updateFilters(newFilters);
  };

  const handleRefresh = () => {
    refreshMetrics();
    setRefreshNonce(prev => prev + 1);
  };

  // Switching off returns to the aggregate: the selection is cleared rather
  // than kept hidden, so the charts and the URL match the switch.
  const handleBreakdownChange = (enabled: boolean) => {
    setBreakdownEnabled(enabled);
    if (!enabled) {
      updateFilters({ components: [] });
    }
  };

  const renderError = (error: string) => {
    const isObservabilityDisabled = error.includes(
      'Observability is not enabled',
    );

    return (
      <Alert
        severity={isObservabilityDisabled ? 'info' : 'error'}
        className={classes.errorContainer}
      >
        <Typography variant="body1">
          {isObservabilityDisabled
            ? 'Observability is not enabled for this project in the current environment. Enable observability to view metrics.'
            : error}
        </Typography>
        {!isObservabilityDisabled && (
          <Button onClick={handleRefresh} color="inherit" size="small">
            Retry
          </Button>
        )}
      </Alert>
    );
  };

  if (environmentsLoading) {
    return <PageLoader />;
  }

  // When the pipeline has no resolvable environments (empty, forbidden, or
  // unavailable) there's nothing to filter or chart — show only the notice.
  if (environmentsStatus !== 'ok') {
    return (
      <Box>
        <EnvironmentsStatusNotice
          status={environmentsStatus}
          feature="metrics"
        />
      </Box>
    );
  }

  if (componentsError) {
    return <Box>{renderError(componentsError)}</Box>;
  }

  // A project with no components still has a meaningful aggregate, so the
  // charts stay. Only say the project is empty once the aggregate is empty too.
  const isEmptyProject =
    !componentsLoading &&
    components.length === 0 &&
    !metricsLoading &&
    !hasAnyPoints(aggregateMetrics);

  return (
    <Box position="relative">
      <RefreshOverlay active={isRefetching} label="Refreshing metrics" />

      <MetricsFilters
        filters={filters}
        onFiltersChange={handleFiltersChange}
        environments={environments}
        environmentsLoading={environmentsLoading}
        components={components}
        componentsLoading={componentsLoading}
        componentsDisabled={!breakdownEnabled}
        disabled={metricsLoading}
      />

      {filters.environment &&
        !envPermissionLoading &&
        !canViewMetricsForEnv && (
          <ForbiddenState
            message={envPermissionDenied}
            permissionName={envPermissionName}
            variant="compact"
          />
        )}

      {isEmptyProject && (
        <Alert severity="info" className={classes.errorContainer}>
          <Typography variant="body1">
            No components in this project.
          </Typography>
        </Alert>
      )}

      {canViewMetricsForEnv && metricsError && renderError(metricsError)}

      {/* Partial success: the charts below are real, they are just missing the
          named components. An error alert would overstate it. */}
      {canViewMetricsForEnv && failedComponents.length > 0 && (
        <Alert severity="info" className={classes.errorContainer}>
          <Typography variant="body1">
            No metrics for{' '}
            {failedComponents.map(component => component.name).join(', ')}.
            Observability may not be enabled for{' '}
            {failedComponents.length === 1 ? 'it' : 'them'} in this environment.
          </Typography>
        </Alert>
      )}

      {canViewMetricsForEnv && (
        <>
          <MetricsActions
            onRefresh={handleRefresh}
            disabled={metricsLoading}
            breakdownEnabled={breakdownEnabled}
            onBreakdownChange={handleBreakdownChange}
          />
          <Grid container spacing={4} className={classes.metricsGridContainer}>
            {isBreakdown ? (
              breakdownCharts.map(({ usageType, metricKey, series }) => (
                <Grid item xs={12} md={4} key={metricKey}>
                  <Card>
                    <CardHeader title={formatMetricName(metricKey)} />
                    <Divider />
                    <CardContent>
                      <ProjectMetricGraph
                        seriesByComponent={series}
                        metricKey={metricKey}
                        colorOf={colorOf}
                        usageType={usageType}
                        timeRange={filters.timeRange}
                        customStartTime={filters.customStartTime}
                        customEndTime={filters.customEndTime}
                      />
                    </CardContent>
                  </Card>
                </Grid>
              ))
            ) : (
              <>
                <Grid item xs={12} md={6}>
                  <Card>
                    <CardHeader title="CPU Usage" />
                    <Divider />
                    <CardContent>
                      <MetricGraphByComponent
                        usageData={
                          aggregateMetrics?.cpuUsage || ({} as CpuUsageMetrics)
                        }
                        usageType="cpu"
                        timeRange={filters.timeRange}
                        customStartTime={filters.customStartTime}
                        customEndTime={filters.customEndTime}
                      />
                    </CardContent>
                  </Card>
                </Grid>
                <Grid item xs={12} md={6}>
                  <Card>
                    <CardHeader title="Memory Usage" />
                    <Divider />
                    <CardContent>
                      <MetricGraphByComponent
                        usageData={
                          aggregateMetrics?.memoryUsage ||
                          ({} as MemoryUsageMetrics)
                        }
                        usageType="memory"
                        timeRange={filters.timeRange}
                        customStartTime={filters.customStartTime}
                        customEndTime={filters.customEndTime}
                      />
                    </CardContent>
                  </Card>
                </Grid>
              </>
            )}
            {isBreakdown ? (
              <ProjectHTTPMetricsSection
                filters={filters}
                components={selectedComponents}
                namespaceName={namespace}
                project={projectName}
                refreshNonce={refreshNonce}
                enabled={canViewMetricsForEnv}
              />
            ) : (
              <HTTPMetricsSection
                filters={filters}
                entity={entity}
                namespaceName={namespace}
                project={projectName}
                refreshNonce={refreshNonce}
              />
            )}
          </Grid>
        </>
      )}
    </Box>
  );
};

export const ObservabilityProjectMetricsPage = () => {
  const {
    canViewMetrics,
    loading: permissionLoading,
    deniedTooltip,
    permissionName,
  } = useMetricsPermission();

  if (permissionLoading) {
    return <PageLoader />;
  }

  if (!canViewMetrics) {
    return (
      <ForbiddenState
        message={deniedTooltip}
        permissionName={permissionName}
        variant="fullpage"
      />
    );
  }

  return <ObservabilityProjectMetricsContent />;
};
