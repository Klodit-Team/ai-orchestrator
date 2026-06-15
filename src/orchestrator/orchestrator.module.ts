import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AgentLauncherService } from './agent-launcher.service';
import { OrchestratorConsumer } from './orchestrator.consumer';
import { OrchestratorPublisher } from './orchestrator.publisher';
import { CdcDraftController } from './cdc-draft.controller';

@Module({
  imports: [ConfigModule],
  controllers: [CdcDraftController],
  providers: [
    AgentLauncherService,
    OrchestratorPublisher,
    OrchestratorConsumer,
  ],
})
export class OrchestratorModule {}
