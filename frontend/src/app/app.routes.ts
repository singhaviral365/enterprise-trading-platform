import { Routes } from '@angular/router';
import { authGuard, guestGuard } from './core/auth.guards';

export const routes: Routes = [
  // The public home page comes first: the empty-path guarded group below would otherwise match '/'
  // with no child and leave the page blank.
  {
    path: '',
    pathMatch: 'full',
    title: 'Trading Platform',
    canActivate: [guestGuard],
    loadComponent: () => import('./features/home/home').then((m) => m.Home),
  },
  // Signed-in pages: the guard runs for every child route.
  {
    path: '',
    canActivateChild: [authGuard],
    children: [
      {
        path: 'dashboard',
        title: 'Dashboard | Trading Platform',
        loadComponent: () => import('./features/dashboard/dashboard').then((m) => m.Dashboard),
      },
      {
        path: 'orders',
        title: 'Order history | Trading Platform',
        loadComponent: () => import('./features/orders/order-history/order-history').then((m) => m.OrderHistory),
      },
      {
        // Preview page for the shared UI components. Safe to delete along with ./showcase.
        path: 'showcase',
        title: 'Component showcase',
        loadComponent: () => import('./showcase/showcase').then((m) => m.Showcase),
      },
    ],
  },
  { path: '**', redirectTo: '' },
];
