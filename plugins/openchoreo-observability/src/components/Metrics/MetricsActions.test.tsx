import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MetricsActions } from './MetricsActions';

// ---- Tests ----

describe('MetricsActions', () => {
  it('displays last updated text', () => {
    render(<MetricsActions disabled={false} onRefresh={jest.fn()} />);

    expect(screen.getByText(/Last updated at:/)).toBeInTheDocument();
  });

  it('shows Refresh button', () => {
    render(<MetricsActions disabled={false} onRefresh={jest.fn()} />);

    expect(
      screen.getByRole('button', { name: /refresh/i }),
    ).toBeInTheDocument();
  });

  it('calls onRefresh when clicked', async () => {
    const user = userEvent.setup();
    const onRefresh = jest.fn();
    render(<MetricsActions disabled={false} onRefresh={onRefresh} />);

    await user.click(screen.getByRole('button', { name: /refresh/i }));

    expect(onRefresh).toHaveBeenCalled();
  });

  it('disables Refresh button when disabled', () => {
    render(<MetricsActions disabled onRefresh={jest.fn()} />);

    expect(screen.getByRole('button', { name: /refresh/i })).toBeDisabled();
  });
});

describe('breakdown switch', () => {
  const label = /enable component level breakdown/i;

  it('is absent on the component page, which passes no handler', () => {
    render(<MetricsActions disabled={false} onRefresh={jest.fn()} />);

    expect(screen.queryByRole('checkbox', { name: label })).toBeNull();
  });

  it('renders off by default when a handler is given', () => {
    render(
      <MetricsActions
        disabled={false}
        onRefresh={jest.fn()}
        onBreakdownChange={jest.fn()}
      />,
    );

    expect(screen.getByRole('checkbox', { name: label })).not.toBeChecked();
  });

  it('reflects the enabled state', () => {
    render(
      <MetricsActions
        disabled={false}
        onRefresh={jest.fn()}
        breakdownEnabled
        onBreakdownChange={jest.fn()}
      />,
    );

    expect(screen.getByRole('checkbox', { name: label })).toBeChecked();
  });

  it('reports the new state when clicked', async () => {
    const user = userEvent.setup();
    const onBreakdownChange = jest.fn();
    render(
      <MetricsActions
        disabled={false}
        onRefresh={jest.fn()}
        onBreakdownChange={onBreakdownChange}
      />,
    );

    await user.click(screen.getByRole('checkbox', { name: label }));

    expect(onBreakdownChange).toHaveBeenCalledWith(true);
  });
});
