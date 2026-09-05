import { Test, TestingModule } from '@nestjs/testing';
import { FavoritesResolver } from './favorites.resolver';
import { PrismaService } from '../prisma/prisma.service';
import { AuthGuard } from '../shared/guards/auth.guard';
import { AuthService } from './auth.service';
import {
  FAVORITE_CODE_MAX_LENGTH,
  MAX_FAVORITES_PER_USER,
} from './entities/favorites.entity';
import { FavoriteType, createEmptyFavorites } from '@metro/shared/utils';

describe('FavoritesResolver', () => {
  let resolver: FavoritesResolver;
  let prisma: {
    user: {
      upsert: jest.Mock;
      update: jest.Mock;
      updateMany: jest.Mock;
      findUniqueOrThrow: jest.Mock;
    };
    favorite: {
      findMany: jest.Mock;
      count: jest.Mock;
      createMany: jest.Mock;
      deleteMany: jest.Mock;
    };
    $transaction: jest.Mock;
  };

  beforeEach(async () => {
    prisma = {
      user: {
        upsert: jest
          .fn()
          .mockResolvedValue({ id: 'user-id', favoritesRevision: 0 }),
        update: jest.fn().mockResolvedValue({}),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        findUniqueOrThrow: jest
          .fn()
          .mockResolvedValue({ id: 'user-id', favoritesRevision: 1 }),
      },
      favorite: {
        findMany: jest.fn().mockResolvedValue([]),
        count: jest.fn().mockResolvedValue(0),
        createMany: jest.fn().mockResolvedValue({ count: 0 }),
        deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
      },
      $transaction: jest.fn(async (callback: (tx: typeof prisma) => unknown) =>
        callback(prisma),
      ),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        FavoritesResolver,
        {
          provide: PrismaService,
          useValue: prisma,
        },
        {
          provide: AuthGuard,
          useValue: {
            canActivate: () => true,
          },
        },
        {
          provide: AuthService,
          useValue: {
            verifyToken: () => 'user-id',
          },
        },
      ],
    }).compile();

    resolver = module.get<FavoritesResolver>(FavoritesResolver);
  });

  it('should be defined', () => {
    expect(resolver).toBeDefined();
  });

  it('returns fresh arrays for each favorites response', async () => {
    prisma.favorite.findMany
      .mockResolvedValueOnce([
        {
          type: FavoriteType.RailLine,
          code: 'L4',
        },
      ])
      .mockResolvedValueOnce([]);

    const first = await resolver.getFavorites('user-1');
    const second = await resolver.getFavorites('user-2');

    expect(first.railLine).toEqual(['L4']);
    expect(second.railLine).toEqual([]);
    expect(second.railLine).not.toBe(first.railLine);
    expect(prisma.user.upsert).toHaveBeenCalledTimes(2);
  });

  it('returns favorites and revision from one repeatable-read snapshot', async () => {
    prisma.user.findUniqueOrThrow.mockResolvedValueOnce({
      id: 'user-id',
      favoritesRevision: 3,
    });
    prisma.favorite.findMany.mockResolvedValueOnce([
      { type: FavoriteType.RailLine, code: 'L4' },
    ]);

    const result = await resolver.getFavoritesSnapshot('user-id');

    expect(result).toEqual({
      revision: 3,
      favorites: {
        ...createEmptyFavorites(),
        railLine: ['L4'],
      },
    });
    expect(prisma.$transaction).toHaveBeenCalledWith(expect.any(Function), {
      isolationLevel: 'RepeatableRead',
    });
  });

  it('bootstraps a fresh UID and uses an idempotent create for add', async () => {
    prisma.favorite.createMany.mockResolvedValueOnce({ count: 1 });
    await resolver.addFavorite(FavoriteType.RailLine, ' L4 ', 'new-user');

    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(prisma.user.upsert).toHaveBeenCalledWith({
      where: { id: 'new-user' },
      update: {},
      create: { id: 'new-user' },
    });
    expect(prisma.favorite.createMany).toHaveBeenCalledWith({
      data: [
        {
          userId: 'new-user',
          type: FavoriteType.RailLine,
          code: 'L4',
        },
      ],
      skipDuplicates: true,
    });
    expect(prisma.user.update).toHaveBeenCalledWith({
      where: { id: 'new-user' },
      data: { favoritesRevision: { increment: 1 } },
    });
  });

  it('retries a bounded serializable write conflict', async () => {
    const transaction = prisma.$transaction;
    transaction
      .mockRejectedValueOnce({ code: 'P2034' })
      .mockImplementationOnce(
        async (callback: (tx: typeof prisma) => unknown) => callback(prisma),
      );

    await expect(
      resolver.addFavorite(FavoriteType.RailLine, 'L4', 'user-id'),
    ).resolves.toEqual({ success: true, message: 'Added to favorites' });
    expect(transaction).toHaveBeenCalledTimes(2);
  });

  it('does not retry a non-transaction error', async () => {
    const transaction = prisma.$transaction;
    transaction.mockRejectedValueOnce(new Error('database unavailable'));

    await expect(
      resolver.addFavorite(FavoriteType.RailLine, 'L4', 'user-id'),
    ).rejects.toThrow('database unavailable');
    expect(transaction).toHaveBeenCalledTimes(1);
  });

  it('rejects an oversized code before touching Prisma', async () => {
    await expect(
      resolver.addFavorite(
        FavoriteType.RailLine,
        'x'.repeat(FAVORITE_CODE_MAX_LENGTH + 1),
        'user-id',
      ),
    ).rejects.toThrow('Favorite code must contain');

    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(prisma.user.upsert).not.toHaveBeenCalled();
  });

  it('keeps concurrent duplicate adds on the unique upsert path', async () => {
    await Promise.all(
      Array.from({ length: 20 }, () =>
        resolver.addFavorite(FavoriteType.RailLine, 'L4', 'user-id'),
      ),
    );

    expect(prisma.favorite.createMany).toHaveBeenCalledTimes(20);
    expect(prisma.favorite.findMany).not.toHaveBeenCalled();
  });

  it('rejects an oversized synchronization before touching Prisma', async () => {
    const favorites = createEmptyFavorites();
    favorites.railLine = Array.from(
      { length: MAX_FAVORITES_PER_USER + 1 },
      (_, index) => `L${index}`,
    );

    await expect(
      resolver.syncFavorites(favorites, 0, 'user-id'),
    ).rejects.toThrow('at most');

    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(prisma.user.upsert).not.toHaveBeenCalled();
  });

  it('performs synchronization inside one transaction and normalizes duplicates', async () => {
    const favorites = createEmptyFavorites();
    favorites.railLine = [' L4 ', 'L4'];
    prisma.favorite.findMany.mockResolvedValue([
      { type: FavoriteType.RailLine, code: 'L1' },
    ]);

    const result = await resolver.syncFavorites(favorites, 0, 'user-id');

    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(prisma.user.updateMany).toHaveBeenCalledWith({
      where: { id: 'user-id', favoritesRevision: 0 },
      data: { favoritesRevision: { increment: 1 } },
    });
    expect(prisma.favorite.createMany).toHaveBeenCalledWith({
      data: [
        {
          userId: 'user-id',
          type: FavoriteType.RailLine,
          code: 'L4',
        },
      ],
      skipDuplicates: true,
    });
    expect(prisma.favorite.deleteMany).toHaveBeenCalledWith({
      where: {
        userId: 'user-id',
        OR: [{ type: FavoriteType.RailLine, code: 'L1' }],
      },
    });
    expect(result).toMatchObject({
      success: true,
      conflict: false,
      revision: 1,
      favorites: { railLine: ['L4'] },
    });
  });

  it('returns the authoritative snapshot without writing on revision conflict', async () => {
    prisma.user.updateMany.mockResolvedValueOnce({ count: 0 });
    prisma.user.findUniqueOrThrow.mockResolvedValueOnce({
      id: 'user-id',
      favoritesRevision: 4,
    });
    prisma.favorite.findMany.mockResolvedValueOnce([
      { type: FavoriteType.RailLine, code: 'L1' },
    ]);

    const result = await resolver.syncFavorites(
      createEmptyFavorites(),
      3,
      'user-id',
    );

    expect(result).toEqual({
      success: false,
      conflict: true,
      message: 'Favorites changed on another device',
      revision: 4,
      favorites: {
        ...createEmptyFavorites(),
        railLine: ['L1'],
      },
    });
    expect(prisma.favorite.createMany).not.toHaveBeenCalled();
    expect(prisma.favorite.deleteMany).not.toHaveBeenCalled();
  });

  it('acknowledges removal when another device already deleted the row', async () => {
    const result = await resolver.removeFavorite(
      FavoriteType.RailLine,
      'L4',
      'user-id',
    );

    expect(result).toEqual({ success: true, message: 'Already absent' });
  });

  it('propagates a create failure so the transaction can roll back before delete', async () => {
    prisma.favorite.createMany.mockRejectedValue(new Error('write failed'));
    const favorites = createEmptyFavorites();
    favorites.railLine = ['L4'];

    await expect(
      resolver.syncFavorites(favorites, 0, 'user-id'),
    ).rejects.toThrow('write failed');
    expect(prisma.favorite.deleteMany).not.toHaveBeenCalled();
  });
});
