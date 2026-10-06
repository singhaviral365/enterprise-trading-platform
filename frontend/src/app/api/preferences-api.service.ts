import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';

import { Preferences, PreferencesRequest, PreferencesService } from './generated/preferences';

/**
 * App-facing wrapper over the generated Preferences client (the preferences module of the Trade REST API).
 * The generated service exposes observe/reportProgress overloads; callers here just get the response body.
 */
@Injectable({ providedIn: 'root' })
export class PreferencesApi {
  private readonly preferences = inject(PreferencesService);

  /** The saved preferences of an account, or the defaults while it has never saved any. */
  get(accountId: number): Observable<Preferences> {
    return this.preferences.getPreferences(accountId);
  }

  /** Replaces the whole document. */
  replace(accountId: number, request: PreferencesRequest): Observable<Preferences> {
    return this.preferences.replacePreferences(accountId, request);
  }
}
