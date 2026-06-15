import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { RabbitMQModule } from '@golevelup/nestjs-rabbitmq';
import { OrchestratorModule } from './orchestrator/orchestrator.module';

@Module({
  imports: [
    // ─── Global configuration (reads process.env + optional .env file) ────────
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
    }),

    // ─── RabbitMQ connection shared across the app ────────────────────────────
    // global:true makes AmqpConnection/AmqpConnectionManager available in every
    // feature module (e.g. OrchestratorPublisher) without re-importing the module.
    {
      ...RabbitMQModule.forRootAsync({
        useFactory: (configService: ConfigService) => ({
          uri: configService.get<string>('RABBITMQ_URL', 'amqp://guest:guest@localhost:5672'),
          exchanges: [
            {
              name: 'al-mizan.events',
              type: 'topic',
              options: { durable: true },
            },
          ],
          connectionInitOptions: {
            wait: true,
            timeout: 30_000,
            reject: true,
          },
          channels: {
            'orchestrator-channel': {
              prefetchCount: 5,
              default: true,
            },
          },
        }),
        inject: [ConfigService],
      }),
      global: true,
    },

    // ─── Feature modules ──────────────────────────────────────────────────────
    OrchestratorModule,
  ],
})
export class AppModule {}
