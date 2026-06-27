import { Module } from '@nestjs/common';
import { UserController } from './user.controller';
import { UserResolver } from './user.resolver';
import { AuthService } from './auth.service';
import { FavoritesResolver } from './favorites.resolver';

@Module({
  controllers: [UserController],
  providers: [UserResolver, AuthService, FavoritesResolver],
})
export class UserModule {}
