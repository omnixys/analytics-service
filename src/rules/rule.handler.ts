import type { AnalyticsProcessingEvent } from "@omnixys/contracts/analytics";
import {
  KafkaEvent,
  KafkaEventHandler,
  KafkaTopics,
} from "@omnixys/kafka";
import { Injectable } from "@nestjs/common";
import { RuleRuntimeService } from "./rule-runtime.service.js";

@KafkaEventHandler("analytics-rule-runtime")
@Injectable()
export class RuleHandler {
  constructor(private readonly rules: RuleRuntimeService) {}

  @KafkaEvent(KafkaTopics.analytics.eventsProcessed)
  process(payload: AnalyticsProcessingEvent): Promise<number> {
    return this.rules.process(payload);
  }
}
