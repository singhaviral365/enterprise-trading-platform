import { Service, signal } from '@angular/core';

export type NotificationType = 'success' | 'error' | 'warning' | 'info';

export interface AppNotification {
  readonly id: number;
  readonly message: string;
  readonly type: NotificationType;
}

const DEFAULT_DURATION_MS = 5000;

@Service()
export class NotificationService {
  private readonly items = signal<readonly AppNotification[]>([]);
  private nextId = 0;

  readonly notifications = this.items.asReadonly();

  /** Shows a toast. Pass `durationMs = 0` to keep it until the user dismisses it. */
  show(message: string, type: NotificationType = 'info', durationMs = DEFAULT_DURATION_MS): void {
    const id = this.nextId++;
    this.items.update((list) => [...list, { id, message, type }]);
    if (durationMs > 0) {
      setTimeout(() => this.dismiss(id), durationMs);
    }
  }

  dismiss(id: number): void {
    this.items.update((list) => list.filter((n) => n.id !== id));
  }

  success(message: string): void {
    this.show(message, 'success');
  }

  error(message: string): void {
    this.show(message, 'error');
  }

  warning(message: string): void {
    this.show(message, 'warning');
  }

  info(message: string): void {
    this.show(message, 'info');
  }
}
