import {
  BadRequestException,
  PipeTransform,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { Args, Mutation, Query, Resolver } from '@nestjs/graphql';
import { isEmail } from 'class-validator';
import { CurrentUserId } from '../common/decorators/current-user-id.decorator';
import { AdminAccessService } from './admin-access.service';
import { AdminGuard } from './admin.guard';
import { AdminAccountDto } from './dto/admin-account.dto';

class AdminEmailPipe implements PipeTransform<unknown, string> {
  transform(value: unknown): string {
    if (typeof value !== 'string') {
      throw new BadRequestException('A valid email address is required');
    }

    const email = value.trim();
    if (email.length > 254 || !isEmail(email)) {
      throw new BadRequestException('A valid email address is required');
    }
    return email;
  }
}

class AdminUidPipe implements PipeTransform<unknown, string> {
  transform(value: unknown): string {
    if (
      typeof value !== 'string' ||
      value.length === 0 ||
      value.length > 128
    ) {
      throw new BadRequestException(
        'A valid Firebase user identifier is required',
      );
    }
    return value;
  }
}

@Resolver(() => AdminAccountDto)
@UseGuards(AdminGuard)
export class AdminResolver {
  constructor(private readonly adminAccessService: AdminAccessService) {}

  @Query(() => [AdminAccountDto], { name: 'adminAccounts' })
  adminAccounts(): Promise<AdminAccountDto[]> {
    return this.adminAccessService.listAdministratorAccounts();
  }

  @Mutation(() => AdminAccountDto, { name: 'grantAdmin' })
  grantAdmin(
    @Args('email', { type: () => String }, new AdminEmailPipe()) email: string,
  ): Promise<AdminAccountDto> {
    return this.adminAccessService.addAdministrator(email);
  }

  @Mutation(() => Boolean, { name: 'revokeAdmin' })
  async revokeAdmin(
    @Args('uid', { type: () => String }, new AdminUidPipe()) uid: string,
    @CurrentUserId() currentUserId: string | null,
  ): Promise<boolean> {
    if (!currentUserId) {
      throw new UnauthorizedException('Authenticated administrator identity is missing');
    }

    await this.adminAccessService.removeAdministrator(uid, currentUserId);
    return true;
  }
}
