import { Test } from '@nestjs/testing';
import { AuthGuard } from '../common/guards/auth.guard';
import { AuthService } from '../user/auth.service';
import { NotificationSettingsService } from './notification-settings.service';
import { NotificationsResolver } from './notifications.resolver';

describe('NotificationsResolver', () => {
  let resolver: NotificationsResolver;
  let settings: {
    getConfiguration: jest.Mock;
    getTargets: jest.Mock;
    saveTrigger: jest.Mock;
    deleteTrigger: jest.Mock;
    registerDevice: jest.Mock;
    removeDevice: jest.Mock;
  };

  beforeEach(async () => {
    settings = {
      getConfiguration: jest.fn().mockResolvedValue({ available: false }),
      getTargets: jest.fn().mockResolvedValue([]),
      saveTrigger: jest.fn().mockResolvedValue({ id: 'trigger' }),
      deleteTrigger: jest.fn().mockResolvedValue(true),
      registerDevice: jest.fn().mockResolvedValue('device'),
      removeDevice: jest.fn().mockResolvedValue(true),
    };
    const module = await Test.createTestingModule({
      providers: [
        NotificationsResolver,
        { provide: NotificationSettingsService, useValue: settings },
        { provide: AuthGuard, useValue: { canActivate: () => true } },
        { provide: AuthService, useValue: { verifyToken: () => 'user-id' } },
      ],
    }).compile();
    resolver = module.get(NotificationsResolver);
  });

  it('delegates the account configuration query', async () => {
    await expect(resolver.getConfiguration('user-id')).resolves.toEqual({
      available: false,
    });
    expect(settings.getConfiguration).toHaveBeenCalledWith('user-id');
  });

  it('delegates target search and all mutations with the current user id', async () => {
    const input = { name: 'Linha 1' };
    await resolver.getTargets('rail_line', 'linha');
    await resolver.saveTrigger(input, 'trigger-id', 3, 'user-id');
    await resolver.deleteTrigger('trigger-id', 4, 'user-id');
    await resolver.registerDevice({ endpoint: 'endpoint' }, 'user-id');
    await resolver.removeDevice('device-id', 'user-id');

    expect(settings.getTargets).toHaveBeenCalledWith('rail_line', 'linha');
    expect(settings.saveTrigger).toHaveBeenCalledWith(
      'user-id',
      input,
      'trigger-id',
      3,
    );
    expect(settings.deleteTrigger).toHaveBeenCalledWith(
      'user-id',
      'trigger-id',
      4,
    );
    expect(settings.registerDevice).toHaveBeenCalledWith('user-id', {
      endpoint: 'endpoint',
    });
    expect(settings.removeDevice).toHaveBeenCalledWith('user-id', 'device-id');
  });

  it('rejects an empty device id before calling the service', async () => {
    expect(() => resolver.removeDevice('', 'user-id')).toThrow(
      'Notification device id is required',
    );
    expect(settings.removeDevice).not.toHaveBeenCalled();
  });
});
