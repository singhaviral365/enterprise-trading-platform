import { Service, inject } from '@angular/core';
import { Observable } from 'rxjs';

import { AssistantService, ChatRequest, ChatResponse, SignalsService, TradeSignal } from './generated/signals';

/**
 * App-facing wrapper over the generated Signals clients (the trade signals and assistant module of the Trade REST API).
 * The generated services expose observe/reportProgress overloads; callers here just get the response body.
 */
@Service()
export class SignalsApi {
  private readonly signals = inject(SignalsService);
  private readonly assistant = inject(AssistantService);

  /** The signal for an instrument, with or without the explanation in words. */
  signal(accountId: number, symbol: string, narrative: boolean): Observable<TradeSignal> {
    return this.signals.getSignal(accountId, symbol, undefined, narrative ? 'narrative' : 'numeric');
  }

  chat(request: ChatRequest): Observable<ChatResponse> {
    return this.assistant.chatAboutSignal(request);
  }
}
