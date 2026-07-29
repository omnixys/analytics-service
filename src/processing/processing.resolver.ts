import { UseGuards } from "@nestjs/common";
import { Field, Int, ObjectType, Query, Resolver } from "@nestjs/graphql";
import { CookieAuthGuard } from "@omnixys/security";
import { ProcessingMetricsService } from "./processing-metrics.service.js";

@ObjectType()
class ProcessingMetricsPayload {
  @Field(() => Int)
  processed!: number;

  @Field(() => Int)
  duplicate!: number;

  @Field(() => Int)
  quarantined!: number;

  @Field(() => Int)
  failed!: number;

  @Field(() => Int)
  total!: number;

  @Field()
  averageDurationMs!: number;
}

@Resolver()
export class ProcessingResolver {
  constructor(private readonly metrics: ProcessingMetricsService) {}

  @Query(() => ProcessingMetricsPayload)
  @UseGuards(CookieAuthGuard)
  analyticsProcessingMetrics(): ProcessingMetricsPayload {
    return this.metrics.snapshot();
  }
}
