import { TestBed } from '@angular/core/testing';
import { DialogService } from './dialog.service';

describe('DialogService', () => {
  let service: DialogService;

  beforeEach(() => {
    service = TestBed.inject(DialogService);
  });

  it('opens with defaults merged under the given options', () => {
    void service.confirm({ title: 'Cancel order?', type: 'warning' });

    expect(service.isOpen()).toBe(true);
    expect(service.options()).toEqual({
      title: 'Cancel order?',
      message: 'Are you sure?',
      type: 'warning',
      confirmText: 'Yes',
      cancelText: 'No',
    });
  });

  it('resolves true on proceed and closes', async () => {
    const answer = service.confirm();
    service.proceed();

    await expect(answer).resolves.toBe(true);
    expect(service.isOpen()).toBe(false);
  });

  it('resolves false on cancel and closes', async () => {
    const answer = service.confirm();
    service.cancel();

    await expect(answer).resolves.toBe(false);
    expect(service.isOpen()).toBe(false);
  });

  it('settles a dialog still waiting as cancelled when another opens', async () => {
    const first = service.confirm({ title: 'First' });
    const second = service.confirm({ title: 'Second' });

    await expect(first).resolves.toBe(false);
    expect(service.options().title).toBe('Second');
    service.proceed();
    await expect(second).resolves.toBe(true);
  });
});
