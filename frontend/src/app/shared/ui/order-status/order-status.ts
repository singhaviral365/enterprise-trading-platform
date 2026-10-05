import { Component, computed, input } from '@angular/core';
import { OrderStatus } from '../../../api/generated/trade';

interface BadgeLook {
  readonly label: string;
  readonly icon: string;
  readonly tone: 'is-working' | 'is-filled' | 'is-rejected' | 'is-cancelled';
  readonly description: string;
}

const LOOKS: Readonly<Record<OrderStatus, BadgeLook>> = {
  [OrderStatus.New]: {
    label: 'Working',
    icon: 'fas fa-hourglass-half',
    tone: 'is-working',
    description: 'New: still working, not yet filled',
  },
  [OrderStatus.Filled]: { label: 'Filled', icon: 'fas fa-circle-check', tone: 'is-filled', description: 'Filled' },
  [OrderStatus.Rejected]: {
    label: 'Rejected',
    icon: 'fas fa-circle-xmark',
    tone: 'is-rejected',
    description: 'Rejected',
  },
  [OrderStatus.Cancelled]: { label: 'Cancelled', icon: 'fas fa-ban', tone: 'is-cancelled', description: 'Cancelled' },
};

/**
 * Order status as a badge. Colour is never the only signal: every status has its own word and its own
 * icon shape, so it still reads for people who cannot tell red from green.
 */
@Component({
  selector: 'app-order-status',
  template: `
    <span [class]="'order-badge ' + look().tone" [attr.title]="look().description" data-testid="order-status">
      <i [class]="look().icon" aria-hidden="true"></i>
      {{ look().label }}
    </span>
  `,
  styleUrl: './order-status.css',
})
export class OrderStatusBadge {
  readonly status = input.required<OrderStatus>();

  protected readonly look = computed(() => LOOKS[this.status()]);
}
