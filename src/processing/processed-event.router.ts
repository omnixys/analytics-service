import type { AnalyticsProcessingEvent } from "@omnixys/contracts-ts/analytics";
import {
  KafkaEvent,
  KafkaEventHandler,
  KafkaTopics,
} from "@omnixys/kafka-ts";
import { Injectable } from "@nestjs/common";
import { AggregationService } from "../analytics-engine/aggregation.service.js";
import { RuleRuntimeService } from "../rules/rule-runtime.service.js";

@KafkaEventHandler("analytics-event-router")
@Injectable()
export class ProcessedEventRouter {
  constructor(
    private readonly aggregation: AggregationService,
    private readonly rules: RuleRuntimeService,
  ) {}

  @KafkaEvent(KafkaTopics.analytics.eventsProcessed)
  async route(payload: AnalyticsProcessingEvent): Promise<void> {
    await Promise.all([
      this.aggregation.process(payload),
      this.rules.process(payload),
    ]);
  }
}
