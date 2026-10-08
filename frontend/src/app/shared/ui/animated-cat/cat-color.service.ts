import { Injectable, signal } from '@angular/core';
import { Router, NavigationEnd } from '@angular/router';
import { filter } from 'rxjs/operators';

export type CatColor = 'orange' | 'gray' | 'white' | 'black' | 'brown';

/**
 * Service to manage animated cat color based on current route.
 * Each page/route can have a different colored cat.
 */
@Injectable({
  providedIn: 'root',
})
export class CatColorService {
  private colorMap: Map<string, CatColor> = new Map([
    ['dashboard', 'orange'],
    ['market', 'gray'],
    ['portfolio', 'black'],
    ['orders', 'brown'],
    ['strategies', 'white'],
    ['settings', 'orange'],
  ]);

  currentCatColor = signal<CatColor>('orange');

  constructor(private router: Router) {
    this.setupRouteListener();
  }

  private setupRouteListener() {
    this.router.events
      .pipe(filter((event) => event instanceof NavigationEnd))
      .subscribe((event: any) => {
        const route = event.urlAfterRedirects as string;
        this.updateCatColor(route);
      });
  }

  private updateCatColor(route: string) {
    // Extract the first part of the route (e.g., 'dashboard' from '/dashboard')
    const parts = route.split('/').filter((p) => p);
    const primaryRoute = parts[0] || 'dashboard';

    const color = this.colorMap.get(primaryRoute) || 'orange';
    this.currentCatColor.set(color);
  }

  /**
   * Set a custom color for a specific route
   */
  setColorForRoute(route: string, color: CatColor) {
    this.colorMap.set(route, color);
  }
}
