import { ValkeyService } from "@omnixys/cache";
import { Injectable } from "@nestjs/common";

const SUPPORTED_WINDOWS = [1, 5, 15, 60] as const;

@Injectable()
export class RealtimeMetricsService {
  constructor(private readonly valkey: ValkeyService) {}

  async project(
    workspaceId: string,
    metricVersionId: string,
    value: number,
    occurredAt: Date,
  ): Promise<void> {
    await Promise.all(
      SUPPORTED_WINDOWS.map(async (windowMinutes) => {
        const bucket = realtimeBucket(occurredAt, windowMinutes);
        const key = realtimeKey(
          workspaceId,
          metricVersionId,
          windowMinutes,
          bucket,
        );
        await this.valkey.rawSet(key, String(value), windowMinutes * 60 + 300);
      }),
    );
  }

  async read(
    workspaceId: string,
    metricVersionId: string,
    windowMinutes: number,
    now = new Date(),
  ): Promise<number | null> {
    if (!SUPPORTED_WINDOWS.includes(windowMinutes as 1 | 5 | 15 | 60)) {
      return null;
    }
    const value = await this.valkey.rawGet(
      realtimeKey(
        workspaceId,
        metricVersionId,
        windowMinutes,
        realtimeBucket(now, windowMinutes),
      ),
    );
    if (value === null) return null;
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
}

function realtimeBucket(date: Date, windowMinutes: number): number {
  const sizeMs = windowMinutes * 60_000;
  return Math.floor(date.getTime() / sizeMs) * sizeMs;
}

function realtimeKey(
  workspaceId: string,
  metricVersionId: string,
  windowMinutes: number,
  bucket: number,
): string {
  return `realtime:${workspaceId}:${metricVersionId}:${windowMinutes}:${bucket}`;
}
