import { Injectable, Logger } from '@nestjs/common';
import { AmqpConnection } from '@golevelup/nestjs-rabbitmq';

export interface IaErreurPayload {
  routingKey: string;
  error: string;
  timestamp: string;
}

@Injectable()
export class OrchestratorPublisher {
  private readonly logger = new Logger(OrchestratorPublisher.name);
  private readonly exchange = 'al-mizan.events';

  constructor(private readonly amqpConnection: AmqpConnection) {}

  /**
   * Publishes an `ia.erreur` event to the al-mizan.events topic exchange.
   * Called whenever an agent fails after exhausting its retry budget.
   */
  publishIaErreur(payload: IaErreurPayload): void {
    this.logger.error(
      `Publishing ia.erreur — routing key that failed: ${payload.routingKey} | error: ${payload.error}`,
    );

    this.amqpConnection
      .publish(this.exchange, 'ia.erreur', payload)
      .catch((publishErr: Error) => {
        // Log but do not rethrow — publishing the error event itself must not
        // crash the consumer or cause infinite retry loops.
        this.logger.error(
          `Failed to publish ia.erreur event: ${publishErr.message}`,
          publishErr.stack,
        );
      });
  }
}
