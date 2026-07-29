import { Module } from "@nestjs/common";
import { LineageModule } from "../lineage/lineage.module.js";
import { AggregationService } from "./aggregation.service.js";
import { AnalyticsEngineHandler } from "./analytics-engine.handler.js";
import { AnalyticsEngineResolver } from "./analytics-engine.resolver.js";
import { MetricCompilerService } from "./metric-compiler.service.js";
import { RealtimeMetricsService } from "./realtime-metrics.service.js";
import { SemanticQueryService } from "./semantic-query.service.js";

@Module({
  imports: [LineageModule],
  providers: [
    MetricCompilerService,
    RealtimeMetricsService,
    AggregationService,
    SemanticQueryService,
    AnalyticsEngineHandler,
    AnalyticsEngineResolver,
  ],
  exports: [
    MetricCompilerService,
    RealtimeMetricsService,
    AggregationService,
    SemanticQueryService,
  ],
})
export class AnalyticsEngineModule {}
