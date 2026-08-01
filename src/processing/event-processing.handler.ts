import type { AnalyticsProcessingEvent } from "@omnixys/contracts-ts/analytics";
import {
  KafkaEvent,
  KafkaEventHandler,
  KafkaTopics,
  type IKafkaEventContext,
} from "@omnixys/kafka-ts";
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
