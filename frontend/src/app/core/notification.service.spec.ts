import { TestBed } from '@angular/core/testing';
import { NotificationService } from './notification.service';

describe('NotificationService', () => {
  let service: NotificationService;

  beforeEach(() => {
    vi.useFakeTimers();
    service = TestBed.inject(NotificationService);
  });

  afterEach(() => vi.useRealTimers());

  it('adds a toast per call with the matching type', () => {
    service.success('saved');
    service.error('broke');
    service.warning('careful');
    service.info('fyi');

    expect(service.notifications().map((n) => [n.type, n.message])).toEqual([
      ['success', 'saved'],
      ['error', 'broke'],
      ['warning', 'careful'],
      ['info', 'fyi'],
    ]);
    expect(new Set(service.notifications().map((n) => n.id)).size).toBe(4);
  });

  it('removes a toast after its duration', () => {
    service.show('bye', 'info', 1000);
    vi.advanceTimersByTime(999);
    expect(service.notifications()).toHaveLength(1);

    vi.advanceTimersByTime(1);
    expect(service.notifications()).toHaveLength(0);
  });

  it('keeps a toast with duration 0 until it is dismissed', () => {
    service.show('stay', 'info', 0);
    vi.advanceTimersByTime(60_000);
    expect(service.notifications()).toHaveLength(1);

    service.dismiss(service.notifications()[0].id);
    expect(service.notifications()).toHaveLength(0);
  });
});
