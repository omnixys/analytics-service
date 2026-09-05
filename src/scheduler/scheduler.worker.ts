import {
  Injectable,
  Logger,
  type OnApplicationBootstrap,
  type OnApplicationShutdown,
} from "@nestjs/common";
import { randomUUID } from "node:crypto";
import { SchedulerRuntimeService } from "./scheduler-runtime.service.js";

@Injectable()
export class SchedulerWorker
  implements OnApplicationBootstrap, OnApplicationShutdown
{
  private readonly logger = new Logger(SchedulerWorker.name);
  private readonly workerId = `analytics:${process.pid}:${randomUUID()}`;
  private timer?: NodeJS.Timeout;
  private running = false;

  constructor(private readonly runtime: SchedulerRuntimeService) {}

  onApplicationBootstrap(): void {
    this.timer = setInterval(() => void this.poll(), 1_000);
    this.timer.unref();
    void this.poll();
  }

  onApplicationShutdown(): void {
    if (this.timer) clearInterval(this.timer);
  }

  private async poll(): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      await this.runtime.tick(this.workerId);
    } catch (error) {
      this.logger.error(
        "Scheduler polling failed: %o",
        error instanceof Error ? error.stack : undefined,
      );
    } finally {
      this.running = false;
    }
  }
}
