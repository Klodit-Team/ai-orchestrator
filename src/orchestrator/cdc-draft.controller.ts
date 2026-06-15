import { Body, Controller, HttpCode, HttpException, HttpStatus, Logger, Post } from '@nestjs/common';
import { AgentLauncherService } from './agent-launcher.service';

interface CdcDraftBody {
  aoId: string;
  sectionType: string;
  userPrompt?: string;
  sensitivity?: 'highly_sensitive' | 'sensitive' | 'non_sensitive';
}

interface CdcDraftResult {
  draft: string;
  biasDetected: boolean;
  correctedDraft?: string;
}

@Controller('ai')
export class CdcDraftController {
  private readonly logger = new Logger(CdcDraftController.name);

  constructor(private readonly launcher: AgentLauncherService) {}

  @Post('cdc-draft')
  @HttpCode(200)
  async generate(@Body() body: CdcDraftBody): Promise<CdcDraftResult> {
    const { aoId, sectionType, userPrompt = '', sensitivity = 'non_sensitive' } = body;

    if (!aoId || !sectionType) {
      throw new HttpException('aoId and sectionType are required', HttpStatus.BAD_REQUEST);
    }

    this.logger.log(`CDC draft requested: AO=${aoId} section=${sectionType}`);

    try {
      return await this.launcher.launchAgentWithOutput<CdcDraftResult>('genai-cdc-agent.ts', {
        AO_ID: aoId,
        SECTION_TYPE: sectionType,
        USER_PROMPT: userPrompt,
        LLM_SENSITIVITY: sensitivity,
      });
    } catch (err) {
      this.logger.error(`CDC draft failed: ${(err as Error).message}`);
      throw new HttpException(
        'AI CDC generation failed — try again later',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }
}
