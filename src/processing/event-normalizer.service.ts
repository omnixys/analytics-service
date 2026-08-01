import {
  AnalyticsProcessingEventSchema,
  type AnalyticsProcessingEvent,
} from "@omnixys/contracts-ts/analytics";
import { Injectable } from "@nestjs/common";

@Injectable()
export class EventNormalizerService {
  normalize(input: unknown): AnalyticsProcessingEvent {
    const payload = AnalyticsProcessingEventSchema.parse(input);
    const event = payload.event;
    return {
      ...payload,
      event: {
        ...event,
        name: event.name.trim(),
        anonymousId: normalizedIdentifier(event.anonymousId),
        userId: normalizedIdentifier(event.userId),
        groupId: normalizedIdentifier(event.groupId),
        sessionId: normalizedIdentifier(event.sessionId),
        properties: normalizeRecord(event.properties),
        traits: event.traits ? normalizeRecord(event.traits) : undefined,
      },
    };
  }

  persistenceContext(
    payload: AnalyticsProcessingEvent,
    transport: ProcessingTransportContext,
  ): Record<string, JsonValue> {
    return {
      ...(payload.event.context
        ? normalizeRecord(payload.event.context)
        : {}),
      sourceId: payload.sourceId,
      environment: payload.environment,
      receivedAt: payload.receivedAt,
      correlationId:
        payload.event.correlationId ?? transport.correlationId ?? null,
      processing: {
        version: payload.processingVersion,
        topic: transport.topic,
        partition: transport.partition,
        offset: transport.offset,
        replayJobId: payload.replay?.jobId ?? null,
      },
    };
  }
}

export interface ProcessingTransportContext {
  topic: string;
  partition: number;
  offset: string;
  correlationId?: string;
}

export type JsonValue =
  | boolean
  | number
  | string
  | null
  | JsonValue[]
  | { [key: string]: JsonValue };

function normalizedIdentifier(value: string | undefined): string | undefined {
  const normalized = value?.trim();
  return normalized ? normalized : undefined;
}

function normalizeRecord(
  value: Record<string, unknown>,
): Record<string, JsonValue> {
  return Object.fromEntries(
    Object.entries(value)
      .sort(([left], [right]) => left.localeCompare(right))
      .flatMap(([key, entry]) => {
        const normalized = normalizeJson(entry);
        return normalized === undefined ? [] : [[key, normalized]];
      }),
  );
}

function normalizeJson(value: unknown): JsonValue | undefined {
  if (value === null) return null;
  if (
    typeof value === "string" ||
    typeof value === "boolean" ||
    (typeof value === "number" && Number.isFinite(value))
  ) {
    return value;
  }
  if (Array.isArray(value)) {
    return value.flatMap((entry) => {
      const normalized = normalizeJson(entry);
      return normalized === undefined ? [] : [normalized];
    });
  }
  if (isRecord(value)) return normalizeRecord(value);
  return undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
