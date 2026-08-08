import { screen } from '@testing-library/react';
import { renderInTestApp } from '@backstage/test-utils';
import { EntityProvider } from '@backstage/plugin-catalog-react';
import { ObservabilityProjectMetricsPage } from './ObservabilityProjectMetricsPage';

// ---- Mocks (own hooks and child components only) ----

const mockUseMetricsPermission = jest.fn();
const mockUseProjectEnvironments = jest.fn();
jest.mock('@openchoreo/backstage-plugin-react', () => ({
  useMetricsPermission: (...args: any[]) => mockUseMetricsPermission(...args),
  ForbiddenState: ({ message, variant }: any) => (
    <div data-testid={`forbidden-state-${variant}`}>{message}</div>
  ),
  useProjectEnvironments: (...args: any[]) =>
    mockUseProjectEnvironments(...args),
}));

const mockUseGetComponentsByProject = jest.fn();
const mockUseProjectMetrics = jest.fn();
const mockUseUrlFilters = jest.fn();
const mockUseDataPlaneNetPolProvider = jest.fn();

jest.mock('../../hooks', () => ({
  useGetComponentsByProject: (...args: any[]) =>
    mockUseGetComponentsByProject(...args),
  useProjectMetrics: (...args: any[]) => mockUseProjectMetrics(...args),
  useUrlFilters: (...args: any[]) => mockUseUrlFilters(...args),
  useDataPlaneNetPolProvider: (...args: any[]) =>
    mockUseDataPlaneNetPolProvider(...args),
}));

jest.mock('./MetricsFilters', () => ({
  MetricsFilters: ({ components }: any) => (
    <div data-testid="metrics-filters">
      <span data-testid="component-count">{components.length}</span>
    </div>
  ),
}));

jest.mock('./ProjectMetricGraph', () => ({
  ProjectMetricGraph: ({ usageType, seriesByComponent }: any) => (
    <div
      data-testid={`project-graph-${usageType}`}
      data-series={Object.keys(seriesByComponent).join(',')}
    />
  ),
}));

jest.mock('./MetricsActions', () => ({
  MetricsActions: ({ onRefresh }: any) => (
    <button data-testid="refresh-btn" onClick={onRefresh}>
      Refresh
    </button>
  ),
}));

// ---- Helpers ----

const projectEntity = {
  apiVersion: 'backstage.io/v1alpha1',
  kind: 'System',
  metadata: {
    name: 'latency-lab',
    annotations: { 'openchoreo.io/namespace': 'dev-ns' },
  },
  spec: { owner: 'team-a' },
};

const defaultEnvironment = {
  uid: 'env-1',
  name: 'development',
  namespace: 'dev-ns',
  displayName: 'Development',
  isProduction: false,
  createdAt: '2024-01-01T00:00:00Z',
  dataPlaneRef: { kind: 'DataPlane', name: 'default-dp' },
};

const resourceMetricsFor = (names: string[]) => ({
  byComponent: Object.fromEntries(
    names.map(name => [
      name,
      {
        cpuUsage: {
          cpuUsage: [{ timestamp: '2026-03-05T10:00:00.000Z', value: 0.5 }],
          cpuRequests: [],
          cpuLimits: [],
        },
        memoryUsage: {
          memoryUsage: [{ timestamp: '2026-03-05T10:00:00.000Z', value: 1024 }],
          memoryRequests: [],
          memoryLimits: [],
        },
      },
    ]),
  ),
  failedComponents: [],
});

function renderPage() {
  return renderInTestApp(
    <EntityProvider entity={projectEntity}>
      <ObservabilityProjectMetricsPage />
    </EntityProvider>,
  );
}

function setupDefaultMocks() {
  mockUseDataPlaneNetPolProvider.mockReturnValue({
    networkPolicyProvider: 'calico',
    loading: false,
  });
  mockUseMetricsPermission.mockReturnValue({
    canViewMetrics: true,
    loading: false,
    deniedTooltip: '',
    permissionName: '',
  });
  mockUseProjectEnvironments.mockReturnValue({
    environments: [defaultEnvironment],
    loading: false,
    status: 'ok',
    error: null,
  });
  mockUseGetComponentsByProject.mockReturnValue({
    components: [{ name: 'api' }, { name: 'db' }],
    loading: false,
    isRefetching: false,
    error: null,
  });
  mockUseUrlFilters.mockReturnValue({
    filters: { environment: defaultEnvironment, timeRange: '1h' },
    updateFilters: jest.fn(),
  });
  mockUseProjectMetrics.mockReturnValue({
    metrics: resourceMetricsFor(['api', 'db']),
    loading: false,
    isRefetching: false,
    error: undefined,
    refresh: jest.fn(),
  });
}

