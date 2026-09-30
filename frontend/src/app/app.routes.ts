import { Routes } from '@angular/router';

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
        // Preview page for the shared UI components. Safe to delete along with ./showcase.
        path: 'showcase',
        title: 'Component showcase',
        loadComponent: () => import('./showcase/showcase').then((m) => m.Showcase),
      },
    ],
  },
  // Unknown URLs are guarded too, so a signed-out visitor is sent to sign-in.
  { path: '**', canActivate: [authGuard], children: [] },
];
