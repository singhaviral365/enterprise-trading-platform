import 'dotenv/config';
import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';
import { AuthModule } from './auth/auth.module';
import { configuration } from './config/configuration';
import { GlobalExceptionFilter } from './common/filters/global-exception.filter';

async function bootstrap() {
  // Load and validate configuration at startup
  const config = configuration();

  const app = await NestFactory.create(AppModule);

  app.enableCors({
    origin: ['http://localhost:4200', 'http://127.0.0.1:5500/'], 
    methods: 'GET, POST ,PUT, DELETE', 
    allowedHeaders: 'Content-Type ,Authorization',
    credentials: true
  });

  const swaggerConfig = new DocumentBuilder()
    .setTitle('Auth service')
    .setDescription(
      'Registration, login, token refresh and current-user lookup for the Enterprise Trading Platform.',
    )
    .setVersion('1.0.0')
    .addBearerAuth(
      {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
        description: 'An access token issued by /auth/login or /auth/refresh.',
      },
      'bearer',
    )
    .build();

  const swaggerDocument = SwaggerModule.createDocument(app, swaggerConfig, {
    include: [AuthModule],
  });

  SwaggerModule.setup('api-docs', app, swaggerDocument, {
    jsonDocumentUrl: 'api-docs-json',
  });

  // Global exception filter (converts all exceptions to error envelope)
  app.useGlobalFilters(new GlobalExceptionFilter());

  // Global validation pipe with class-validator
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true, // Reject properties not in the DTO
      forbidNonWhitelisted: true, // Throw error if extra properties present
      transform: true, // Transform input data to DTO class instances
      transformOptions: {
        enableImplicitConversion: true,
      },
      stopAtFirstError: false, // Report all validation errors
      errorHttpStatusCode: 400, // Will be converted to 422 by exception filter
    }),
  );

  await app.listen(config.port, '0.0.0.0');
  console.log(`Auth service is running on http://0.0.0.0:${config.port}`);
  console.log(`Swagger documentation is running on http://127.0.0.1:${config.port}/api-docs`);
}

bootstrap().catch((err) => {
  console.error('Failed to start application:', err);
  process.exit(1);
});
