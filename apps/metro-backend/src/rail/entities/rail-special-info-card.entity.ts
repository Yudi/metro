import { Field, ObjectType } from '@nestjs/graphql';
import type { RailStatusCode } from '@metro/shared/utils';

@ObjectType({
  description: 'Informational card shown alongside special services',
})
export class SpecialRailInfoCard {
  @Field(() => String, { description: 'Unique card identifier' })
  id!: string;

  @Field(() => String, { description: 'Card title' })
  title!: string;

  @Field(() => String, { description: 'Card subtitle' })
  subtitle!: string;

  @Field(() => String, { description: 'Material icon name used in badge' })
  badgeIcon!: string;

  @Field(() => String, { description: 'Badge background color in hex' })
  badgeColorHex!: string;

  @Field(() => String, { description: 'Current status code' })
  statusCode!: RailStatusCode;

  @Field(() => String, { description: 'Current status label' })
  statusLabel!: string;
}
