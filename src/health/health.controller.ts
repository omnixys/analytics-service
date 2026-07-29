import { Controller, Get } from "@nestjs/common";

@Controller("health")
export class HealthController {
  @Get()
  health(): { status: "ok"; service: "analytics" } {
    return { status: "ok", service: "analytics" };
  }
}
