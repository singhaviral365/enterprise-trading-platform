import { Component } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Tooltip } from './tooltip';

@Component({
  imports: [Tooltip],
  template: `
    <app-tooltip text="Helpful hint" position="bottom" [disabled]="disabled">
      <button type="button">Target</button>
    </app-tooltip>
  `,
})
class Host {
  disabled = false;
}

describe('Tooltip', () => {
  let fixture: ComponentFixture<Host>;
  let root: HTMLElement;

  const anchor = () => root.querySelector<HTMLElement>('.tooltip-anchor')!;
  const tip = () => root.querySelector<HTMLElement>('[role="tooltip"]');

  beforeEach(async () => {
    fixture = TestBed.createComponent(Host);
    root = fixture.nativeElement as HTMLElement;
    await fixture.whenStable();
  });

  it('is hidden until hovered, then shows its text in the requested position', async () => {
    expect(tip()).toBeNull();

    anchor().dispatchEvent(new Event('mouseenter'));
    await fixture.whenStable();
    expect(tip()?.textContent).toContain('Helpful hint');
    expect(tip()?.getAttribute('data-position')).toBe('bottom');

    anchor().dispatchEvent(new Event('mouseleave'));
    await fixture.whenStable();
    expect(tip()).toBeNull();
  });

  it('also shows on keyboard focus and hides on blur', async () => {
    anchor().dispatchEvent(new Event('focusin'));
    await fixture.whenStable();
    expect(tip()).not.toBeNull();

    anchor().dispatchEvent(new Event('focusout'));
    await fixture.whenStable();
    expect(tip()).toBeNull();
  });

  it('is dismissed by Esc but not by other keys', async () => {
    anchor().dispatchEvent(new Event('mouseenter'));
    await fixture.whenStable();

    anchor().dispatchEvent(new KeyboardEvent('keydown', { key: 'a' }));
    await fixture.whenStable();
    expect(tip()).not.toBeNull();

    anchor().dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    await fixture.whenStable();
    expect(tip()).toBeNull();
  });

  it('stays hidden while disabled', async () => {
    fixture.componentInstance.disabled = true;
    fixture.changeDetectorRef.markForCheck();
    await fixture.whenStable();

    anchor().dispatchEvent(new Event('mouseenter'));
    await fixture.whenStable();

    expect(tip()).toBeNull();
  });
});
