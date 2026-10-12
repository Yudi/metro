import { Field, ObjectType } from '@nestjs/graphql';
import type { AdminAccount as AdminAccountContract } from '@metro/shared/admin-contracts';

@ObjectType('AdminAccount')
export class AdminAccountDto implements AdminAccountContract {
  @Field(() => String, { description: 'Firebase user identifier.' })
  uid!: string;

  @Field(() => String, {
    description: 'Firebase email address.',
    nullable: true,
  })
  email!: string | null;

  @Field(() => String, {
    description: 'Firebase display name.',
    nullable: true,
  })
  displayName!: string | null;

  @Field(() => Boolean, {
    description: 'Whether this is the configured bootstrap account.',
  })
  bootstrap!: boolean;
}
