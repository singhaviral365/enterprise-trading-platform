import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { SplitView } from './split-view';

@Component({
  imports: [SplitView],
  template: `
    <app-split-view [open]="open()" labelledBy="detail-title" testId="pane" (closed)="onClosed()">
      <ul list data-testid="the-list">
        <li>one</li>
      </ul>
      <div detail>
        @if (open()) {
          <h2 id="detail-title" data-testid="the-detail">Detail</h2>
        }
      </div>
    </app-split-view>
  `,
})
class Host {
  readonly open = signal(false);
  readonly onClosed = vi.fn();
}

type Listener = (event: { matches: boolean }) => void;

/** A controllable stand-in for the wide-screen media query. */
function mockMatchMedia(matches: boolean) {
  const listeners = new Set<Listener>();
  const query = {
    matches,
    addEventListener: (_: string, listener: Listener) => listeners.add(listener),
    removeEventListener: (_: string, listener: Listener) => listeners.delete(listener),
  };
  vi.stubGlobal(
    'matchMedia',
    vi.fn(() => query),
  );
  return {
    resize(next: boolean) {
      query.matches = next;
      listeners.forEach((listener) => listener({ matches: next }));
    },
    listeners,
  };
}

describe('SplitView', () => {
  afterEach(() => vi.unstubAllGlobals());

  function create() {
    const fixture = TestBed.createComponent(Host);
    const root = fixture.nativeElement as HTMLElement;
    return {
      fixture,
      root,
      host: fixture.componentInstance,
      byTestId: (id: string) => root.querySelector<HTMLElement>(`[data-testid="${id}"]`),
    };
  }

  describe('on a wide screen', () => {
    beforeEach(() => mockMatchMedia(true));

    it('shows the list alone until something is selected, then slides the detail in beside it', async () => {
      const { fixture, root, host, byTestId } = create();
      await fixture.whenStable();

      expect(byTestId('the-list')).toBeTruthy();
      expect(root.querySelector('.split')?.classList.contains('is-open')).toBe(false);
      expect(byTestId('the-detail')).toBeNull();
      expect(root.querySelector('dialog')).toBeNull();

      host.open.set(true);
      await fixture.whenStable();

      expect(root.querySelector('.split')?.classList.contains('is-open')).toBe(true);
      expect(root.querySelector('aside [data-testid="the-detail"]')).toBeTruthy();
      expect(byTestId('pane')?.getAttribute('aria-labelledby')).toBe('detail-title');
      expect(root.querySelector('dialog')).toBeNull();
    });

    it('closes the pane again', async () => {
      const { fixture, root, host } = create();
      host.open.set(true);
      await fixture.whenStable();

      host.open.set(false);
      await fixture.whenStable();

      expect(root.querySelector('.split')?.classList.contains('is-open')).toBe(false);
      expect(root.querySelector('[data-testid="the-detail"]')).toBeNull();
    });

    it('asks to be closed on Escape inside the pane, and moves focus to the pane when it opens', async () => {
      const { fixture, host, byTestId } = create();
      host.open.set(true);
      await fixture.whenStable();
      await Promise.resolve();

      expect(document.activeElement).toBe(byTestId('pane'));

      byTestId('pane')!.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }),
      );

      expect(host.onClosed).toHaveBeenCalledTimes(1);
    });
  });

  describe('on a narrow screen', () => {
    it('opens the same detail in a modal dialog instead, with the list full width', async () => {
      mockMatchMedia(false);
      const { fixture, root, host, byTestId } = create();
      host.open.set(true);
      await fixture.whenStable();

      expect(root.querySelector('aside')).toBeNull();
      expect(root.querySelector('.split')?.classList.contains('is-open')).toBe(false);
      const dialog = byTestId('pane') as HTMLDialogElement;
      expect(dialog.tagName).toBe('DIALOG');
      expect(dialog.open).toBe(true);
      expect(dialog.querySelector('[data-testid="the-detail"]')).toBeTruthy();
    });

    it('uses a dialog too when the browser has no matchMedia', async () => {
      vi.stubGlobal('matchMedia', undefined);
      const { fixture, root, host } = create();
      host.open.set(true);
      await fixture.whenStable();

      expect(root.querySelector('dialog')).toBeTruthy();
    });

    it('asks to be closed from a backdrop click or Escape on the dialog', async () => {
      mockMatchMedia(false);
      const { fixture, host, byTestId } = create();
      host.open.set(true);
      await fixture.whenStable();
      const dialog = byTestId('pane') as HTMLDialogElement;

      dialog.click();
      dialog.dispatchEvent(new Event('cancel', { cancelable: true }));

      expect(host.onClosed).toHaveBeenCalledTimes(2);
    });
  });

  it('switches layout when the window crosses the breakpoint, keeping the selection', async () => {
    const media = mockMatchMedia(true);
    const { fixture, root, host } = create();
    host.open.set(true);
    await fixture.whenStable();
    expect(root.querySelector('aside')).toBeTruthy();

    media.resize(false);
    await fixture.whenStable();
    expect(root.querySelector('aside')).toBeNull();
    expect((root.querySelector('dialog') as HTMLDialogElement).open).toBe(true);
    expect(root.querySelector('[data-testid="the-detail"]')).toBeTruthy();

    media.resize(true);
    await fixture.whenStable();
    expect(root.querySelector('aside [data-testid="the-detail"]')).toBeTruthy();
  });

  it('stops listening to the media query when it is destroyed', async () => {
    const media = mockMatchMedia(true);
    const { fixture } = create();
    await fixture.whenStable();
    expect(media.listeners.size).toBe(1);

    fixture.destroy();

    expect(media.listeners.size).toBe(0);
  });
});
