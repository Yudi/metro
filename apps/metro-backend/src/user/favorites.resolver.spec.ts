import { Test, TestingModule } from '@nestjs/testing';
import { FavoritesResolver } from './favorites.resolver';
import { PrismaService } from '../prisma/prisma.service';
import { AuthGuard } from '../shared/guards/auth.guard';
import { AuthService } from './auth.service';

describe('FavoritesResolver', () => {
  let resolver: FavoritesResolver;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        FavoritesResolver,
        {
          provide: PrismaService,
          useValue: {},
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
});
