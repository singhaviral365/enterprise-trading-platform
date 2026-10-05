import { Component, inject } from '@angular/core';
import { AuthDialogService } from '../../core/auth-dialog.service';

interface Feature {
  readonly icon: string;
  readonly title: string;
  readonly text: string;
}

/** Public landing page. Sign-in and registration open in the shared auth dialog. */
@Component({
  selector: 'app-home',
  templateUrl: './home.html',
  styleUrl: './home.css',
})
export class Home {
  protected readonly authDialog = inject(AuthDialogService);

  protected readonly features: readonly Feature[] = [
    {
      icon: 'fas fa-bolt',
      title: 'Fast order execution',
      text: 'Place market and limit orders and see them fill in real time.',
    },
    {
      icon: 'fas fa-chart-pie',
      title: 'Portfolio at a glance',
      text: 'Track holdings, cash and performance from one dashboard.',
    },
    {
      icon: 'fas fa-shield-halved',
      title: 'Secure by default',
      text: 'Token-based sign-in keeps your account and trades protected.',
    },
  ];
}
