import { Module } from "@nestjs/common";
import { CatalogModule } from "../catalog/catalog.module.js";
import { EventProcessingHandler } from "./event-processing.handler.js";
import { EventProcessingService } from "./event-processing.service.js";
import { EventNormalizerService } from "./event-normalizer.service.js";
import { ProcessingMetricsService } from "./processing-metrics.service.js";
import { ProcessingResolver } from "./processing.resolver.js";

@Module({
  imports: [CatalogModule],
  providers: [
    EventNormalizerService,
    ProcessingMetricsService,
    EventProcessingService,
    EventProcessingHandler,
    ProcessingResolver,
  ],
  exports: [EventProcessingService, ProcessingMetricsService],
})
export class ProcessingModule {}
