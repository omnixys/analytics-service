import type { AnalyticsProcessingEvent } from "@omnixys/contracts/analytics";
import {
  KafkaEvent,
  KafkaEventHandler,
  KafkaTopics,
} from "@omnixys/kafka";
import { Injectable } from "@nestjs/common";
import { AggregationService } from "./aggregation.service.js";

@KafkaEventHandler("analytics-aggregation")
@Injectable()
export class AnalyticsEngineHandler {
  constructor(private readonly aggregation: AggregationService) {}

  @KafkaEvent(KafkaTopics.analytics.eventsProcessed)
  process(payload: AnalyticsProcessingEvent): Promise<number> {
    return this.aggregation.process(payload);
  }
}
