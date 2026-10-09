import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { configuration } from './config/configuration';
import { accessTokenTtlSeconds, jwtIssuer, jwtSecret, requiredInt } from './config/required-settings';
import { HealthController } from './health/health.controller';
import { AuthModule } from './auth/auth.module';
import { User } from './users/user.entity';
import { RefreshToken } from './refresh-tokens/refresh-token.entity';
import { OtpChallenge } from './otp/otp-challenge.entity';
import { RedactingLogger } from './common/logging/redacting.logger';
import { DatabaseInitService } from './database/database-init.service';

@Module({
  imports: [
    // Configuration module - loads environment variables
    ConfigModule.forRoot({
      load: [configuration],
      isGlobal: true,
      // Every setting comes from config/application.yml (config/central-config.ts); no .env file is read.
      ignoreEnvFile: true,
    }),

    // Database connection configuration
    TypeOrmModule.forRoot({
      type: 'postgres',
      host: process.env.DATABASE_HOST,
      port: requiredInt('DATABASE_PORT', 'database.auth.port'),
      username: process.env.DATABASE_USER,
      password: process.env.DATABASE_PASSWORD,
      database: process.env.DATABASE_NAME,
      entities: [User, RefreshToken, OtpChallenge],
      synchronize: process.env.NODE_ENV === 'development',
      logging: process.env.NODE_ENV === 'development',
      migrations: [],
      migrationsRun: false,
    }),

    // JWT module for token signing
    JwtModule.register({
      global: true,
      secret: jwtSecret(),
      signOptions: {
        issuer: jwtIssuer(),
        algorithm: 'HS256',
        expiresIn: accessTokenTtlSeconds(),
      },
    }),

    // Passport module for authentication strategies
    PassportModule.register({ defaultStrategy: 'jwt' }),

    // Auth module with all endpoints
    AuthModule,
  ],
  controllers: [HealthController],
  providers: [RedactingLogger, DatabaseInitService],
})
export class AppModule {}
