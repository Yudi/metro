import { Test, TestingModule } from '@nestjs/testing';
import { UserResolver } from './user.resolver';
import { PrismaService } from '../prisma/prisma.service';
import { AuthGuard } from '../shared/guards/auth.guard';
import { AuthService } from './auth.service';

describe('UserResolver', () => {
  let resolver: UserResolver;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UserResolver,
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

    resolver = module.get<UserResolver>(UserResolver);
  });

  it('should be defined', () => {
    expect(resolver).toBeDefined();
  });
});
