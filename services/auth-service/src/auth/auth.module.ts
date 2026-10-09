import { accessTokenTtlSeconds, jwtIssuer, jwtSecret } from '../config/required-settings';
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { JwtStrategy } from './jwt.strategy';
import { JwtAuthGuard } from './jwt-auth.guard';
import { User } from '../users/user.entity';
import { RefreshToken } from '../refresh-tokens/refresh-token.entity';
import { UsersService, UsersRepository } from '../users/users.service';
import { CredentialsService } from '../credentials/credentials.service';
import { RefreshTokensService, RefreshTokensRepository } from '../refresh-tokens/refresh-tokens.service';
import { RedactingLogger } from '../common/logging/redacting.logger';
import { LoginThrottleService } from './login-throttle.service';
import { LoginFlowService } from './login-flow.service';
import { PasswordResetService } from './password-reset.service';
import { RegistrationFlowService } from './registration-flow.service';
import { AccountSecurityService } from './account-security.service';
import { PasswordAttemptsService } from './password-attempts.service';
import { MailModule } from '../mail/mail.module';
import { OtpChallenge } from '../otp/otp-challenge.entity';
import { OtpChallengesRepository } from '../otp/otp-challenges.repository';
import { OtpService } from '../otp/otp.service';
import { OtpSchemaService } from '../otp/otp-schema.service';
import { OTP_SETTINGS, otpSettings } from '../otp/otp.config';

@Module({
  imports: [
    TypeOrmModule.forFeature([User, RefreshToken, OtpChallenge]),
    MailModule,
    JwtModule.register({
      secret: jwtSecret(),
      signOptions: {
        issuer: jwtIssuer(),
        algorithm: 'HS256',
        expiresIn: accessTokenTtlSeconds(),
      },
    }),
    PassportModule,
  ],
  controllers: [AuthController],
  providers: [
    AuthService,
    JwtStrategy,
    JwtAuthGuard,
    UsersService,
    UsersRepository,
    CredentialsService,
    RefreshTokensService,
    RefreshTokensRepository,
    RedactingLogger,
    LoginThrottleService,
    LoginFlowService,
    PasswordResetService,
    RegistrationFlowService,
    AccountSecurityService,
    PasswordAttemptsService,
    OtpService,
    OtpChallengesRepository,
    OtpSchemaService,
    { provide: OTP_SETTINGS, useFactory: () => otpSettings() },
  ],
  exports: [AuthService, UsersService, CredentialsService],
})
export class AuthModule {}
