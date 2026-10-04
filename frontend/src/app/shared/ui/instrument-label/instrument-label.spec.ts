import { ComponentFixture, TestBed } from '@angular/core/testing';
import { InstrumentLabel } from './instrument-label';

describe('InstrumentLabel', () => {
  let fixture: ComponentFixture<InstrumentLabel>;
  let root: HTMLElement;

  beforeEach(() => {
    fixture = TestBed.createComponent(InstrumentLabel);
    root = fixture.nativeElement as HTMLElement;
    fixture.componentRef.setInput('symbol', 'INFY.NS');
  });

  it('shows the logo, the symbol and the company name', async () => {
    fixture.componentRef.setInput('name', 'Infosys Ltd');
    fixture.componentRef.setInput('iconUrl', '/assets/icons/INFY.NS.svg');
    await fixture.whenStable();

    expect(root.querySelector('.label-symbol')?.textContent).toBe('INFY.NS');
    expect(root.querySelector('.label-name')?.textContent).toBe('Infosys Ltd');
    expect(root.querySelector('img')?.getAttribute('src')).toBe('/assets/icons/INFY.NS.svg');
  });

  it('drops the name line when there is no name, and falls back to initials without a logo', async () => {
    await fixture.whenStable();

    expect(root.querySelector('.label-name')).toBeNull();
    expect(root.querySelector('img')).toBeNull();
    expect(
      root.querySelector('[data-testid="instrument-icon-fallback"]')?.textContent?.trim(),
    ).toBe('IN');
  });
});
