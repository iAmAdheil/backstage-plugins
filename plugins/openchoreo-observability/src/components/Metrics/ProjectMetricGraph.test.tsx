import { render, screen } from '@testing-library/react';
import { ProjectMetricGraph } from './ProjectMetricGraph';

// Recharts renders to SVG via ResizeObserver, which jsdom does not provide.
// Stub the primitives so the test can assert on the series/legend the chart
// declares rather than on pixels.
jest.mock('recharts', () => ({
  LineChart: ({ children, ...rest }: any) => (
    <div data-testid="line-chart" data-points={(rest.data ?? []).length}>
      {children}
    </div>
  ),
  Line: ({ dataKey, name, stroke }: any) => (
    <div data-testid="line" data-key={dataKey} data-name={name} data-stroke={stroke} />
  ),
  XAxis: () => <div data-testid="x-axis" />,
  YAxis: () => <div data-testid="y-axis" />,
  CartesianGrid: () => <div data-testid="grid" />,
  Tooltip: () => <div data-testid="tooltip" />,
  Legend: () => <div data-testid="legend" />,
}));

const point = (timestamp: string, value: number) => ({ timestamp, value });

const seriesFor = (names: string[]) =>
  Object.fromEntries(
    names.map((name, i) => [
      name,
      [
        point('2026-03-05T10:00:00.000Z', i + 1),
        point('2026-03-05T10:01:00.000Z', i + 2),
      ],
    ]),
  );

describe('ProjectMetricGraph', () => {
  it('renders one line per component, named after the component', () => {
    render(
      <ProjectMetricGraph
        seriesByComponent={seriesFor(['api', 'db', 'worker'])}
        usageType="cpu"
        timeRange="1h"
      />,
    );

    const lines = screen.getAllByTestId('line');
    expect(lines).toHaveLength(3);
    expect(lines.map(l => l.getAttribute('data-name'))).toEqual([
      'api',
      'db',
      'worker',
    ]);
    expect(lines.map(l => l.getAttribute('data-key'))).toEqual([
      'api',
      'db',
      'worker',
    ]);
  });

  it('renders the empty overlay and no lines for empty input', () => {
    render(
      <ProjectMetricGraph
        seriesByComponent={{}}
        usageType="cpu"
        timeRange="1h"
      />,
    );

    expect(screen.queryAllByTestId('line')).toHaveLength(0);
    expect(screen.getByText('No data available')).toBeInTheDocument();
  });

  it('drops components whose series is empty instead of throwing', () => {
    render(
      <ProjectMetricGraph
        seriesByComponent={{ ...seriesFor(['api']), silent: [] }}
        usageType="memory"
        timeRange="1h"
      />,
    );

    const lines = screen.getAllByTestId('line');
    expect(lines).toHaveLength(1);
    expect(lines[0].getAttribute('data-name')).toBe('api');
  });

  it('keeps the colour palette bounded for a large project', () => {
    const names = Array.from({ length: 24 }, (_, i) => `component-${i}`);
    render(
      <ProjectMetricGraph
        seriesByComponent={seriesFor(names)}
        usageType="cpu"
        timeRange="1h"
      />,
    );

    const lines = screen.getAllByTestId('line');
    expect(lines).toHaveLength(24);
    // Every component still gets a line; the palette cycles rather than
    // inventing 24 near-identical hues.
    const colours = new Set(lines.map(l => l.getAttribute('data-stroke')));
    expect(colours.size).toBe(12);
  });
});
