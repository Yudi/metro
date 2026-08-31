import { Resolver, Query, Mutation, Args, Int } from '@nestjs/graphql';
import { BadRequestException, UseGuards } from '@nestjs/common';
import { AuthGuard } from '../shared/guards/auth.guard';
import { CurrentUserId } from '../shared/decorators/current-user-id.decorator';
import { PrismaService } from '../prisma/prisma.service';
import { createEmptyFavorites } from '@metro/shared/utils';
import {
  FavoriteList,
  FavoriteListInput,
  FavoriteSnapshot,
  FavoriteSyncResponse,
  MAX_FAVORITES_PER_USER,
  MutationResponse,
  normalizeFavoriteCode,
  normalizeFavoriteListInput,
} from './entities/favorites.entity';

import { FavoriteType } from '@metro/shared/utils';

@Resolver()
@UseGuards(AuthGuard)
export class FavoritesResolver {
  constructor(private readonly prisma: PrismaService) {}

  @Query(() => FavoriteList, {
    name: 'userFavorites',
    description: 'Get user favorites (requires authentication)',
  })
  async getFavorites(@CurrentUserId() userId: string): Promise<FavoriteList> {
    await this.ensureUser(userId);
    const existing = await this.prisma.favorite.findMany({
      where: { userId },
      take: MAX_FAVORITES_PER_USER,
    });

    return this.toFavoriteList(existing);
  }

  @Query(() => FavoriteSnapshot, {
    name: 'userFavoritesSnapshot',
    description: 'Get user favorites and their synchronization revision',
  })
  async getFavoritesSnapshot(
    @CurrentUserId() userId: string,
  ): Promise<FavoriteSnapshot> {
    await this.ensureUser(userId);

    return this.prisma.$transaction(
      async (tx) => {
        const [user, existing] = await Promise.all([
          tx.user.findUniqueOrThrow({ where: { id: userId } }),
          tx.favorite.findMany({
            where: { userId },
            take: MAX_FAVORITES_PER_USER,
          }),
        ]);

        return {
          revision: user.favoritesRevision,
          favorites: this.toFavoriteList(existing),
        };
      },
      {
        isolationLevel: 'RepeatableRead',
      },
    );
  }

  @Mutation(() => MutationResponse)
  async addFavorite(
    @Args('type', { type: () => FavoriteType }) type: FavoriteType,
    @Args('code', { type: () => String }) code: string,
    @CurrentUserId() userId: string,
  ): Promise<MutationResponse> {
    const normalizedCode = normalizeFavoriteCode(code);

    await this.prisma.$transaction(
      async (tx) => {
        await tx.user.upsert({
          where: { id: userId },
          update: {},
          create: { id: userId },
        });

        const created = await tx.favorite.createMany({
          data: [{ userId, type, code: normalizedCode }],
          skipDuplicates: true,
        });

        const count = await tx.favorite.count({ where: { userId } });
        if (count > MAX_FAVORITES_PER_USER) {
          throw new BadRequestException(
            `A user can have at most ${MAX_FAVORITES_PER_USER} favorites`,
          );
        }

        if (created.count > 0) {
          await tx.user.update({
            where: { id: userId },
            data: { favoritesRevision: { increment: 1 } },
          });
        }
      },
      {
        isolationLevel: 'Serializable',
      },
    );

    return { success: true, message: 'Added to favorites' };
  }

  @Mutation(() => MutationResponse)
  async removeFavorite(
    @Args('type', { type: () => FavoriteType }) type: FavoriteType,
    @Args('code', { type: () => String }) code: string,
    @CurrentUserId() userId: string,
  ): Promise<MutationResponse> {
    const normalizedCode = normalizeFavoriteCode(code);
    const deleted = await this.prisma.$transaction(async (tx) => {
      await tx.user.upsert({
        where: { id: userId },
        update: {},
        create: { id: userId },
      });
      const result = await tx.favorite.deleteMany({
        where: { userId, type, code: normalizedCode },
      });
      if (result.count > 0) {
        await tx.user.update({
          where: { id: userId },
          data: { favoritesRevision: { increment: 1 } },
        });
      }
      return result;
    });

    return {
      // Removal is intentionally idempotent so a retry after another device
      // already removed the row can be acknowledged and retired from the
      // client's durable outbox.
      success: true,
      message: deleted.count > 0 ? 'Removed from favorites' : 'Already absent',
    };
  }

  @Mutation(() => FavoriteSyncResponse)
  async syncFavorites(
    @Args('favorites', { type: () => FavoriteListInput })
    favorites: FavoriteListInput,
    @Args('expectedRevision', { type: () => Int }) expectedRevision: number,
    @CurrentUserId() userId: string,
  ): Promise<FavoriteSyncResponse> {
    if (!Number.isInteger(expectedRevision) || expectedRevision < 0) {
      throw new BadRequestException(
        'Expected revision must be a non-negative integer',
      );
    }

    const normalized = normalizeFavoriteListInput(favorites);
    const desired = (
      Object.entries(normalized) as [FavoriteType, string[]][]
    ).flatMap(([type, codes]) => codes.map((code) => ({ type, code })));

    return this.prisma.$transaction(async (tx) => {
      await tx.user.upsert({
        where: { id: userId },
        update: {},
        create: { id: userId },
      });

      const claimedRevision = await tx.user.updateMany({
        where: { id: userId, favoritesRevision: expectedRevision },
        data: { favoritesRevision: { increment: 1 } },
      });

      if (claimedRevision.count === 0) {
        const [currentUser, currentFavorites] = await Promise.all([
          tx.user.findUniqueOrThrow({ where: { id: userId } }),
          tx.favorite.findMany({
            where: { userId },
            take: MAX_FAVORITES_PER_USER,
          }),
        ]);

        return {
          success: false,
          conflict: true,
          message: 'Favorites changed on another device',
          revision: currentUser.favoritesRevision,
          favorites: this.toFavoriteList(currentFavorites),
        };
      }

      const existing = await tx.favorite.findMany({
        where: { userId },
      });

      const existingSet = new Set(
        existing.map((item) => `${item.type}:${item.code}`),
      );
      const desiredSet = new Set(
        desired.map((item) => `${item.type}:${item.code}`),
      );

      const toCreate = desired.filter(
        (item) => !existingSet.has(`${item.type}:${item.code}`),
      );

      const toDelete = existing.filter(
        (item) => !desiredSet.has(`${item.type}:${item.code}`),
      );

      if (toCreate.length > 0) {
        await tx.favorite.createMany({
          data: toCreate.map((item) => ({
            userId,
            type: item.type,
            code: item.code,
          })),
          skipDuplicates: true,
        });
      }

      if (toDelete.length > 0) {
        await tx.favorite.deleteMany({
          where: {
            userId,
            OR: toDelete.map((item) => ({
              type: item.type,
              code: item.code,
            })),
          },
        });
      }

      return {
        success: true,
        conflict: false,
        message: 'Favorites synced',
        revision: expectedRevision + 1,
        favorites: normalized,
      };
    });
  }

  private async ensureUser(userId: string) {
    return this.prisma.user.upsert({
      where: { id: userId },
      update: {},
      create: { id: userId },
    });
  }

  private toFavoriteList(
    records: Array<{ type: string; code: string }>,
  ): FavoriteList {
    const favorites = createEmptyFavorites();
    records.forEach((item) => {
      const list = favorites[item.type as FavoriteType];
      if (Array.isArray(list)) {
        list.push(item.code);
      }
    });
    return favorites;
  }
}
