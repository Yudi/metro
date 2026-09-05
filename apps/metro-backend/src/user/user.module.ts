import { Module } from '@nestjs/common';
import { UserResolver } from './user.resolver';
import { AuthService } from './auth.service';
import { FavoritesResolver } from './favorites.resolver';

@Module({
  providers: [UserResolver, AuthService, FavoritesResolver],
})
export class UserModule {}
