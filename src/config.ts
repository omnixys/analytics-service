import "dotenv/config";

function required(name: string, developmentDefault: string): string {
  const value = process.env[name];
  if (!value && process.env.NODE_ENV === "production") {
    throw new Error(`[ENV] Missing required environment variable: ${name}`);
  }
  return value ?? developmentDefault;
}

export const env = {
  NODE_ENV: process.env.NODE_ENV ?? "development",
  PORT: Number(process.env.PORT ?? 7410),
  RATE_LIMIT_REQUESTS: Number(process.env.RATE_LIMIT_REQUESTS ?? 12_000),
  SERVICE: process.env.SERVICE ?? "analytics",
  DATABASE_URL: required(
    "DATABASE_URL",
    "postgresql://analytics:analytics@localhost:5432/analytics",
  ),
  KAFKA_BROKER: process.env.KAFKA_BROKER ?? "localhost:9092",
  VALKEY_URL: process.env.VALKEY_URL ?? "valkey://localhost:6380",
  VALKEY_PASSWORD: process.env.VALKEY_PASSWORD ?? "",
  KC_URL: process.env.KC_URL ?? "http://localhost:18080/auth",
  KC_REALM: process.env.KC_REALM ?? "camunda-platform",
  ENCRYPTION_KEY: required(
    "ENCRYPTION_KEY",
    "development-only-analytics-encryption-key",
  ),
  OTEL_ENDPOINT:
    process.env.OTEL_EXPORTER_OTLP_ENDPOINT ?? "http://localhost:4318",
  SCHEMA_TARGET: process.env.SCHEMA_TARGET ?? "tmp",
} as const;
