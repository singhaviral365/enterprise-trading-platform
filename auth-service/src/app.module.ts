import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { configuration } from './config/configuration';
import { HealthController } from './health/health.controller';
import { AuthModule } from './auth/auth.module';
import { AccountsModule } from './accounts/accounts.module';
import { User } from './users/user.entity';
import { RefreshToken } from './refresh-tokens/refresh-token.entity';
import { RedactingLogger } from './common/logging/redacting.logger';
import { DatabaseInitService } from './database/database-init.service';

@Module({
  imports: [
    // Configuration module - loads environment variables
    ConfigModule.forRoot({
      load: [configuration],
      isGlobal: true,
      envFilePath: ['.env.local', '.env'],
    }),

    // Database connection configuration
    TypeOrmModule.forRoot({
      type: 'postgres',
      host: process.env.DATABASE_HOST,
      port: parseInt(process.env.DATABASE_PORT || '5432', 10),
      username: process.env.DATABASE_USER,
      password: process.env.DATABASE_PASSWORD,
      database: process.env.DATABASE_NAME,
      entities: [User, RefreshToken],
      synchronize: process.env.NODE_ENV === 'development',
      logging: process.env.NODE_ENV === 'development',
      migrations: [],
      migrationsRun: false,
    }),

    // JWT module for token signing
    JwtModule.register({
      global: true,
      secret: process.env.JWT_SECRET || 'dev-only-change-me-this-secret-is-not-for-production-use',
      signOptions: {
        issuer: process.env.JWT_ISSUER || 'auth-service',
        algorithm: 'HS256',
        expiresIn: parseInt(process.env.JWT_ACCESS_TOKEN_EXPIRES_IN || '900', 10),
      },
    }),

    // Passport module for authentication strategies
    PassportModule.register({ defaultStrategy: 'jwt' }),

    // Accounts module for trade-api integration
    AccountsModule,

    // Auth module with all endpoints
    AuthModule,
  ],
  controllers: [HealthController],
  providers: [RedactingLogger, DatabaseInitService],
})
export class AppModule {}
