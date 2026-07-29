import { Module } from "@nestjs/common";
import { CronService } from "./cron.service.js";
import { SchedulerResolver } from "./scheduler.resolver.js";
import { SchedulerResultHandler } from "./scheduler-result.handler.js";
import { SchedulerRuntimeService } from "./scheduler-runtime.service.js";
import { SchedulerService } from "./scheduler.service.js";
import { SchedulerWorker } from "./scheduler.worker.js";

@Module({
  providers: [
    CronService,
    SchedulerService,
    SchedulerRuntimeService,
    SchedulerWorker,
    SchedulerResultHandler,
    SchedulerResolver,
  ],
  exports: [CronService, SchedulerService, SchedulerRuntimeService],
})
export class SchedulerModule {}
