import { Service, signal } from '@angular/core';

export type DialogType = 'info' | 'success' | 'warning' | 'error';

export interface DialogConfig {
  title?: string;
  message?: string;
  type?: DialogType;
  confirmText?: string;
  cancelText?: string;
}

export type DialogOptions = Required<DialogConfig>;

const DEFAULTS: DialogOptions = {
  title: 'Confirm',
  message: 'Are you sure?',
  type: 'info',
  confirmText: 'Yes',
  cancelText: 'No',
};

/**
 * Promise-based confirmation dialog. Render `<app-dialog />` once (the app shell does) and
 * call `await dialog.confirm({...})` from anywhere; it resolves `true` on confirm, `false` otherwise.
 */
@Service()
export class DialogService {
  private readonly open = signal(false);
  private readonly current = signal<DialogOptions>(DEFAULTS);
  private resolver: ((confirmed: boolean) => void) | null = null;

  readonly isOpen = this.open.asReadonly();
  readonly options = this.current.asReadonly();

  confirm(config: DialogConfig = {}): Promise<boolean> {
    // Only one dialog at a time: settle any dialog that is still waiting as "cancelled".
    this.settle(false);
    this.current.set({ ...DEFAULTS, ...config });
    this.open.set(true);
    return new Promise<boolean>((resolve) => {
      this.resolver = resolve;
    });
  }

  proceed(): void {
    this.settle(true);
  }

  cancel(): void {
    this.settle(false);
  }

  private settle(confirmed: boolean): void {
    this.open.set(false);
    this.resolver?.(confirmed);
    this.resolver = null;
  }
}
