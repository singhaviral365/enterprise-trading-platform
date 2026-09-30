import { Component, inject } from '@angular/core';
import { NotificationService } from '../../../core/notification.service';

/** Toast stack. Render `<app-notification />` once in the app shell; push toasts via NotificationService. */
@Component({
  selector: 'app-notification',
  templateUrl: './notification.html',
  styleUrl: './notification.css',
})
export class NotificationCenter {
  protected readonly service = inject(NotificationService);
}
