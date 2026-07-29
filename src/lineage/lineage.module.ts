import { Module } from "@nestjs/common";
import { LineageResolver } from "./lineage.resolver.js";
import { LineageService } from "./lineage.service.js";

@Module({
  providers: [LineageService, LineageResolver],
  exports: [LineageService],
})
export class LineageModule {}
