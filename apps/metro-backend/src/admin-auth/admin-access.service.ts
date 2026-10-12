import {
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  OnApplicationBootstrap,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { auth } from 'firebase-admin';
import type { DecodedIdToken, UserRecord } from 'firebase-admin/auth';
import type { AdminAccount } from '@metro/shared/admin-contracts';

const FIREBASE_PAGE_SIZE = 1000;
const INVALID_TOKEN_CODES = new Set([
  'auth/argument-error',
  'auth/id-token-expired',
  'auth/id-token-revoked',
  'auth/invalid-id-token',
  'auth/user-not-found',
]);

@Injectable()
export class AdminAccessService implements OnApplicationBootstrap {
  private readonly firebaseAuth = auth();
  private readonly logger = new Logger(AdminAccessService.name);
  private deletionQueue: Promise<void> = Promise.resolve();

  async onApplicationBootstrap(): Promise<void> {
    const bootstrapUid = this.configuredBootstrapUid;
    if (!bootstrapUid) {
      return;
    }

    try {
      const user = await this.synchronizeBootstrapAdmin(bootstrapUid);
      if (!user || user.disabled) {
        this.logger.warn(
          'The configured bootstrap administrator is unavailable; access will be synchronized after a verified sign-in.',
        );
      }
    } catch {
      this.logger.warn(
        'The configured bootstrap administrator could not be synchronized at startup; access will be retried after a verified sign-in.',
      );
    }
  }

  async verifyIdToken(token: string): Promise<DecodedIdToken> {
    try {
      return await this.firebaseAuth.verifyIdToken(token, true);
    } catch (error) {
      const code = getFirebaseErrorCode(error);
      if (code === 'auth/user-disabled') {
        throw new ForbiddenException('This account is disabled');
      }
      if (code && INVALID_TOKEN_CODES.has(code)) {
        throw new UnauthorizedException('A valid Firebase token is required');
      }

      throw new ServiceUnavailableException(
        'Authentication service is temporarily unavailable',
        { cause: error },
      );
    }
  }

  async getUser(uid: string): Promise<UserRecord | null> {
    try {
      return await this.firebaseAuth.getUser(uid);
    } catch (error) {
      if (getFirebaseErrorCode(error) === 'auth/user-not-found') {
        return null;
      }

      throw new ServiceUnavailableException(
        'Authentication service is temporarily unavailable',
        { cause: error },
      );
    }
  }

  async listAdministratorAccounts(): Promise<AdminAccount[]> {
    const users = await this.listUsers();
    return users
      .filter((user) => user.customClaims?.['admin'] === true)
      .map((user) => this.toAdminAccount(user))
      .sort((left, right) => left.uid.localeCompare(right.uid));
  }

  async addAdministrator(email: string): Promise<AdminAccount> {
    const normalizedEmail = email.trim();
    let user: UserRecord;
    try {
      user = await this.firebaseAuth.getUserByEmail(normalizedEmail);
    } catch (error) {
      if (getFirebaseErrorCode(error) === 'auth/user-not-found') {
        throw new NotFoundException('No Firebase account has that email');
      }
      throw new ServiceUnavailableException(
        'Authentication service is temporarily unavailable',
        { cause: error },
      );
    }

    if (user.disabled) {
      throw new ForbiddenException('Disabled accounts cannot be administrators');
    }
    if (!user.email) {
      throw new ForbiddenException(
        'Anonymous accounts cannot be administrators',
      );
    }

    if (user.customClaims?.['admin'] !== true) {
      await this.setCustomClaims(user.uid, {
        ...user.customClaims,
        admin: true,
      });
    }

    return this.toAdminAccount(user);
  }

  async removeAdministrator(uid: string, currentUserId: string): Promise<void> {
    const removal = this.deletionQueue.then(() =>
      this.removeAdministratorWithLastAdminCheck(uid, currentUserId),
    );
    this.deletionQueue = removal.catch(() => undefined);
    return removal;
  }

  async synchronizeBootstrapAdmin(uid: string): Promise<UserRecord | null> {
    if (uid !== this.configuredBootstrapUid) {
      return null;
    }

    const user = await this.getUser(uid);
    if (!user || user.disabled || user.customClaims?.['admin'] === true) {
      return user;
    }

    await this.setCustomClaims(uid, {
      ...user.customClaims,
      admin: true,
    });
    return this.getUser(uid);
  }

  get configuredBootstrapUid(): string | null {
    const uid = process.env['ADMIN_BOOTSTRAP_UID']?.trim();
    return uid || null;
  }

  private async removeAdministratorWithLastAdminCheck(
    uid: string,
    currentUserId: string,
  ): Promise<void> {
    if (uid === currentUserId) {
      throw new ForbiddenException('Administrators cannot remove themselves');
    }
    if (uid === this.configuredBootstrapUid) {
      throw new ForbiddenException(
        'The configured bootstrap administrator cannot be removed',
      );
    }

    const user = await this.getUser(uid);
    if (!user || user.customClaims?.['admin'] !== true) {
      throw new NotFoundException('Administrator account not found');
    }

    if (!user.disabled) {
      const activeAdministrators = (await this.listUsers()).filter(
        (candidate) =>
          !candidate.disabled && candidate.customClaims?.['admin'] === true,
      );
      if (activeAdministrators.length <= 1) {
        throw new ConflictException(
          'The last active administrator cannot be removed',
        );
      }
    }

    const claims = { ...user.customClaims };
    delete claims['admin'];
    await this.setCustomClaims(uid, claims);
  }

  private async listUsers(): Promise<UserRecord[]> {
    const users: UserRecord[] = [];
    let pageToken: string | undefined;

    try {
      do {
        const page = await this.firebaseAuth.listUsers(
          FIREBASE_PAGE_SIZE,
          pageToken,
        );
        users.push(...page.users);
        pageToken = page.pageToken;
      } while (pageToken);
    } catch (error) {
      throw new ServiceUnavailableException(
        'Authentication service is temporarily unavailable',
        { cause: error },
      );
    }

    return users;
  }

  private async setCustomClaims(
    uid: string,
    claims: Record<string, unknown>,
  ): Promise<void> {
    try {
      await this.firebaseAuth.setCustomUserClaims(uid, claims);
    } catch (error) {
      if (getFirebaseErrorCode(error) === 'auth/user-not-found') {
        throw new NotFoundException('Firebase account not found');
      }
      throw new ServiceUnavailableException(
        'Authentication service is temporarily unavailable',
        { cause: error },
      );
    }
  }

  private toAdminAccount(
    user: Pick<UserRecord, 'uid' | 'email' | 'displayName'>,
  ): AdminAccount {
    return {
      uid: user.uid,
      email: user.email ?? null,
      displayName: user.displayName ?? null,
      bootstrap: user.uid === this.configuredBootstrapUid,
    };
  }
}

function getFirebaseErrorCode(error: unknown): string | null {
  if (!error || typeof error !== 'object' || !('code' in error)) {
    return null;
  }

  return typeof error.code === 'string' ? error.code : null;
}
