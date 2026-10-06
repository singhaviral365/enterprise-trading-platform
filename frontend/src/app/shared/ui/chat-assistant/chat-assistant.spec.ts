import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';

import { ChatAssistant } from './chat-assistant';

describe('ChatAssistant', () => {
  let fixture: ComponentFixture<ChatAssistant>;
  let root: HTMLElement;

  const byTestId = <T extends HTMLElement>(id: string) => root.querySelector<T>(`[data-testid="${id}"]`);

  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [ChatAssistant], providers: [provideRouter([])] }).compileComponents();
    fixture = TestBed.createComponent(ChatAssistant);
    root = fixture.nativeElement as HTMLElement;
    await fixture.whenStable();
  });

  it('is an icon button, with the panel closed', () => {
    const icon = byTestId<HTMLButtonElement>('chat-assistant-button')!;

    expect(icon.getAttribute('aria-label')).toBe('Open assistant');
    expect(icon.getAttribute('aria-expanded')).toBe('false');
    expect(byTestId('chat-assistant-panel')).toBeNull();
  });

  it('opens and closes the panel from the icon', async () => {
    const icon = byTestId<HTMLButtonElement>('chat-assistant-button')!;

    icon.click();
    await fixture.whenStable();
    expect(byTestId('chat-assistant-panel')).toBeTruthy();
    expect(icon.getAttribute('aria-expanded')).toBe('true');

    icon.click();
    await fixture.whenStable();
    expect(byTestId('chat-assistant-panel')).toBeNull();
  });

  it('says plainly that no assistant is connected yet, and where to turn the icon off', async () => {
    byTestId<HTMLButtonElement>('chat-assistant-button')!.click();
    await fixture.whenStable();

    expect(byTestId('chat-assistant-message')?.textContent).toContain('not connected yet');
    expect(root.querySelector('a[href="/settings"]')).toBeTruthy();
  });

  it('closes on Escape and the close button, returning focus to the icon', async () => {
    const icon = byTestId<HTMLButtonElement>('chat-assistant-button')!;
    document.body.append(root);

    icon.click();
    await fixture.whenStable();
    root.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    await fixture.whenStable();
    expect(byTestId('chat-assistant-panel')).toBeNull();
    expect(document.activeElement).toBe(icon);

    icon.click();
    await fixture.whenStable();
    byTestId<HTMLButtonElement>('chat-assistant-close')!.click();
    await fixture.whenStable();
    expect(byTestId('chat-assistant-panel')).toBeNull();

    root.remove();
  });
});
