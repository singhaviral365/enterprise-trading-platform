import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { JwtStrategy } from './jwt.strategy';
import { User } from '../users/user.entity';
import { RefreshToken } from '../refresh-tokens/refresh-token.entity';
import { UsersService, UsersRepository } from '../users/users.service';
import { CredentialsService } from '../credentials/credentials.service';
import { RefreshTokensService, RefreshTokensRepository } from '../refresh-tokens/refresh-tokens.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([User, RefreshToken]),
    JwtModule.register({
      secret: process.env.JWT_SECRET,
      signOptions: {
        issuer: process.env.JWT_ISSUER || 'auth-service',
        algorithm: 'HS256',
        expiresIn: parseInt(process.env.JWT_ACCESS_TOKEN_EXPIRES_IN || '900', 10),
      },
    }),
    PassportModule,
  ],
  controllers: [AuthController],
  providers: [
    AuthService,
    JwtStrategy,
    UsersService,
    UsersRepository,
    CredentialsService,
    RefreshTokensService,
    RefreshTokensRepository,
  ],
  exports: [AuthService, UsersService, CredentialsService],
})
export class AuthModule {}
