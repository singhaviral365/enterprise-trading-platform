import { Component, ElementRef, inject, signal, viewChild } from '@angular/core';
import { RouterLink } from '@angular/router';

/**
 * The chatbot icon: a round button at the bottom-right that opens a small assistant panel. It is shown only to
 * customers who switched the AI assistant on in Settings (`app.html` decides), so nobody who did not ask for it ever
 * sees it.
 *
 * There is no assistant service behind it yet, so the panel says so plainly instead of pretending to answer. When one
 * exists, the conversation goes where the message is now; the icon, the setting and the open / close behaviour stay.
 */
@Component({
  selector: 'app-chat-assistant',
  imports: [RouterLink],
  templateUrl: './chat-assistant.html',
  styleUrl: './chat-assistant.css',
  host: { '(keydown.escape)': 'close()' },
})
export class ChatAssistant {
  private readonly trigger = viewChild.required<ElementRef<HTMLButtonElement>>('trigger');

  protected readonly open = signal(false);

  protected toggle(): void {
    this.open.update((isOpen) => !isOpen);
  }

  /** Closes the panel and puts focus back on the icon, so a keyboard user is not left nowhere. */
  protected close(): void {
    if (this.open()) {
      this.open.set(false);
      this.trigger().nativeElement.focus();
    }
  }
}
