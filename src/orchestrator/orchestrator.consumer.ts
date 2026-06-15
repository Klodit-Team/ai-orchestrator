import { Injectable, Logger } from '@nestjs/common';
import { RabbitSubscribe, Nack } from '@golevelup/nestjs-rabbitmq';
import { AgentLauncherService } from './agent-launcher.service';
import { OrchestratorPublisher } from './orchestrator.publisher';

// ─── Payload interfaces ────────────────────────────────────────────────────────

interface DocumentAttachedPayload {
  submissionId: string;
  [key: string]: unknown;
}

interface OcrRequestedPayload {
  submissionId: string;
  [key: string]: unknown;
}

interface GreAGreSubmittedPayload {
  aoId: string;
  gagId: string;
  userId: string;
  justification: string;
  [key: string]: unknown;
}

interface SoumissionsClosedPayload {
  aoId: string;
  soumissionId?: string;
  [key: string]: unknown;
}

interface EvaluationSessionStartedPayload {
  aoId: string;
  evaluationId?: string;
  [key: string]: unknown;
}

// ─── Consumer ─────────────────────────────────────────────────────────────────

/**
 * OrchestratorConsumer listens on the `al-mizan.events` topic exchange and
 * launches the appropriate AI agent child process for each routing key.
 *
 * Retry policy:
 *   Each handler attempts the agent once; on failure it retries exactly one
 *   more time. If the second attempt also fails, an `ia.erreur` event is
 *   published and the message is dead-lettered (Nack without requeue).
 */
@Injectable()
export class OrchestratorConsumer {
  private readonly logger = new Logger(OrchestratorConsumer.name);

  constructor(
    private readonly agentLauncher: AgentLauncherService,
    private readonly publisher: OrchestratorPublisher,
  ) {}

  // ─── Helpers ─────────────────────────────────────────────────────────────────

  /**
   * Runs an agent with a single automatic retry.
   * On permanent failure, publishes `ia.erreur` and returns a Nack so the
   * broker moves the message to the dead-letter exchange.
   */
  private async runWithRetry(
    routingKey: string,
    agentScript: string,
    agentEnv: Record<string, string>,
  ): Promise<void | Nack> {
    const attemptLaunch = () =>
      this.agentLauncher.launchAgent(agentScript, agentEnv);

    try {
      await attemptLaunch();
    } catch (firstErr) {
      const firstMessage =
        firstErr instanceof Error ? firstErr.message : String(firstErr);
      this.logger.warn(
        `Agent ${agentScript} failed on first attempt (${firstMessage}). Retrying once…`,
      );

      try {
        await attemptLaunch();
      } catch (secondErr) {
        const errorMessage =
          secondErr instanceof Error ? secondErr.message : String(secondErr);

        this.logger.error(
          `Agent ${agentScript} failed after retry for routing key "${routingKey}": ${errorMessage}`,
        );

        this.publisher.publishIaErreur({
          routingKey,
          error: errorMessage,
          timestamp: new Date().toISOString(),
        });

        // Nack without requeue → message goes to DLX
        return new Nack(false);
      }
    }
  }

  // ─── Handlers ─────────────────────────────────────────────────────────────────

  /**
   * document.administrative.attached
   * Triggers the OCR/NLP agent to analyse all administrative documents
   * attached to a submission.
   */
  @RabbitSubscribe({
    exchange: 'al-mizan.events',
    routingKey: 'document.administrative.attached',
    queue: 'orchestrator.document.administrative.attached',
    queueOptions: {
      durable: true,
      deadLetterExchange: 'al-mizan.events.dlx',
      deadLetterRoutingKey: 'dead.document.administrative.attached',
    },
  })
  async handleDocumentAdministrativeAttached(
    payload: DocumentAttachedPayload,
  ): Promise<void | Nack> {
    const routingKey = 'document.administrative.attached';
    this.logger.log(
      `Received ${routingKey} — submissionId: ${payload.submissionId}`,
    );

    if (!payload.submissionId) {
      this.logger.error(
        `${routingKey}: missing required field "submissionId" in payload`,
      );
      return new Nack(false);
    }

    return this.runWithRetry(routingKey, 'ocr-nlp-agent.ts', {
      SUBMISSION_ID: payload.submissionId,
    });
  }

