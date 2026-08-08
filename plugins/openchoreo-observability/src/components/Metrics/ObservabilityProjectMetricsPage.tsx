import { useMemo, useState } from 'react';
import { PageLoader, RefreshOverlay } from '@openchoreo/backstage-design-system';
import {
  Grid,
  Card,
  CardContent,
  CardHeader,
  Divider,
  Button,
  Typography,
  Box,
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
import { ProjectMetricGraph } from './ProjectMetricGraph';
import { ProjectHTTPMetricsSection } from './ProjectHTTPMetricsSection';
import { pickComponentSeries } from './projectMetricsSeries';
import {
  useGetComponentsByProject,
  useProjectMetrics,
  useUrlFilters,
} from '../../hooks';
import { EnvironmentsStatusNotice } from '../common';
import { ProjectResourceMetrics, ResourceMetrics } from '../../types';
import { useObservabilityMetricsPageStyles } from './styles';

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

  // Per-environment permission (ABAC `resource.environment`) — gates the
  // content and the fan-out once an env is selected. See openchoreo#3408.
  const {
    canViewMetrics: canViewMetricsForEnv,
    loading: envPermissionLoading,
    deniedTooltip: envPermissionDenied,
    permissionName: envPermissionName,
  } = useMetricsPermission(filters.environment?.name);

  // An empty selection means "all components" — same convention as the project
  // logs filter, so the two tabs behave identically.
  const selectedComponents = useMemo(() => {
    const all = components.map(component => component.name);
    const picked = filters.components ?? [];
    return picked.length > 0 ? picked.filter(name => all.includes(name)) : all;
  }, [components, filters.components]);

  const {
    metrics,
    loading: metricsLoading,
    isRefetching,
    error: metricsError,
    refresh,
  } = useProjectMetrics(
    filters,
    selectedComponents,
    namespace,
    projectName,
    'resource',
    canViewMetricsForEnv,
  );
  const resourceMetrics = metrics as ProjectResourceMetrics | undefined;

  const byComponent = useMemo(
    () => resourceMetrics?.byComponent ?? {},
    [resourceMetrics],
  );
  const failedComponents = resourceMetrics?.failedComponents ?? [];

  const cpuSeries = useMemo(
    () =>
      pickComponentSeries<ResourceMetrics>(
        byComponent,
        m => m.cpuUsage?.cpuUsage,
      ),
    [byComponent],
  );
  const memorySeries = useMemo(
    () =>
      pickComponentSeries<ResourceMetrics>(
        byComponent,
        m => m.memoryUsage?.memoryUsage,
      ),
    [byComponent],
  );

  const [refreshNonce, setRefreshNonce] = useState(0);

  const handleFiltersChange = (newFilters: Partial<typeof filters>) => {
    updateFilters(newFilters);
  };

  const handleRefresh = () => {
    refresh();
    setRefreshNonce(prev => prev + 1);
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

  const hasNoComponents = !componentsLoading && components.length === 0;

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
        disabled={metricsLoading}
      />

      {filters.environment && !envPermissionLoading && !canViewMetricsForEnv && (
        <ForbiddenState
          message={envPermissionDenied}
          permissionName={envPermissionName}
          variant="compact"
        />
      )}

      {hasNoComponents && (
        <Alert severity="info" className={classes.errorContainer}>
          <Typography variant="body1">No components in this project.</Typography>
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

      {canViewMetricsForEnv && !hasNoComponents && (
        <>
          <MetricsActions onRefresh={handleRefresh} disabled={metricsLoading} />
          <Grid container spacing={4} className={classes.metricsGridContainer}>
            <Grid item xs={12} md={6}>
              <Card>
                <CardHeader title="CPU Usage" />
                <Divider />
                <CardContent>
                  <ProjectMetricGraph
                    seriesByComponent={cpuSeries}
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
                  <ProjectMetricGraph
                    seriesByComponent={memorySeries}
                    usageType="memory"
                    timeRange={filters.timeRange}
                    customStartTime={filters.customStartTime}
                    customEndTime={filters.customEndTime}
                  />
                </CardContent>
              </Card>
            </Grid>
            <ProjectHTTPMetricsSection
              filters={filters}
              components={selectedComponents}
              namespaceName={namespace}
              project={projectName}
              refreshNonce={refreshNonce}
              enabled={canViewMetricsForEnv}
            />
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
