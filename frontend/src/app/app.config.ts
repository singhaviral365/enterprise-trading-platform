import {
  ApplicationConfig,
  inject,
  provideAppInitializer,
  provideBrowserGlobalErrorListeners,
} from '@angular/core';
import { provideHttpClient, withFetch, withInterceptors } from '@angular/common/http';
import { provideRouter } from '@angular/router';

import { routes } from './app.routes';
import { ACCESS_TOKEN_PROVIDER } from './core/auth/access-token.provider';
import { authInterceptor } from './core/auth.interceptor';
import { authInterceptor as platformApiInterceptor } from './core/interceptors/auth.interceptor';
import { SessionService } from './core/session.service';
import { ThemeService } from './core/theme.service';
import { provideApiClients } from './api/api.config';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideRouter(routes),
    provideHttpClient(withFetch(), withInterceptors([authInterceptor, platformApiInterceptor])),
    provideApiClients(),
    // The generated API clients and their guard read the token from the signed-in session.
    {
      provide: ACCESS_TOKEN_PROVIDER,
      useFactory: () => {
        const session = inject(SessionService);
        return { getAccessToken: () => session.accessToken(), isAuthenticated: () => session.isLoggedIn() };
      },
    },
    // Instantiate early so the saved theme is applied before the first paint.
    provideAppInitializer(() => {
      inject(ThemeService);
    }),
  ],
};
