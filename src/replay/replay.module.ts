import { Module } from "@nestjs/common";
import { ReplayHandler } from "./replay.handler.js";
import { ReplayResolver } from "./replay.resolver.js";
import { ReplayService } from "./replay.service.js";

@Module({
  providers: [ReplayService, ReplayHandler, ReplayResolver],
  exports: [ReplayService],
})
export class ReplayModule {}
