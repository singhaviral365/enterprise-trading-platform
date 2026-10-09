import { RunOutcome, StrategyStatus } from '../../api/generated/strategies';
import { canCancel, canSwitchOff, canSwitchOn, outcomeLook, statusLook } from './strategy-look';

describe('strategy look', () => {
  it('gives every status and every outcome a word, an icon, a tone and a sentence', () => {
    for (const status of Object.values(StrategyStatus)) {
      const look = statusLook(status);
      expect(look.label, status).not.toBe('');
      expect(look.icon, status).toMatch(/^fas fa-/);
      expect(look.hint.length, status).toBeGreaterThan(10);
    }
    for (const outcome of Object.values(RunOutcome)) {
      const look = outcomeLook(outcome);
      expect(look.label, outcome).not.toBe('');
      expect(look.icon, outcome).toMatch(/^fas fa-/);
    }
  });

  it('lets a strategy be switched off while it watches or runs, and on only once it is off', () => {
    expect([StrategyStatus.Active, StrategyStatus.Executing].every(canSwitchOff)).toBe(true);
    expect(canSwitchOff(StrategyStatus.Disabled)).toBe(false);
    expect(canSwitchOn(StrategyStatus.Disabled)).toBe(true);
    expect(canSwitchOn(StrategyStatus.Active)).toBe(false);
  });

  it('lets anything that is not final be cancelled, and nothing that is', () => {
    expect([StrategyStatus.Active, StrategyStatus.Executing, StrategyStatus.Disabled].every(canCancel)).toBe(true);
    for (const final of [StrategyStatus.Executed, StrategyStatus.Cancelled, StrategyStatus.Expired, StrategyStatus.Failed]) {
      expect(canCancel(final), final).toBe(false);
      expect(canSwitchOff(final), final).toBe(false);
      expect(canSwitchOn(final), final).toBe(false);
    }
  });
});
