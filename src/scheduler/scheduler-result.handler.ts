import type { AnalyticsJobEvent } from "@omnixys/contracts/analytics";
import {
  KafkaEvent,
  KafkaEventHandler,
  KafkaTopics,
} from "@omnixys/kafka";
import { Injectable } from "@nestjs/common";
import { SchedulerRuntimeService } from "./scheduler-runtime.service.js";

@KafkaEventHandler("analytics-scheduler-results")
@Injectable()
export class SchedulerResultHandler {
  constructor(private readonly runtime: SchedulerRuntimeService) {}

  @KafkaEvent(KafkaTopics.analytics.reportGenerated)
  reportCompleted(payload: AnalyticsJobEvent): Promise<void> {
    return this.runtime.complete(payload.jobId);
  }

  @KafkaEvent(KafkaTopics.analytics.exportCompleted)
  exportCompleted(payload: AnalyticsJobEvent): Promise<void> {
    return this.runtime.complete(payload.jobId);
  }

  @KafkaEvent(KafkaTopics.analytics.insightGenerated)
  insightCompleted(payload: AnalyticsJobEvent): Promise<void> {
    return this.runtime.complete(payload.jobId);
  }

  @KafkaEvent(KafkaTopics.analytics.reportFailed)
  reportFailed(payload: AnalyticsJobEvent): Promise<void> {
    return this.runtime.fail(payload.jobId, payload.error ?? "Report failed");
  }

  @KafkaEvent(KafkaTopics.analytics.exportFailed)
  exportFailed(payload: AnalyticsJobEvent): Promise<void> {
    return this.runtime.fail(payload.jobId, payload.error ?? "Export failed");
  }

  @KafkaEvent(KafkaTopics.analytics.insightFailed)
  insightFailed(payload: AnalyticsJobEvent): Promise<void> {
    return this.runtime.fail(payload.jobId, payload.error ?? "Insight failed");
  }
}
