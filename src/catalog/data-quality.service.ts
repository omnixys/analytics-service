import type {
  AnalyticsEvent,
  AnalyticsBatchIssue,
} from "@omnixys/contracts-ts/analytics";
import { Injectable } from "@nestjs/common";
import type { Environment, TrackingMode } from "../prisma/generated/client.js";
import { PrismaService } from "../prisma/prisma.service.js";

export interface DataQualityDecision {
  disposition: "accept" | "warn" | "quarantine" | "reject";
  issues: AnalyticsBatchIssue[];
}

@Injectable()
export class DataQualityService {
  constructor(private readonly prisma: PrismaService) {}

  async validate(
    sourceId: string,
    environment: Environment,
    event: AnalyticsEvent,
    index: number,
  ): Promise<DataQualityDecision> {
    const trackingPlan = await this.prisma.trackingPlan.findUnique({
      where: { sourceId_environment: { sourceId, environment } },
      include: { versions: true },
    });
    const active = trackingPlan?.versions.find(
      ({ version }) => version === trackingPlan.activeVersion,
    );
    const mode = active?.mode ?? defaultMode(environment);
    const definition = await this.prisma.eventDefinition.findUnique({
      where: {
        sourceId_environment_name: {
          sourceId,
          environment,
          name: event.name,
        },
      },
      include: { versions: true },
    });
    const schemaVersion = definition?.versions.find(
      ({ version }) => version === event.schemaVersion,
    );
    const issues: AnalyticsBatchIssue[] = [];
    if (!definition || definition.lifecycle !== "ACTIVE") {
      issues.push(issue(index, "UNKNOWN_EVENT", `Unknown event '${event.name}'`));
    } else if (!schemaVersion) {
      issues.push(
        issue(
          index,
          "UNKNOWN_SCHEMA_VERSION",
          `Event '${event.name}' does not support schema ${event.schemaVersion}`,
        ),
      );
    } else {
      issues.push(...validateProperties(schemaVersion.schema, event, index));
    }
    if (issues.length === 0) return { disposition: "accept", issues };
    return { disposition: disposition(mode), issues };
  }
}

function validateProperties(
  schema: unknown,
  event: AnalyticsEvent,
  index: number,
): AnalyticsBatchIssue[] {
  if (!schema || typeof schema !== "object") return [];
  const required = (schema as { required?: unknown }).required;
  if (!Array.isArray(required)) return [];
  return required
    .filter(
      (name): name is string =>
        typeof name === "string" && !(name in event.properties),
    )
    .map((name) =>
      issue(index, "REQUIRED_PROPERTY_MISSING", `Missing property '${name}'`, [
        "events",
        index,
        "properties",
        name,
      ]),
    );
}

function defaultMode(environment: Environment): TrackingMode {
  return environment === "DEVELOPMENT" ? "WARN" : "QUARANTINE";
}

function disposition(mode: TrackingMode): DataQualityDecision["disposition"] {
  return mode.toLowerCase() as DataQualityDecision["disposition"];
}

function issue(
  index: number,
  code: string,
  message: string,
  path: Array<string | number> = ["events", index],
): AnalyticsBatchIssue {
  return { index, code, message, path };
}
