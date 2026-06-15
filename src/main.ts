import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { Logger } from '@nestjs/common';
import { AppModule } from './app.module';

async function bootstrap() {
  const logger = new Logger('AI-Orchestrator');

  const app = await NestFactory.create(AppModule, {
    logger: ['log', 'warn', 'error', 'debug', 'verbose'],
  });

  // The orchestrator has no HTTP endpoints — disable the HTTP server by
  // listening on a port only to satisfy NestJS lifecycle; 0 means OS-assigned.
  const port = process.env.PORT ?? 3099;
  await app.listen(port);

  logger.log(`AI Orchestrator running on port ${port}`);
  logger.log(
    `RabbitMQ exchange: al-mizan.events @ ${process.env.RABBITMQ_URL ?? 'amqp://guest:guest@localhost:5672'}`,
  );
}

bootstrap().catch((err) => {
  console.error('Fatal error during AI Orchestrator bootstrap', err);
  process.exit(1);
});
