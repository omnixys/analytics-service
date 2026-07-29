import { Injectable } from "@nestjs/common";

export type ProcessingOutcome =
  | "processed"
  | "duplicate"
  | "quarantined"
  | "failed";

@Injectable()
export class ProcessingMetricsService {
  private readonly counts: Record<ProcessingOutcome, number> = {
    processed: 0,
    duplicate: 0,
    quarantined: 0,
    failed: 0,
  };
  private totalDurationMs = 0;

  record(outcome: ProcessingOutcome, durationMs: number): void {
    this.counts[outcome] += 1;
    this.totalDurationMs += Math.max(0, durationMs);
  }

  snapshot(): ProcessingMetricsSnapshot {
    const total = Object.values(this.counts).reduce(
      (sum, count) => sum + count,
      0,
    );
    return {
      ...this.counts,
      total,
      averageDurationMs: total === 0 ? 0 : this.totalDurationMs / total,
    };
  }
}

export interface ProcessingMetricsSnapshot
  extends Record<ProcessingOutcome, number> {
  total: number;
  averageDurationMs: number;
}
