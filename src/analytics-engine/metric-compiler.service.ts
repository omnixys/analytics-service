import {
  MetricQueryDefinitionSchema,
  type AnalyticsEvent,
  type MetricQueryDefinition,
} from "@omnixys/contracts/analytics";
import { evaluateRule } from "@omnixys/analytics-rule-engine";
import { Injectable } from "@nestjs/common";

@Injectable()
export class MetricCompilerService {
  compile(input: unknown): MetricQueryDefinition {
    return MetricQueryDefinitionSchema.parse(input);
  }

  accepts(definition: MetricQueryDefinition, event: AnalyticsEvent): boolean {
    const aggregation = definition.aggregation;
    const matchesEvent =
      aggregation.operation === "conversion"
        ? event.name === aggregation.numeratorEvent ||
          event.name === aggregation.denominatorEvent
        : !definition.eventName || definition.eventName === event.name;
    if (!matchesEvent) return false;
    if (!definition.filter) return true;
    return evaluateRule(definition.filter, eventFacts(event)).matched;
  }

  dimensions(
    definition: MetricQueryDefinition,
    event: AnalyticsEvent,
  ): Record<string, string> {
    const facts = eventFacts(event);
    return Object.fromEntries(
      definition.dimensions.map((path) => [
        path,
        scalarDimension(resolvePath(facts, path)),
      ]),
    );
  }

  numericValue(
    definition: MetricQueryDefinition,
    event: AnalyticsEvent,
  ): number | undefined {
    const aggregation = definition.aggregation;
    if (
      aggregation.operation === "count" ||
      aggregation.operation === "unique_count" ||
      aggregation.operation === "conversion"
    ) {
      return 1;
    }
    const value = resolvePath(eventFacts(event), aggregation.property);
    return typeof value === "number" && Number.isFinite(value)
      ? value
      : undefined;
  }

  distinctValue(
    definition: MetricQueryDefinition,
    event: AnalyticsEvent,
  ): string | undefined {
    if (definition.aggregation.operation !== "unique_count") return undefined;
    const property = definition.aggregation.property;
    const value = property
      ? resolvePath(eventFacts(event), property)
      : event.userId ?? event.anonymousId;
    return typeof value === "string" || typeof value === "number"
      ? String(value)
      : undefined;
  }
}

function eventFacts(event: AnalyticsEvent): Record<string, unknown> {
  return {
    eventId: event.eventId,
    name: event.name,
    type: event.type,
    userId: event.userId,
    anonymousId: event.anonymousId,
    groupId: event.groupId,
    sessionId: event.sessionId,
    properties: event.properties,
    traits: event.traits ?? {},
    context: event.context ?? {},
  };
}

function resolvePath(
  facts: Readonly<Record<string, unknown>>,
  path: string,
): unknown {
  const segments = path.split(".");
  let current: unknown = facts;
  for (const segment of segments) {
    if (
      !current ||
      typeof current !== "object" ||
      Array.isArray(current) ||
      !Object.prototype.hasOwnProperty.call(current, segment)
    ) {
      return undefined;
    }
    current = (current as Record<string, unknown>)[segment];
  }
  return current;
}

function scalarDimension(value: unknown): string {
  if (
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  ) {
    return String(value);
  }
  return "(none)";
}
