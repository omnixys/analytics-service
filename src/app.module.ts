import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { ValkeyModule } from "@omnixys/cache";
import { ContextModule } from "@omnixys/context";
import { OmnixysGraphQLModule } from "@omnixys/graphql";
import { KafkaModule } from "@omnixys/kafka";
import { LoggerModule } from "@omnixys/logger";
import { ObservabilityModule } from "@omnixys/observability";
import { SecurityModule } from "@omnixys/security";
import { CatalogModule } from "./catalog/catalog.module.js";
import { AnalyticsEngineModule } from "./analytics-engine/analytics-engine.module.js";
import { env } from "./config.js";
import { PlatformResolver } from "./graphql/platform.resolver.js";
import { HealthModule } from "./health/health.module.js";
import { IngestionModule } from "./ingestion/ingestion.module.js";
import { PrismaModule } from "./prisma/prisma.module.js";
import { ProcessingModule } from "./processing/processing.module.js";
import { LineageModule } from "./lineage/lineage.module.js";
import { ReplayModule } from "./replay/replay.module.js";
import { SearchModule } from "./search/search.module.js";
import { SchedulerModule } from "./scheduler/scheduler.module.js";
import { FeatureFlagModule } from "./feature-flags/feature-flag.module.js";

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ContextModule.forRoot(),
    ValkeyModule.forRoot({
      serviceName: env.SERVICE,
      url: env.VALKEY_URL,
      password: env.VALKEY_PASSWORD,
      pubSub: { enabled: true },
      streams: { enabled: true },
    }),
    SecurityModule.forRoot({
      jwt: {
        issuer: `${env.KC_URL}/realms/${env.KC_REALM}`,
        jwksUri: `${env.KC_URL}/realms/${env.KC_REALM}/protocol/openid-connect/certs`,
      },
      rateLimit: { enabled: false },
      hash: { encryptionKey: env.ENCRYPTION_KEY },
    }),
    OmnixysGraphQLModule.forRoot({
      autoSchemaFile:
        env.SCHEMA_TARGET === "tmp"
          ? { path: "/tmp/analytics-schema.gql", federation: 2 }
          : { path: "dist/schema.gql", federation: 2 },
      sortSchema: true,
    }),
    KafkaModule.forRoot({
      clientId: env.SERVICE,
      brokers: [env.KAFKA_BROKER],
      groupId: `${env.SERVICE}-consumer`,
      serviceName: env.SERVICE,
      retry: { maxRetries: 5 },
      idempotency: { enabled: true, ttlSeconds: 86_400 },
    }),
    ObservabilityModule.forRoot({
      serviceName: env.SERVICE,
      otel: {
        endpoint: env.OTEL_ENDPOINT,
        transport: "http",
        samplingRatio: 1,
      },
      metrics: { enabled: true, port: 9470 },
    }),
    LoggerModule.forRoot({
      serviceName: env.SERVICE,
      registerGlobalInterceptor: true,
    }),
    PrismaModule,
    CatalogModule,
    IngestionModule,
    ProcessingModule,
    LineageModule,
    AnalyticsEngineModule,
    ReplayModule,
    SearchModule,
    SchedulerModule,
    FeatureFlagModule,
    HealthModule,
  ],
  providers: [PlatformResolver],
})
export class AppModule {}