  /**
   * document.ocr.requested
   * Direct OCR request for a specific submission document.
   */
  @RabbitSubscribe({
    exchange: 'al-mizan.events',
    routingKey: 'document.ocr.requested',
    queue: 'orchestrator.document.ocr.requested',
    queueOptions: {
      durable: true,
      deadLetterExchange: 'al-mizan.events.dlx',
      deadLetterRoutingKey: 'dead.document.ocr.requested',
    },
  })
  async handleDocumentOcrRequested(
    payload: OcrRequestedPayload,
  ): Promise<void | Nack> {
    const routingKey = 'document.ocr.requested';
    this.logger.log(
      `Received ${routingKey} — submissionId: ${payload.submissionId}`,
    );

    if (!payload.submissionId) {
      this.logger.error(
        `${routingKey}: missing required field "submissionId" in payload`,
      );
      return new Nack(false);
    }

    return this.runWithRetry(routingKey, 'ocr-nlp-agent.ts', {
      SUBMISSION_ID: payload.submissionId,
    });
  }

  /**
   * ao.gre_a_gre.submitted
   * Triggers the Gré-à-Gré conformity analysis agent.
   */
  @RabbitSubscribe({
    exchange: 'al-mizan.events',
    routingKey: 'ao.gre_a_gre.submitted',
    queue: 'orchestrator.ao.gre_a_gre.submitted',
    queueOptions: {
      durable: true,
      deadLetterExchange: 'al-mizan.events.dlx',
      deadLetterRoutingKey: 'dead.ao.gre_a_gre.submitted',
    },
  })
  async handleGreAGreSubmitted(
    payload: GreAGreSubmittedPayload,
  ): Promise<void | Nack> {
    const routingKey = 'ao.gre_a_gre.submitted';
    this.logger.log(
      `Received ${routingKey} — aoId: ${payload.aoId} | gagId: ${payload.gagId}`,
    );

    if (!payload.aoId || !payload.gagId) {
      this.logger.error(
        `${routingKey}: missing required fields "aoId" or "gagId" in payload`,
      );
      return new Nack(false);
    }

    return this.runWithRetry(routingKey, 'gre-a-gre-agent.ts', {
      AO_ID: payload.aoId,
      GAG_ID: payload.gagId,
      USER_ID: payload.userId ?? '',
      JUSTIFICATION_TEXT: payload.justification ?? '',
    });
  }

  /**
   * soumissions.closed
   * Triggers the anomaly detection agent once the submission window closes.
   */
  @RabbitSubscribe({
    exchange: 'al-mizan.events',
    routingKey: 'soumissions.closed',
    queue: 'orchestrator.soumissions.closed',
    queueOptions: {
      durable: true,
      deadLetterExchange: 'al-mizan.events.dlx',
      deadLetterRoutingKey: 'dead.soumissions.closed',
    },
  })
  async handleSoumissionsClosed(
    payload: SoumissionsClosedPayload,
  ): Promise<void | Nack> {
    const routingKey = 'soumissions.closed';
    this.logger.log(
      `Received ${routingKey} — aoId: ${payload.aoId}`,
    );

    if (!payload.aoId) {
      this.logger.error(
        `${routingKey}: missing required field "aoId" in payload`,
      );
      return new Nack(false);
    }

    // Build the anomaly endpoint for the specific soumission if provided,
    // otherwise keep the parameterised template (agent resolves it at runtime).
    const anomalyEndpoint = payload.soumissionId
      ? `/api/v1/soumissions/${payload.soumissionId}/anomalies`
      : '/api/v1/soumissions/{soumissionId}/anomalies';

    return this.runWithRetry(routingKey, 'anomaly-agent.ts', {
      AO_ID: payload.aoId,
      SOUMMISSION_ANOMALY_ENDPOINT: anomalyEndpoint,
    });
  }

  /**
   * evaluation.session.started
   * Triggers the evaluation assistant agent when an evaluation session opens.
   */
  @RabbitSubscribe({
    exchange: 'al-mizan.events',
    routingKey: 'evaluation.session.started',
    queue: 'orchestrator.evaluation.session.started',
    queueOptions: {
      durable: true,
      deadLetterExchange: 'al-mizan.events.dlx',
      deadLetterRoutingKey: 'dead.evaluation.session.started',
    },
  })
  async handleEvaluationSessionStarted(
    payload: EvaluationSessionStartedPayload,
  ): Promise<void | Nack> {
    const routingKey = 'evaluation.session.started';
    this.logger.log(
      `Received ${routingKey} — aoId: ${payload.aoId}${payload.evaluationId ? ` | evaluationId: ${payload.evaluationId}` : ''}`,
    );

    if (!payload.aoId) {
      this.logger.error(
        `${routingKey}: missing required field "aoId" in payload`,
      );
      return new Nack(false);
    }

    const agentEnv: Record<string, string> = {
      AO_ID: payload.aoId,
    };

    if (payload.evaluationId) {
      agentEnv.EVALUATION_ID = payload.evaluationId;
    }

    return this.runWithRetry(routingKey, 'evaluation-agent.ts', agentEnv);
  }
}
