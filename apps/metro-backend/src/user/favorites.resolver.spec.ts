import { Test, TestingModule } from '@nestjs/testing';
import { FavoritesResolver } from './favorites.resolver';
import { PrismaService } from '../prisma/prisma.service';
import { AuthGuard } from '../shared/guards/auth.guard';
import { AuthService } from './auth.service';
import { FavoriteType } from '@metro/shared/utils';

describe('FavoritesResolver', () => {
  let resolver: FavoritesResolver;
  let prisma: {
    favorite: {
      findMany: jest.Mock;
      findFirst: jest.Mock;
      create: jest.Mock;
      createMany: jest.Mock;
      deleteMany: jest.Mock;
    };
  };

  beforeEach(async () => {
    prisma = {
      favorite: {
        findMany: jest.fn().mockResolvedValue([]),
        findFirst: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue({}),
        createMany: jest.fn().mockResolvedValue({ count: 0 }),
        deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
      },
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
  });
});
