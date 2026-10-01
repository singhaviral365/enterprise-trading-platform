import { Routes } from '@angular/router';
import { authGuard, guestGuard } from './core/auth.guards';

export const routes: Routes = [
  {
    path: '',
    pathMatch: 'full',
    title: 'Trading Platform',
    canActivate: [guestGuard],
    loadComponent: () => import('./features/home/home').then((m) => m.Home),
  },
  {
    path: 'dashboard',
    title: 'Dashboard | Trading Platform',
    canActivate: [authGuard],
    loadComponent: () => import('./features/dashboard/dashboard').then((m) => m.Dashboard),
  },
  {
    // Preview page for the shared UI components. Safe to delete along with ./showcase.
    path: 'showcase',
    title: 'Component showcase',
    loadComponent: () => import('./showcase/showcase').then((m) => m.Showcase),
  },
  { path: '**', redirectTo: '' },
];
