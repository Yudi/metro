import { Resolver, Query } from '@nestjs/graphql';
import { PrismaService } from '../prisma/prisma.service';
import { UseGuards } from '@nestjs/common';
import { AuthGuard } from '../common/guards/auth.guard';
import { CurrentUserId } from '../common/decorators/current-user-id.decorator';

@Resolver()
@UseGuards(AuthGuard)
export class UserResolver {
  constructor(private readonly prisma: PrismaService) {}

  @Query(() => Boolean)
  async validateToken(@CurrentUserId() userId: string): Promise<boolean> {
    await this.prisma.user.upsert({
      where: { id: userId },
      update: {},
      create: { id: userId },
    });
    return true;
  }
}
