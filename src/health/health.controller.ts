import {
  Controller,
  Get,
  ServiceUnavailableException,
} from "@nestjs/common";
import { ReadinessService } from "./readiness.service.js";

@Controller("health")
export class HealthController {
  constructor(private readonly readiness: ReadinessService) {}

  @Get()
  health(): { status: "ok"; service: "analytics" } {
    return { status: "ok", service: "analytics" };
  }

  @Get("live")
  live(): { status: "ok" } {
    return { status: "ok" };
  }

  @Get("ready")
  async ready(): Promise<{
    status: "ready";
    checks: { postgres: boolean; kafka: boolean; valkey: boolean };
  }> {
    const snapshot = await this.readiness.snapshot();
    if (!snapshot.ready) {
      throw new ServiceUnavailableException({
        status: "not_ready",
        checks: snapshot.checks,
      });
    }
    return { status: "ready", checks: snapshot.checks };
  }
}
