import {
  Field,
  InputType,
  ObjectType,
  registerEnumType,
} from '@nestjs/graphql';
import {
  FavoriteList as FavoriteListType,
  FavoriteType,
} from '@metro/shared/utils';

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

@ObjectType()
export class MutationResponse {
  @Field()
  success!: boolean;

  @Field({ nullable: true })
  message?: string;
}
