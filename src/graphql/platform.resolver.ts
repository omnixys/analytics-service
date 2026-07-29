import { Field, ObjectType, Query, Resolver } from "@nestjs/graphql";

@ObjectType()
class AnalyticsPlatformInfo {
  @Field()
  name!: string;

  @Field()
  apiVersion!: string;

  @Field()
  processingVersion!: string;
}

@Resolver()
export class PlatformResolver {
  @Query(() => AnalyticsPlatformInfo)
  analyticsPlatformInfo(): AnalyticsPlatformInfo {
    return {
      name: "Omnixys Analytics & Insights Platform",
      apiVersion: "v1",
      processingVersion: "analytics-service@1.0.0",
    };
  }
}
