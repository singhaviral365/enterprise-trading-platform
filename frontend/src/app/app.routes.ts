import { Routes } from '@angular/router';
import { authGuard, guestGuard } from './core/auth.guards';

import { authGuard } from './core/guards/auth.guard';

export const routes: Routes = [
  // Sign-in is the only unguarded route. Its component belongs to the sign-in story.
  { path: 'sign-in', children: [] },
  // Every other route goes under here so the guard runs for all of them.
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
        // Preview page for the shared UI components. Safe to delete along with ./showcase.
        path: 'showcase',
        title: 'Component showcase',
        loadComponent: () => import('./showcase/showcase').then((m) => m.Showcase),
      },
    ],
  },
  {
    path: '',
    pathMatch: 'full',
    title: 'Trading Platform',
    canActivate: [guestGuard],
    loadComponent: () => import('./features/home/home').then((m) => m.Home),
  },
  { path: '**', redirectTo: '' },
];
