import { Resolver, Query, Mutation, Args } from '@nestjs/graphql';
import { UseGuards } from '@nestjs/common';
import { AuthGuard } from '../shared/guards/auth.guard';
import { CurrentUserId } from '../shared/decorators/current-user-id.decorator';
import { PrismaService } from '../prisma/prisma.service';
import { createEmptyFavorites } from '@metro/shared/utils';
import {
  FavoriteList,
  FavoriteListInput,
  MutationResponse,
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
    const existing = await this.prisma.favorite.findMany({
      where: { userId },
    });

    const favorites = createEmptyFavorites();
    existing.forEach((item) => {
      const list = favorites[item.type as FavoriteType];
      if (Array.isArray(list)) {
        list.push(item.code);
      }
    });

    return favorites;
  }

  @Mutation(() => MutationResponse)
  async addFavorite(
    @Args('type', { type: () => FavoriteType }) type: FavoriteType,
    @Args('code', { type: () => String }) code: string,
    @CurrentUserId() userId: string,
  ): Promise<MutationResponse> {
    const existing = await this.prisma.favorite.findFirst({
      where: { userId, type, code },
    });

    if (existing) {
      return { success: true, message: 'Already in favorites' };
    }

    await this.prisma.favorite.create({
      data: { userId, type, code },
    });

    return { success: true, message: 'Added to favorites' };
  }

  @Mutation(() => MutationResponse)
  async removeFavorite(
    @Args('type', { type: () => FavoriteType }) type: FavoriteType,
    @Args('code', { type: () => String }) code: string,
    @CurrentUserId() userId: string,
  ): Promise<MutationResponse> {
    const deleted = await this.prisma.favorite.deleteMany({
      where: { userId, type, code },
    });

    return {
      success: deleted.count > 0,
      message: deleted.count > 0 ? 'Removed from favorites' : 'Not found',
    };
  }

  @Mutation(() => MutationResponse)
  async syncFavorites(
    @Args('favorites', { type: () => FavoriteListInput })
    favorites: FavoriteListInput,
    @CurrentUserId() userId: string,
  ): Promise<MutationResponse> {
    const desired = (
      Object.entries(favorites) as [FavoriteType, string[]][]
    ).flatMap(([type, codes]) => codes.map((code) => ({ type, code })));

    const existing = await this.prisma.favorite.findMany({
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
      await this.prisma.favorite.createMany({
        data: toCreate.map((item) => ({
          userId,
          type: item.type,
          code: item.code,
        })),
        skipDuplicates: true,
      });
    }

    if (toDelete.length > 0) {
      await this.prisma.favorite.deleteMany({
        where: {
          userId,
          OR: toDelete.map((item) => ({
            type: item.type,
            code: item.code,
          })),
        },
      });
    }

    return { success: true, message: 'Favorites synced' };
  }
}
