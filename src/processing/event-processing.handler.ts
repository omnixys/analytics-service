import type { AnalyticsProcessingEvent } from "@omnixys/contracts/analytics";
import {
  KafkaEvent,
  KafkaEventHandler,
  KafkaTopics,
  type IKafkaEventContext,
} from "@omnixys/kafka";
import { Injectable } from "@nestjs/common";
import { EventProcessingService } from "./event-processing.service.js";

@KafkaEventHandler("analytics-event-processing")
@Injectable()
export class EventProcessingHandler {
  constructor(private readonly processing: EventProcessingService) {}

  @KafkaEvent(KafkaTopics.analytics.eventsIngested)
  handle(
    payload: AnalyticsProcessingEvent,
    context: IKafkaEventContext,
  ): Promise<unknown> {
    return this.processing.process(payload, context);
  }
}
