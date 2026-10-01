import { TestBed } from '@angular/core/testing';
import { ThemeService } from './theme.service';

describe('ThemeService', () => {
  const html = () => document.documentElement;

  /** jsdom has no matchMedia, so supply one answering the dark-scheme query. */
  const prefersDark = (matches: boolean) =>
    Object.defineProperty(window, 'matchMedia', {
      configurable: true,
      writable: true,
      value: () => ({ matches }) as MediaQueryList,
    });

  afterEach(() => {
    Reflect.deleteProperty(window, 'matchMedia');
    vi.restoreAllMocks();
    html().removeAttribute('data-theme');
  });

  it('applies a stored theme to the page', () => {
    localStorage.setItem('theme', 'dark');
    const theme = TestBed.inject(ThemeService);

    TestBed.tick();

    expect(theme.isDark()).toBe(true);
    expect(html().getAttribute('data-theme')).toBe('dark');
  });

  it('follows the system preference when nothing is stored', () => {
    prefersDark(true);

    expect(TestBed.inject(ThemeService).isDark()).toBe(true);
  });

  it('defaults to light when the system prefers light', () => {
    prefersDark(false);

    expect(TestBed.inject(ThemeService).isDark()).toBe(false);
  });

  it('toggles, updates the page and persists the choice', () => {
    localStorage.setItem('theme', 'light');
    const theme = TestBed.inject(ThemeService);
    TestBed.tick();

    theme.toggle();
    TestBed.tick();

    expect(theme.isDark()).toBe(true);
    expect(html().getAttribute('data-theme')).toBe('dark');
    expect(localStorage.getItem('theme')).toBe('dark');
  });

  it('still works when storage is blocked', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    prefersDark(false);

    const theme = TestBed.inject(ThemeService);
    theme.toggle();
    TestBed.tick();

    expect(html().getAttribute('data-theme')).toBe('dark');
  });
});
