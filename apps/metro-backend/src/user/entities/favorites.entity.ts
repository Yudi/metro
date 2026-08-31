import {
  Field,
  Int,
  InputType,
  ObjectType,
  registerEnumType,
} from '@nestjs/graphql';
import { BadRequestException } from '@nestjs/common';
import { ArrayMaxSize, IsArray, Length, Matches } from 'class-validator';
import {
  FavoriteList as FavoriteListType,
  FavoriteType,
} from '@metro/shared/utils';

export const FAVORITE_CODE_MAX_LENGTH = 128;
export const MAX_FAVORITES_PER_USER = 500;

const FAVORITE_CODE_PATTERN = /^[^\p{Cc}]+$/u;
const favoriteTypes = Object.values(FavoriteType) as FavoriteType[];

registerEnumType(FavoriteType, {
  name: 'FavoriteType',
  description: 'Type of favorite item',
});

@ObjectType()
export class FavoriteList implements FavoriteListType {
  @Field(() => [String])
  bikeStation!: string[];

  @Field(() => [String])
  railStation!: string[];

  @Field(() => [String])
  railLine!: string[];

  @Field(() => [String])
  busStop!: string[];

  @Field(() => [String])
  busRoute!: string[];
}

@InputType()
export class FavoriteListInput {
  @Field(() => [String])
  @IsArray()
  @ArrayMaxSize(MAX_FAVORITES_PER_USER)
  @Length(1, FAVORITE_CODE_MAX_LENGTH, { each: true })
  @Matches(FAVORITE_CODE_PATTERN, { each: true })
  bikeStation!: string[];

  @Field(() => [String])
  @IsArray()
  @ArrayMaxSize(MAX_FAVORITES_PER_USER)
  @Length(1, FAVORITE_CODE_MAX_LENGTH, { each: true })
  @Matches(FAVORITE_CODE_PATTERN, { each: true })
  railStation!: string[];

  @Field(() => [String])
  @IsArray()
  @ArrayMaxSize(MAX_FAVORITES_PER_USER)
  @Length(1, FAVORITE_CODE_MAX_LENGTH, { each: true })
  @Matches(FAVORITE_CODE_PATTERN, { each: true })
  railLine!: string[];

  @Field(() => [String])
  @IsArray()
  @ArrayMaxSize(MAX_FAVORITES_PER_USER)
  @Length(1, FAVORITE_CODE_MAX_LENGTH, { each: true })
  @Matches(FAVORITE_CODE_PATTERN, { each: true })
  busStop!: string[];

  @Field(() => [String])
  @IsArray()
  @ArrayMaxSize(MAX_FAVORITES_PER_USER)
  @Length(1, FAVORITE_CODE_MAX_LENGTH, { each: true })
  @Matches(FAVORITE_CODE_PATTERN, { each: true })
  busRoute!: string[];
}

@ObjectType()
export class MutationResponse {
  @Field()
  success!: boolean;

  @Field({ nullable: true })
  message?: string;
}

@ObjectType()
export class FavoriteSnapshot {
  @Field(() => Int)
  revision!: number;

  @Field(() => FavoriteList)
  favorites!: FavoriteList;
}

@ObjectType()
export class FavoriteSyncResponse extends FavoriteSnapshot {
  @Field()
  success!: boolean;

  @Field()
  conflict!: boolean;

  @Field({ nullable: true })
  message?: string;
}

export function normalizeFavoriteCode(value: unknown): string {
  if (typeof value !== 'string') {
    throw new BadRequestException('Favorite code must be a string');
  }

  const code = value.trim();
  if (
    code.length === 0 ||
    code.length > FAVORITE_CODE_MAX_LENGTH ||
    !FAVORITE_CODE_PATTERN.test(code)
  ) {
    throw new BadRequestException(
      `Favorite code must contain 1-${FAVORITE_CODE_MAX_LENGTH} printable characters`,
    );
  }

  return code;
}

export function normalizeFavoriteListInput(
  value: unknown,
): Record<FavoriteType, string[]> {
  if (!value || typeof value !== 'object') {
    throw new BadRequestException('Favorites must be an object');
  }

  const input = value as Record<string, unknown>;
  const normalized = {} as Record<FavoriteType, string[]>;
  let total = 0;

  for (const type of favoriteTypes) {
    const values = input[type];
    if (!Array.isArray(values) || values.length > MAX_FAVORITES_PER_USER) {
      throw new BadRequestException(
        `Favorite list entries must contain at most ${MAX_FAVORITES_PER_USER} values`,
      );
    }

    const codes = Array.from(
      new Set(values.map((code) => normalizeFavoriteCode(code))),
    );
    total += codes.length;
    if (total > MAX_FAVORITES_PER_USER) {
      throw new BadRequestException(
        `A user can have at most ${MAX_FAVORITES_PER_USER} favorites`,
      );
    }

    normalized[type] = codes;
  }

  return normalized;
}