// ---- Tests ----

describe('ObservabilityProjectMetricsPage', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    setupDefaultMocks();
  });

  it('renders CPU and Memory charts with one series per component', async () => {
    await renderPage();

    expect(screen.getByText('CPU Usage')).toBeInTheDocument();
    expect(screen.getByText('Memory Usage')).toBeInTheDocument();
    expect(screen.getByTestId('project-graph-cpu')).toHaveAttribute(
      'data-series',
      'api,db',
    );
    expect(screen.getByTestId('project-graph-memory')).toHaveAttribute(
      'data-series',
      'api,db',
    );
  });

  it('shows the fullpage forbidden state when the user lacks metrics permission', async () => {
    mockUseMetricsPermission.mockReturnValue({
      canViewMetrics: false,
      loading: false,
      deniedTooltip: 'No metrics access',
      permissionName: 'openchoreo.metrics.view',
    });

    await renderPage();

    expect(screen.getByTestId('forbidden-state-fullpage')).toBeInTheDocument();
    expect(screen.queryByTestId('project-graph-cpu')).not.toBeInTheDocument();
  });

  it('shows a compact forbidden state and no charts when the environment is denied', async () => {
    // Page-level permission granted, per-environment denied.
    mockUseMetricsPermission.mockImplementation((envName?: string) =>
      envName
        ? {
            canViewMetrics: false,
            loading: false,
            deniedTooltip: 'No access to development',
            permissionName: 'openchoreo.metrics.view',
          }
        : {
            canViewMetrics: true,
            loading: false,
            deniedTooltip: '',
            permissionName: '',
          },
    );

    await renderPage();

    expect(screen.getByTestId('forbidden-state-compact')).toBeInTheDocument();
    expect(screen.queryByTestId('project-graph-cpu')).not.toBeInTheDocument();
    // The gate is passed to the hook so it fires no requests.
    expect(mockUseProjectMetrics).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      'dev-ns',
      'latency-lab',
      'resource',
      false,
    );
  });

  it('renders only the environments notice when environments are unavailable', async () => {
    mockUseProjectEnvironments.mockReturnValue({
      environments: [],
      loading: false,
      status: 'unavailable',
      error: null,
    });

    await renderPage();

    expect(screen.queryByTestId('metrics-filters')).not.toBeInTheDocument();
    expect(screen.queryByTestId('project-graph-cpu')).not.toBeInTheDocument();
  });

  it('shows an empty state and no charts when the project has no components', async () => {
    mockUseGetComponentsByProject.mockReturnValue({
      components: [],
      loading: false,
      isRefetching: false,
      error: null,
    });
    mockUseProjectMetrics.mockReturnValue({
      metrics: undefined,
      loading: false,
      isRefetching: false,
      error: undefined,
      refresh: jest.fn(),
    });

    await renderPage();

    expect(
      screen.getByText('No components in this project.'),
    ).toBeInTheDocument();
    expect(screen.queryByTestId('project-graph-cpu')).not.toBeInTheDocument();
  });

  it('renders the surviving charts plus an info notice on partial failure', async () => {
    mockUseProjectMetrics.mockReturnValue({
      metrics: {
        ...resourceMetricsFor(['api']),
        failedComponents: [
          { name: 'db', error: 'Observability is not enabled for component db' },
        ],
      },
      loading: false,
      isRefetching: false,
      error: undefined,
      refresh: jest.fn(),
    });

    await renderPage();

    expect(screen.getByTestId('project-graph-cpu')).toHaveAttribute(
      'data-series',
      'api',
    );
    expect(screen.getByText(/No metrics for db/)).toBeInTheDocument();
  });

  it('treats observability-disabled as info, not an error', async () => {
    mockUseProjectMetrics.mockReturnValue({
      metrics: undefined,
      loading: false,
      isRefetching: false,
      error: 'Observability is not enabled for this project',
      refresh: jest.fn(),
    });

    await renderPage();

    expect(
      screen.getByText(/Observability is not enabled for this project/),
    ).toBeInTheDocument();
    // The info variant offers no Retry button.
    expect(screen.queryByText('Retry')).not.toBeInTheDocument();
  });
});
