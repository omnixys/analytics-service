import { Module } from "@nestjs/common";
import { AnalyticsEngineModule } from "../analytics-engine/analytics-engine.module.js";
import { CatalogModule } from "../catalog/catalog.module.js";
import { RuleModule } from "../rules/rule.module.js";
import { EventProcessingHandler } from "./event-processing.handler.js";
import { EventProcessingService } from "./event-processing.service.js";
import { EventNormalizerService } from "./event-normalizer.service.js";
import { ProcessedEventRouter } from "./processed-event.router.js";
import { ProcessingMetricsService } from "./processing-metrics.service.js";
import { ProcessingResolver } from "./processing.resolver.js";

@Module({
  imports: [CatalogModule, AnalyticsEngineModule, RuleModule],
  providers: [
    EventNormalizerService,
    ProcessingMetricsService,
    EventProcessingService,
    EventProcessingHandler,
    ProcessedEventRouter,
    ProcessingResolver,
  ],
  exports: [EventProcessingService, ProcessingMetricsService],
})
export class ProcessingModule {}
