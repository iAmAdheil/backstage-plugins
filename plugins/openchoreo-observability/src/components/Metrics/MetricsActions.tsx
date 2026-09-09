import {
  Box,
  Typography,
  Button,
  FormControlLabel,
  Switch,
} from '@material-ui/core';
import Refresh from '@material-ui/icons/Refresh';
import { useMetricsActionsStyles } from './styles';

interface MetricsActionsProps {
  disabled: boolean;
  onRefresh: () => void;
  /** Project-level only. When set, a switch that turns the per-component
   *  breakdown on and off renders next to Refresh. The component page omits
   *  it, so nothing renders there. */
  breakdownEnabled?: boolean;
  onBreakdownChange?: (enabled: boolean) => void;
}

export const MetricsActions = ({
  disabled,
  onRefresh,
  breakdownEnabled = false,
  onBreakdownChange,
}: MetricsActionsProps) => {
  const classes = useMetricsActionsStyles();
  return (
    <Box className={classes.statsContainer}>
      <Box>
        <Typography variant="body2" color="textSecondary">
          Last updated at: {new Date().toLocaleString()}
        </Typography>
      </Box>
      <Box className={classes.actionsContainer}>
        {onBreakdownChange && (
          <FormControlLabel
            control={
              <Switch
                checked={breakdownEnabled}
                onChange={event => onBreakdownChange(event.target.checked)}
                color="primary"
              />
            }
            label="Enable Component Level Breakdown"
          />
        )}
        <Button
          variant="outlined"
          startIcon={<Refresh />}
          onClick={onRefresh}
          disabled={disabled}
        >
          Refresh
        </Button>
        {/* TODO: Add Auto Refresh Button */}
      </Box>
    </Box>
  );
};
