import { GUARDS_METADATA } from '@nestjs/common/constants';
import { AuthGuard } from '../common/guards/auth.guard';
import { NotificationFavoriteTargetsResolver } from './notification-favorite-targets.resolver';

describe('NotificationFavoriteTargetsResolver', () => {
  it('requires authentication and resolves suggestions for the current account', async () => {
    const favoriteTargets = {
      getTargets: jest.fn().mockResolvedValue([]),
    };
    const resolver = new NotificationFavoriteTargetsResolver(
      favoriteTargets as never,
    );

    await expect(
      resolver.getFavoriteTargets('bus_route', 'user-1'),
    ).resolves.toEqual([]);

    expect(favoriteTargets.getTargets).toHaveBeenCalledWith(
      'user-1',
      'bus_route',
    );
    expect(
      Reflect.getMetadata(GUARDS_METADATA, NotificationFavoriteTargetsResolver),
    ).toContain(AuthGuard);
  });
});
