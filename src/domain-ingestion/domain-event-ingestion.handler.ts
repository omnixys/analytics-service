import {
  KafkaEvent,
  KafkaEventHandler,
  type IKafkaEventContext,
} from "@omnixys/kafka-ts";
import { Injectable } from "@nestjs/common";
import { DOMAIN_EVENT_TOPICS } from "./domain-event-mapping.registry.js";
import { DomainEventIngestionService } from "./domain-event-ingestion.service.js";

@KafkaEventHandler("analytics-domain-event-ingestion")
@Injectable()
export class DomainEventIngestionHandler {
  constructor(private readonly ingestion: DomainEventIngestionService) {}

  @KafkaEvent(...DOMAIN_EVENT_TOPICS)
  handle(payload: unknown, context: IKafkaEventContext): Promise<void> {
    return this.ingestion.ingest(payload, context);
  }
}
