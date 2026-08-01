import 'dotenv/config';
import process from 'node:process';

type EnvValue = string | number | boolean;
interface GetEnvOptions<T extends EnvValue = string> {
  required?: boolean;
  transform?: (value: string) => T;
}

function getEnv(
  key: string,
  fallback?: string,
  options?: GetEnvOptions<string>,
): string;
function getEnv<T extends EnvValue>(
  key: string,
  fallback: string,
  options: GetEnvOptions<T> & { transform: (value: string) => T },
): T;
function getEnv(
  key: string,
  fallback?: string,
  options?: GetEnvOptions,
): EnvValue {
  const raw = process.env[key];
  if (!raw) {
    if (options?.required && process.env.NODE_ENV === 'production') {
      throw new Error(`[ENV] Missing required env: ${key}`);
    }
    return options?.transform && fallback !== undefined
      ? options.transform(fallback)
      : (fallback ?? '');
  }
  return options?.transform ? options.transform(raw) : raw;
}

const toBool = (value: string): boolean => value === 'true';
const toNumber = (value: string): number => Number(value);

export const env = {
  NODE_ENV: getEnv('NODE_ENV', 'development'),
  SCHEMA_TARGET: getEnv('SCHEMA_TARGET', 'true'),
  LOG_DEFAULT: getEnv('LOG_DEFAULT', 'false', { transform: toBool }),
  LOG_DIRECTORY: getEnv('LOG_DIRECTORY', 'log'),
  LOG_FILE_DEFAULT_NAME: getEnv('LOG_FILE_DEFAULT_NAME', 'server.log'),
  LOG_PRETTY: getEnv('LOG_PRETTY', 'false', { transform: toBool }),
  LOG_LEVEL: getEnv('LOG_LEVEL', 'info'),
  HTTPS: getEnv('HTTPS', 'false', { transform: toBool }),
  KEYS_PATH: getEnv('KEYS_PATH', './keys'),
  TEMPO_URI:
    process.env.OTEL_EXPORTER_OTLP_ENDPOINT ??
    getEnv('TEMPO_URI', 'http://localhost:4318'),
  PORT: getEnv('PORT', '4000', { transform: toNumber }),

  KC_CLIENT_SECRET: getEnv('KC_CLIENT_SECRET', '', { required: true }),
  KC_URL: getEnv('KC_URL', 'http://localhost:18080/auth'),
  KC_REALM: getEnv('KC_REALM', 'camunda-platform'),
  KC_CLIENT_ID: getEnv('KC_CLIENT_ID', 'camunda-identity'),

  KAFKA_BROKER: getEnv('KAFKA_BROKER', 'localhost:9092'),
  SERVICE: getEnv('SERVICE', 'analytics-service'),
  DATABASE_URL: getEnv('DATABASE_URL', '', { required: true }),
  KEYCLOAK_HEALTH_URL: getEnv('KEYCLOAK_HEALTH_URL', ''),
  TEMPO_HEALTH_URL: getEnv('TEMPO_HEALTH_URL', ''),
  PROMETHEUS_HEALTH_URL: getEnv('PROMETHEUS_HEALTH_URL', ''),
  COOKIE_SECRET: getEnv('COOKIE_SECRET', 'omnixys-development-secret', {
    required: true,
  }),
  PC_JWE_KEY: getEnv('PC_JWE_KEY', '', { required: true }),
  PC_JWE_KEY_2: getEnv('PC_JWE_KEY_2', ''),
  PC_TTL_SEC: getEnv('PC_TTL_SEC', String(60 * 60 * 24 * 30), {
    transform: toNumber,
  }),

  VALKEY_URL: getEnv('VALKEY_URL', 'valkey://localhost:6380'),
  VALKEY_PASSWORD: getEnv('VALKEY_PASSWORD', '', { required: true }),

  ENCRYPTION_KEY: getEnv('ENCRYPTION_KEY', '', { required: true }),

  RATE_LIMIT_REQUESTS: getEnv('RATE_LIMIT_REQUESTS', '120000', { transform: toNumber }),
  DOMAIN_INGESTION_ENABLED: getEnv('DOMAIN_INGESTION_ENABLED', 'true', { transform: toBool }),
  CLIENT_INGESTION_ENABLED: getEnv('CLIENT_INGESTION_ENABLED', 'true', { transform: toBool }),

  BROWSER_TOKEN_SECRET: getEnv(
    "ANALYTICS_BROWSER_TOKEN_SECRET",
    "",
    { required: true }
  ),
  INTERNAL_GATEWAY_TOKEN: getEnv(
    "INTERNAL_GATEWAY_TOKEN",
    "",
    { required: true }
  ),

} as const;
