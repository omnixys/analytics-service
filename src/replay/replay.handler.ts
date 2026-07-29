import type { AnalyticsJobEvent } from "@omnixys/contracts/analytics";
import {
  KafkaEvent,
  KafkaEventHandler,
  KafkaTopics,
} from "@omnixys/kafka";
import { Injectable } from "@nestjs/common";
import { ReplayService } from "./replay.service.js";

@KafkaEventHandler("analytics-replay")
@Injectable()
export class ReplayHandler {
  constructor(private readonly replay: ReplayService) {}

  @KafkaEvent(KafkaTopics.analytics.replayRequested)
  execute(payload: AnalyticsJobEvent): Promise<void> {
    return this.replay.execute(payload.jobId);
  }
}
