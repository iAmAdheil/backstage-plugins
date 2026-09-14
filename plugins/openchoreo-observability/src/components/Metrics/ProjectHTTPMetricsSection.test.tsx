import { screen } from '@testing-library/react';
import { renderInTestApp } from '@backstage/test-utils';
import { ProjectHTTPMetricsSection } from './ProjectHTTPMetricsSection';

// ---- Mocks (own hooks and child components only) ----

const mockUseProjectMetrics = jest.fn();
const mockUseDataPlaneNetPolProvider = jest.fn();

jest.mock('../../hooks', () => ({
  useProjectMetrics: (...args: any[]) => mockUseProjectMetrics(...args),
  useDataPlaneNetPolProvider: (...args: any[]) =>
    mockUseDataPlaneNetPolProvider(...args),
}));

jest.mock('./ProjectMetricGraph', () => ({
  ProjectMetricGraph: ({ usageType, lines }: any) => (
    <div
      data-testid={`project-graph-${lines[0]?.metricKey ?? 'empty'}`}
      data-usage-type={usageType}
      data-components={[...new Set(lines.map((line: any) => line.component))]
        .sort()
        .join(',')}
    />
  ),
}));

// ---- Helpers ----

const defaultEnvironment = {
  uid: 'env-1',
  name: 'development',
  namespace: 'dev-ns',
  displayName: 'Development',
  isProduction: false,
  createdAt: '2024-01-01T00:00:00Z',
  dataPlaneRef: { kind: 'DataPlane', name: 'default-dp' },
};

const at = (value: number) => [
  { timestamp: '2026-03-05T10:00:00.000Z', value },
];

// The keys `getMetricConfigs` declares for each group. There is one card per
// key, so a made-up key would simply produce no card.
const httpMetrics = {
  networkThroughput: {
    requestCount: at(12),
    successfulRequestCount: at(11),
    unsuccessfulRequestCount: at(1),
  },
  networkLatency: {
    meanLatency: at(30),
    latencyP50: at(25),
    latencyP90: at(40),
    latencyP99: at(55),
  },
};

function renderSection(components: string[] = ['api', 'worker']) {
  return renderInTestApp(
    <ProjectHTTPMetricsSection
      filters={{ environment: defaultEnvironment, timeRange: '1h' } as any}
      components={components}
      namespaceName="dev-ns"
      project="url-shortener"
      refreshNonce={0}
      enabled
    />,
  );
}

// ---- Tests ----

describe('ProjectHTTPMetricsSection', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUseDataPlaneNetPolProvider.mockReturnValue({
      networkPolicyProvider: 'cilium',
      loading: false,
    });
    mockUseProjectMetrics.mockReturnValue({
      metrics: {
        byComponent: { api: httpMetrics, worker: httpMetrics },
        failedComponents: [],
      },
      error: undefined,
      refresh: jest.fn(),
    });
  });

  it('charts every component that returned data', async () => {
    await renderSection();

    expect(screen.getByTestId('project-graph-requestCount')).toHaveAttribute(
      'data-components',
      'api,worker',
    );
    expect(screen.queryByText(/No HTTP metrics for/)).not.toBeInTheDocument();
  });

  it('gives each metric its own card, throughput first, then latency', async () => {
    await renderSection();

    const cards = Array.from(document.querySelectorAll('[data-usage-type]'));
    expect(
      cards.map(card => [
        card.getAttribute('data-usage-type'),
        card.getAttribute('data-testid')!.replace('project-graph-', ''),
      ]),
    ).toEqual([
      ['networkThroughput', 'requestCount'],
      ['networkThroughput', 'successfulRequestCount'],
      ['networkThroughput', 'unsuccessfulRequestCount'],
      ['networkLatency', 'meanLatency'],
      ['networkLatency', 'latencyP50'],
      ['networkLatency', 'latencyP90'],
      ['networkLatency', 'latencyP99'],
    ]);
    [
      'Request Count',
      'Successful Request Count',
      'Unsuccessful Request Count',
      'Mean Latency',
      'Latency P50',
      'Latency P90',
      'Latency P99',
    ].forEach(title => {
      expect(screen.getByText(title)).toBeInTheDocument();
    });
  });

  it('renders the surviving charts and names the failed components', async () => {
    mockUseProjectMetrics.mockReturnValue({
      metrics: {
        byComponent: { api: httpMetrics },
        failedComponents: [{ name: 'worker', error: 'nope' }],
      },
      error: undefined,
      refresh: jest.fn(),
    });

    await renderSection();

    expect(screen.getByTestId('project-graph-requestCount')).toHaveAttribute(
      'data-components',
      'api',
    );
    expect(screen.getByText(/No HTTP metrics for worker/)).toBeInTheDocument();
    expect(screen.getByText(/enabled for it/)).toBeInTheDocument();
  });

  it('pluralises the notice for several failed components', async () => {
    mockUseProjectMetrics.mockReturnValue({
      metrics: {
        byComponent: {},
        failedComponents: [
          { name: 'api', error: 'nope' },
          { name: 'worker', error: 'nope' },
        ],
      },
      error: undefined,
      refresh: jest.fn(),
    });

    await renderSection();

    expect(
      screen.getByText(/No HTTP metrics for api, worker/),
    ).toBeInTheDocument();
    expect(screen.getByText(/enabled for them/)).toBeInTheDocument();
  });

  it('shows the error alert instead of the notice when every request failed', async () => {
    mockUseProjectMetrics.mockReturnValue({
      metrics: undefined,
      error: 'Fan-out failed',
      refresh: jest.fn(),
    });

    await renderSection();

    expect(screen.getByText('Fan-out failed')).toBeInTheDocument();
    expect(screen.queryByText(/No HTTP metrics for/)).not.toBeInTheDocument();
  });

  it('renders nothing when the data plane is not on cilium', async () => {
    mockUseDataPlaneNetPolProvider.mockReturnValue({
      networkPolicyProvider: 'none',
      loading: false,
    });

    await renderSection();

    expect(
      screen.queryByTestId('project-graph-requestCount'),
    ).not.toBeInTheDocument();
  });
});
