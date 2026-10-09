import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { SPLIT_ASIDE_MIN_WIDTH, SplitView } from './split-view';

@Component({
  imports: [SplitView],
  template: `
    <app-split-view #split [open]="open()" [aside]="aside()" labelledBy="detail-title" testId="pane" (closed)="onClosed()">
      <ul list data-testid="the-list">
        <li>one</li>
      </ul>
      <div detail>
        @if (open()) {
          <h2 id="detail-title" data-testid="the-detail">Detail</h2>
        }
      </div>
      <div aside>
        @if (split.asideVisible()) {
          <p data-testid="the-aside">Aside</p>
        }
      </div>
    </app-split-view>
  `,
})
class Host {
  readonly open = signal(false);
  readonly aside = signal(false);
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

/** A controllable stand-in for ResizeObserver: tests call `widthTo(...)` to resize every observed element. */
function mockResizeObserver() {
  const callbacks = new Set<(entries: { contentRect: { width: number } }[]) => void>();
  vi.stubGlobal(
    'ResizeObserver',
    class {
      constructor(private readonly callback: (entries: { contentRect: { width: number } }[]) => void) {
        callbacks.add(callback);
      }
      observe(): void {}
      disconnect(): void {
        callbacks.delete(this.callback);
      }
    },
  );
  return {
    widthTo(width: number) {
      callbacks.forEach((callback) => callback([{ contentRect: { width } }]));
    },
    observers: callbacks,
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

  describe('compact list and the aside', () => {
    beforeEach(() => mockMatchMedia(true));

    it('is compact only while a detail is open beside the list', async () => {
      const { fixture, host } = create();
      const split = fixture.debugElement.children[0].componentInstance as import('./split-view').SplitView;
      await fixture.whenStable();
      expect(split.compact()).toBe(false);

      host.open.set(true);
      await fixture.whenStable();
      expect(split.compact()).toBe(true);

      host.open.set(false);
      await fixture.whenStable();
      expect(split.compact()).toBe(false);
    });

    it('shows the aside only when a page wants one, a detail is open and the container is wide enough', async () => {
      const resize = mockResizeObserver();
      const { fixture, root, host, byTestId } = create();
      await fixture.whenStable();

      host.open.set(true);
      await fixture.whenStable();
      resize.widthTo(1200);
      await fixture.whenStable();
      expect(byTestId('the-aside')).toBeNull();
      expect(root.querySelector('.split')!.classList.contains('has-aside')).toBe(false);

      host.aside.set(true);
      await fixture.whenStable();
      expect(byTestId('the-aside')).toBeTruthy();
      expect(root.querySelector('.split')!.classList.contains('has-aside')).toBe(true);
      expect(byTestId('split-aside')).toBeTruthy();

      host.open.set(false);
      await fixture.whenStable();
      expect(byTestId('the-aside')).toBeNull();
    });

    it('drops the aside below the minimum width and brings it back above it', async () => {
      const resize = mockResizeObserver();
      const { fixture, host, byTestId } = create();
      host.open.set(true);
      host.aside.set(true);
      await fixture.whenStable();

      resize.widthTo(SPLIT_ASIDE_MIN_WIDTH);
      await fixture.whenStable();
      expect(byTestId('the-aside')).toBeTruthy();

      resize.widthTo(SPLIT_ASIDE_MIN_WIDTH - 1);
      await fixture.whenStable();
      expect(byTestId('the-aside')).toBeNull();

      resize.widthTo(1500);
      await fixture.whenStable();
      expect(byTestId('the-aside')).toBeTruthy();
    });

    it('stops observing when destroyed', async () => {
      const resize = mockResizeObserver();
      const { fixture } = create();
      await fixture.whenStable();
      expect(resize.observers.size).toBe(1);

      fixture.destroy();

      expect(resize.observers.size).toBe(0);
    });

    it('asks to be closed on Escape inside the aside too', async () => {
      const resize = mockResizeObserver();
      const { fixture, host, byTestId } = create();
      host.open.set(true);
      host.aside.set(true);
      await fixture.whenStable();
      resize.widthTo(1400);
      await fixture.whenStable();

      byTestId('split-aside')!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));

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

    it('has no aside and no compact list: the list keeps its width and the detail is a dialog', async () => {
      mockMatchMedia(false);
      const resize = mockResizeObserver();
      const { fixture, root, host, byTestId } = create();
      host.open.set(true);
      host.aside.set(true);
      await fixture.whenStable();
      resize.widthTo(2000);
      await fixture.whenStable();

      expect(byTestId('the-aside')).toBeNull();
      expect(root.querySelector('aside')).toBeNull();
      expect((fixture.debugElement.children[0].componentInstance as import('./split-view').SplitView).compact()).toBe(false);
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
