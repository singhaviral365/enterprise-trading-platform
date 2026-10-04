import { ComponentFixture, TestBed } from '@angular/core/testing';
import { InstrumentIcon } from './instrument-icon';

describe('InstrumentIcon', () => {
  let fixture: ComponentFixture<InstrumentIcon>;
  let root: HTMLElement;

  const image = () => root.querySelector<HTMLImageElement>('img');
  const fallback = () => root.querySelector('[data-testid="instrument-icon-fallback"]');

  async function render(symbol: string, iconUrl: string | null): Promise<void> {
    fixture.componentRef.setInput('symbol', symbol);
    fixture.componentRef.setInput('iconUrl', iconUrl);
    await fixture.whenStable();
  }

  beforeEach(() => {
    fixture = TestBed.createComponent(InstrumentIcon);
    root = fixture.nativeElement as HTMLElement;
  });

  it('shows the company logo as a decorative image at the requested size', async () => {
    fixture.componentRef.setInput('size', 48);
    await render('AAPL', '/assets/icons/AAPL.svg');

    expect(image()?.getAttribute('src')).toBe('/assets/icons/AAPL.svg');
    expect(image()?.getAttribute('alt')).toBe('');
    expect(image()?.getAttribute('width')).toBe('48');
    expect(fallback()).toBeNull();
    expect(root.style.getPropertyValue('--icon-size')).toBe('48px');
  });

  it('shows the symbol initials when the instrument has no icon', async () => {
    await render('msft', null);

    expect(image()).toBeNull();
    expect(fallback()?.textContent?.trim()).toBe('MS');
  });

  it('falls back to the initials when the file is missing, and tries again for a different URL', async () => {
    await render('AAPL', '/assets/icons/AAPL.svg');

    image()!.dispatchEvent(new Event('error'));
    await fixture.whenStable();
    expect(image()).toBeNull();
    expect(fallback()?.textContent?.trim()).toBe('AA');

    await render('AAPL', '/assets/icons/AAPL.png');
    expect(image()?.getAttribute('src')).toBe('/assets/icons/AAPL.png');
  });
});
