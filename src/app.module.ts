import { RateLimitValkeyAdapterModule } from './adapter/rate-limit/rate-limit-valkey-adapter.module.js';
import { AnalyticsEngineModule } from './analytics-engine/analytics-engine.module.js';
import { BrowserTokenModule } from './browser-token/browser-token.module.js';
import { CatalogModule } from './catalog/catalog.module.js';
import { BannerService } from './config/banner.service.js';
import { env } from './config/env.js';
import { DomainEventIngestionModule } from './domain-ingestion/domain-event-ingestion.module.js';
import { FeatureFlagModule } from './feature-flags/feature-flag.module.js';
import { PlatformResolver } from './graphql/platform.resolver.js';
import { HealthModule } from './health/health.module.js';
import { IngestionModule } from './ingestion/ingestion.module.js';
import { LineageModule } from './lineage/lineage.module.js';
import { PrismaModule } from './prisma/prisma.module.js';
import { ProcessingModule } from './processing/processing.module.js';
import { ReplayModule } from './replay/replay.module.js';
import { RuleModule } from './rules/rule.module.js';
import { SchedulerModule } from './scheduler/scheduler.module.js';
import { SearchModule } from './search/search.module.js';
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ValkeyModule } from '@omnixys/cache-ts';
import { ContextModule, trustedProxyPolicyFromAddresses } from '@omnixys/context-ts';
import { OmnixysGraphQLModule } from '@omnixys/graphql-ts';
import { OmnixysHttpModule } from '@omnixys/http-ts';
import { KafkaModule } from '@omnixys/kafka-ts';
import { LoggerModule } from '@omnixys/logger-ts';
import { ObservabilityModule } from '@omnixys/observability-ts';
import { SecurityModule } from '@omnixys/security-ts';
import { FastifyReply, FastifyRequest } from 'fastify';

const {
  SCHEMA_TARGET,
  SERVICE,
  NODE_ENV,

  KC_URL,
  KC_REALM,

  KAFKA_BROKER,
  KAFKA_IDEMPOTENCY_ENABLE,
  KAFKA_IDEMPOTENCY_TTL,
  KAFKA_RETRY,

  OTEL_LOGS_ENABLED,
  OTEL_URI,
  OTEL_TRANSPORT_MODE,
  OTEL_SAMPLING_RATIO,
  PROMETHEUS_ENABLE,
  PROMETHEUS_PORT,

  VALKEY_URL,
  VALKEY_PASSWORD,

  ENCRYPTION_KEY,
  DEFAULT_TENANT_ID,

  RATE_LIMIT_ENABLE,
  RATE_LIMIT_REQUESTS,
  RATE_LIMIT_WINDOW,

  LOG_BATCH_ENABLE,
  LOG_BATCH_FLUSH_INTERVAL,
  LOG_BATCH_MAX_SIZE,

  TRUSTED_PROXY_ADDRESSES,
} = env;

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ContextModule.forRoot({
      tenant: {
        mode: NODE_ENV === 'production' ? 'strict' : 'legacy',
        ...(DEFAULT_TENANT_ID ? { defaultTenantId: DEFAULT_TENANT_ID } : {}),
      },
      trustedProxyPolicy: trustedProxyPolicyFromAddresses(TRUSTED_PROXY_ADDRESSES),
    }),
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
        enabled: RATE_LIMIT_ENABLE,
        defaultLimit: RATE_LIMIT_REQUESTS,
        defaultWindowMs: RATE_LIMIT_WINDOW,
        imports: [RateLimitValkeyAdapterModule],
      },
      hash: {
        encryptionKey: ENCRYPTION_KEY,
      },
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
      groupId: `${SERVICE}-group`,
      serviceName: SERVICE,
      retry: { maxRetries: KAFKA_RETRY },
      idempotency: { enabled: KAFKA_IDEMPOTENCY_ENABLE, ttlSeconds: KAFKA_IDEMPOTENCY_TTL },
    }),

    ObservabilityModule.forRoot({
      serviceName: SERVICE,

      otel: {
        endpoint: OTEL_URI,
        transport: OTEL_TRANSPORT_MODE as 'http' | 'grpc',
        samplingRatio: OTEL_SAMPLING_RATIO,
      },

      logs: {
        enabled: OTEL_LOGS_ENABLED,
      },

      metrics: {
        port: PROMETHEUS_PORT,
        enabled: PROMETHEUS_ENABLE,
      },
    }),

    LoggerModule.forRoot({
      serviceName: SERVICE,
      registerGlobalInterceptor: true,

      batch: {
        enabled: LOG_BATCH_ENABLE,
        maxSize: LOG_BATCH_MAX_SIZE,
        flushInterval: LOG_BATCH_FLUSH_INTERVAL,
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
