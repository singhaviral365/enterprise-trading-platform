import { ComponentFixture, TestBed } from '@angular/core/testing';
import { DialogService } from '../../../core/dialog.service';
import { Dialog } from './dialog';

describe('Dialog', () => {
  let fixture: ComponentFixture<Dialog>;
  let service: DialogService;
  let root: HTMLElement;

  const element = () => root.querySelector('dialog')!;
  const footerButtons = () => Array.from(root.querySelectorAll<HTMLButtonElement>('.modal-footer button'));

  beforeEach(async () => {
    fixture = TestBed.createComponent(Dialog);
    service = TestBed.inject(DialogService);
    root = fixture.nativeElement as HTMLElement;
    await fixture.whenStable();
  });

  it('stays closed until something asks for confirmation', () => {
    expect(element().open).toBe(false);
  });

  it('opens with the requested title, message and button labels', async () => {
    void service.confirm({ title: 'Cancel order?', message: 'This cannot be undone.', confirmText: 'Cancel it', cancelText: 'Keep it' });
    await fixture.whenStable();

    expect(element().open).toBe(true);
    expect(root.querySelector('#app-dialog-title')?.textContent).toContain('Cancel order?');
    expect(root.querySelector('#app-dialog-message')?.textContent).toContain('This cannot be undone.');
    expect(footerButtons().map((b) => b.textContent?.trim())).toEqual(['Keep it', 'Cancel it']);
  });

  it('resolves true from the confirm button and closes', async () => {
    const answer = service.confirm();
    await fixture.whenStable();

    footerButtons()[1].click();
    await fixture.whenStable();

    await expect(answer).resolves.toBe(true);
    expect(element().open).toBe(false);
  });

  it.each([
    ['the cancel button', (root: HTMLElement) => root.querySelectorAll<HTMLButtonElement>('.modal-footer button')[0].click()],
    ['the close icon', (root: HTMLElement) => root.querySelector<HTMLButtonElement>('[aria-label="Close dialog"]')!.click()],
    ['Esc', (root: HTMLElement) => root.querySelector('dialog')!.dispatchEvent(new Event('cancel', { cancelable: true }))],
    ['a click on the backdrop', (root: HTMLElement) => root.querySelector('dialog')!.click()],
  ])('resolves false from %s', async (_name, act) => {
    const answer = service.confirm();
    await fixture.whenStable();

    act(root);
    await fixture.whenStable();

    await expect(answer).resolves.toBe(false);
  });

  it('does not close on a click inside the panel', async () => {
    void service.confirm();
    await fixture.whenStable();

    root.querySelector<HTMLElement>('.modal-body')!.click();

    expect(service.isOpen()).toBe(true);
  });

  it.each([
    ['error', 'is-error', 'is-success'],
    ['warning', 'is-warning', 'is-success'],
    ['success', 'is-success', 'is-secondary'],
    ['info', 'is-info', 'is-secondary'],
  ] as const)('styles a %s dialog with %s, and highlights the safe choice', async (type, confirmClass, cancelClass) => {
    void service.confirm({ type });
    await fixture.whenStable();

    const [cancel, confirm] = footerButtons();
    expect(confirm.classList.contains(confirmClass)).toBe(true);
    expect(cancel.classList.contains(cancelClass)).toBe(true);
    expect(root.querySelector('.modal-content')?.classList.contains(`is-${type}`)).toBe(true);
  });
});
