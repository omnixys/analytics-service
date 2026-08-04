import { Injectable } from '@nestjs/common';
import { metrics } from '@opentelemetry/api';

export type ProcessingOutcome = 'processed' | 'duplicate' | 'quarantined' | 'failed';

@Injectable()
export class ProcessingMetricsService {
  private readonly processedCounter = metrics
    .getMeter('analytics-processing')
    .createCounter('analytics_processing_events', {
      description: 'Analytics events handled by processing outcome',
    });
  private readonly durationHistogram = metrics
    .getMeter('analytics-processing')
    .createHistogram('analytics_processing_duration', {
      description: 'Analytics event processing duration',
      unit: 'ms',
    });
  private readonly counts: Record<ProcessingOutcome, number> = {
    processed: 0,
    duplicate: 0,
    quarantined: 0,
    failed: 0,
  };
  private totalDurationMs = 0;

  record(outcome: ProcessingOutcome, durationMs: number): void {
    const safeDurationMs = Math.max(0, durationMs);
    this.counts[outcome] += 1;
    this.totalDurationMs += safeDurationMs;
    this.processedCounter.add(1, { outcome });
    this.durationHistogram.record(safeDurationMs, { outcome });
  }

  snapshot(): ProcessingMetricsSnapshot {
    const total = Object.values(this.counts).reduce((sum, count) => sum + count, 0);
    return {
      ...this.counts,
      total,
      averageDurationMs: total === 0 ? 0 : this.totalDurationMs / total,
    };
  }
}

export interface ProcessingMetricsSnapshot extends Record<ProcessingOutcome, number> {
  total: number;
  averageDurationMs: number;
}
