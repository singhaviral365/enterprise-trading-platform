import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { AppModule } from './app.module';
import { configuration } from './config/configuration';

async function bootstrap() {
  // Load and validate configuration at startup
  const config = configuration();

  const app = await NestFactory.create(AppModule);

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
    }),
  );

  await app.listen(config.port, '0.0.0.0');
  console.log(`Auth service is running on http://0.0.0.0:${config.port}`);
}

bootstrap().catch((err) => {
  console.error('Failed to start application:', err);
  process.exit(1);
});
