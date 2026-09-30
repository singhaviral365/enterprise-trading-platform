import { Routes } from '@angular/router';

export const routes: Routes = [
  {
    // Preview page for the shared UI components. Safe to delete along with ./showcase.
    path: 'showcase',
    title: 'Component showcase',
    loadComponent: () => import('./showcase/showcase').then((m) => m.Showcase),
  },
];
