import { HealthController } from './health.controller';

describe('HealthController', () => {
  it('says ok', () => {
    expect(new HealthController().getHealth()).toEqual({ status: 'ok' });
  });
});
