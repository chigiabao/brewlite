import 'dotenv/config';
import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import helmet from 'helmet';
import { AppModule } from './app.module.js';
import { getAllowedOrigins, isProduction, validateEnvironment } from './config/app-config.js';

async function bootstrap() {
  validateEnvironment();

  const app = await NestFactory.create(AppModule, { rawBody: true });
  const allowedOrigins = getAllowedOrigins();

  if (isProduction()) {
    app.getHttpAdapter().getInstance().set('trust proxy', 1);
  }

  app.use(helmet({ contentSecurityPolicy: false }));
  app.enableCors({
    origin: (origin: string | undefined, callback: (error: Error | null, allow?: boolean) => void) => {
      if (!origin || allowedOrigins.includes(origin)) {
        callback(null, true);
        return;
      }
      callback(new Error(`Origin not allowed by CORS: ${origin}`), false);
    },
    methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'Idempotency-Key', 'Stripe-Signature'],
    maxAge: 600,
  });
  app.useGlobalPipes(
    new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
  );
  app.enableShutdownHooks();
  await app.listen(process.env.PORT ?? 3001);
}
await bootstrap();
