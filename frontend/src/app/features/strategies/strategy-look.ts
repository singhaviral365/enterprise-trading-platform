import { RunOutcome, StrategyStatus } from '../../api/generated/strategies';

/** How a status or an outcome is shown: always a word and an icon, colour is only a third signal. */
export interface Look {
  readonly label: string;
  /** Font Awesome classes. */
  readonly icon: string;
  readonly tone: 'info' | 'success' | 'warning' | 'error' | 'neutral';
  /** One sentence for the customer on what it means. */
  readonly hint: string;
}

const STATUS_LOOKS: Readonly<Record<StrategyStatus, Look>> = {
  [StrategyStatus.Active]: {
    label: 'Watching',
    icon: 'fas fa-eye',
    tone: 'info',
    hint: 'Waiting for the price to reach your trigger.',
  },
  [StrategyStatus.Executing]: {
    label: 'Running',
    icon: 'fas fa-gears',
    tone: 'warning',
    hint: 'The trigger was met and the platform is placing the order right now.',
  },
  [StrategyStatus.Disabled]: {
    label: 'Switched off',
    icon: 'fas fa-power-off',
    tone: 'neutral',
    hint: 'You switched it off. It will not place any order until you switch it back on.',
  },
  [StrategyStatus.Executed]: {
    label: 'Done',
    icon: 'fas fa-circle-check',
    tone: 'success',
    hint: 'It placed all the orders it was allowed to.',
  },
  [StrategyStatus.Cancelled]: {
    label: 'Cancelled',
    icon: 'fas fa-ban',
    tone: 'neutral',
    hint: 'You cancelled it.',
  },
  [StrategyStatus.Expired]: {
    label: 'Expired',
    icon: 'fas fa-hourglass-end',
    tone: 'neutral',
    hint: 'Its end date passed before it finished.',
  },
  [StrategyStatus.Failed]: {
    label: 'Stopped',
    icon: 'fas fa-triangle-exclamation',
    tone: 'error',
    hint: 'The platform stopped it after repeated failures. It will place no more orders.',
  },
};

const OUTCOME_LOOKS: Readonly<Record<RunOutcome, Look>> = {
  [RunOutcome.Ordered]: {
    label: 'Order placed',
    icon: 'fas fa-circle-check',
    tone: 'success',
    hint: 'The platform placed the order.',
  },
  [RunOutcome.Duplicate]: {
    label: 'Order already placed',
    icon: 'fas fa-circle-check',
    tone: 'success',
    hint: 'An earlier attempt had already placed this order, so nothing was placed twice.',
  },
  [RunOutcome.BlockedLimit]: {
    label: 'Held back by your limit',
    icon: 'fas fa-shield-halved',
    tone: 'warning',
    hint: 'One of the limits you set stopped the order before it was placed.',
  },
  [RunOutcome.Rejected]: {
    label: 'Order refused',
    icon: 'fas fa-circle-xmark',
    tone: 'error',
    hint: 'The order route refused the order.',
  },
  [RunOutcome.ApiError]: {
    label: 'Order not placed',
    icon: 'fas fa-plug-circle-xmark',
    tone: 'error',
    hint: 'The order could not be sent, so nothing was placed.',
  },
  [RunOutcome.Stale]: {
    label: 'Price too old',
    icon: 'fas fa-clock',
    tone: 'neutral',
    hint: 'The trigger was met, but the price was too old to trade on.',
  },
  [RunOutcome.Disabled]: {
    label: 'Switched off first',
    icon: 'fas fa-power-off',
    tone: 'neutral',
    hint: 'You switched the strategy off before the order was sent, so no order was placed.',
  },
};

export function statusLook(status: StrategyStatus): Look {
  return STATUS_LOOKS[status];
}

export function outcomeLook(outcome: RunOutcome): Look {
  return OUTCOME_LOOKS[outcome];
}

/** A strategy can be switched off while it is watching or running, and back on once it is switched off. */
export function canSwitchOff(status: StrategyStatus): boolean {
  return status === StrategyStatus.Active || status === StrategyStatus.Executing;
}

export function canSwitchOn(status: StrategyStatus): boolean {
  return status === StrategyStatus.Disabled;
}

/** Everything that is not final can still be cancelled. */
export function canCancel(status: StrategyStatus): boolean {
  return canSwitchOff(status) || canSwitchOn(status);
}
