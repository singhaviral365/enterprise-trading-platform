import { Service, inject } from '@angular/core';

import { NotificationService } from '../notification.service';
import { describeError } from './describe-error';

/** Shows a failed API call as an error toast: `.subscribe({ error: (e) => notifier.show(e) })`. */
@Service()
export class ApiErrorNotifier {
  private readonly notifications = inject(NotificationService);

  show(error: unknown): void {
    this.notifications.error(describeError(error));
  }
}
