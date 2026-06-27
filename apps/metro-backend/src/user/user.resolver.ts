import { Resolver, Query } from '@nestjs/graphql';
import { PrismaService } from '../prisma/prisma.service';
import { UseGuards } from '@nestjs/common';
import { AuthGuard } from '../shared/guards/auth.guard';
import { CurrentUserId } from '../shared/decorators/current-user-id.decorator';

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
