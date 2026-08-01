import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { ValkeyModule } from "@omnixys/cache-ts";
import { ContextModule } from "@omnixys/context-ts";
import { OmnixysGraphQLModule } from "@omnixys/graphql-ts";
import { OmnixysHttpModule } from "@omnixys/http-ts";
import { KafkaModule } from "@omnixys/kafka-ts";
import { LoggerModule } from "@omnixys/logger-ts";
import { ObservabilityModule } from "@omnixys/observability-ts";
import { SecurityModule } from "@omnixys/security-ts";
import { CatalogModule } from "./catalog/catalog.module.js";
import { AnalyticsEngineModule } from "./analytics-engine/analytics-engine.module.js";
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
import { RuleModule } from "./rules/rule.module.js";
import { DomainEventIngestionModule } from "./domain-ingestion/domain-event-ingestion.module.js";
import { BrowserTokenModule } from "./browser-token/browser-token.module.js";
import { env } from "./config/env.js";
import { FastifyReply, FastifyRequest } from "fastify";
import { BannerService } from "./config/banner.service.js";
import { RateLimitValkeyAdapterModule } from "./adapter/rate-limit/rate-limit-valkey-adapter.module.js";

const {
  SCHEMA_TARGET,
  SERVICE,
  KAFKA_BROKER,
  TEMPO_URI,
  VALKEY_URL,
  VALKEY_PASSWORD,
  ENCRYPTION_KEY,
  KC_URL,
  KC_REALM,
  RATE_LIMIT_REQUESTS
} = env;

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ContextModule.forRoot(),
    OmnixysHttpModule.forRoot({ serviceName: SERVICE }),
    ValkeyModule.forRoot({
      serviceName: SERVICE,
      url: VALKEY_URL,
      password: VALKEY_PASSWORD,
      pubSub: { enabled: true },
      streams: { enabled: true },
    }),
    SecurityModule.forRoot({
      jwt: {
        issuer: `${KC_URL}/realms/${KC_REALM}`,
        jwksUri: `${KC_URL}/realms/${KC_REALM}/protocol/openid-connect/certs`,
      },
      rateLimit: {
        enabled: true,
        defaultLimit: RATE_LIMIT_REQUESTS,
        defaultWindowMs: 60000,
        imports: [RateLimitValkeyAdapterModule],
      },
      hash: { encryptionKey: ENCRYPTION_KEY },
    }),

    OmnixysGraphQLModule.forRoot({
      context: ({ req, reply }: { req: FastifyRequest; reply: FastifyReply }) => ({
        req,
        reply,
      }),
      autoSchemaFile:
        SCHEMA_TARGET === 'tmp'
          ? { path: '/tmp/schema.gql', federation: 2 }
          : SCHEMA_TARGET === 'false'
            ? false
            : { path: 'dist/schema.gql', federation: 2 },
    }),

    KafkaModule.forRoot({
      clientId: SERVICE,
      brokers: [KAFKA_BROKER],
      groupId: `${SERVICE}-consumer`,
      serviceName: SERVICE,
      retry: { maxRetries: 5 },
      idempotency: { enabled: true, ttlSeconds: 86_400 },
    }),
    ObservabilityModule.forRoot({
      serviceName: SERVICE,
      otel: {
        endpoint: TEMPO_URI,
        transport: "http",
        samplingRatio: 1,
      },
      metrics: { enabled: true, port: 9470 },
    }),
    LoggerModule.forRoot({
      serviceName: SERVICE,
      registerGlobalInterceptor: true,

      batch: {
        enabled: true,
        maxSize: 50,
        flushInterval: 2000,
      },
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
    RuleModule,
    DomainEventIngestionModule,
    BrowserTokenModule,
    HealthModule,
  ],
  providers: [PlatformResolver, BannerService],
})
export class AppModule {}
