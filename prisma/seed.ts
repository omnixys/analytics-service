import { PrismaPg } from '@prisma/adapter-pg';
import 'dotenv/config';
import { createHash, randomUUID } from 'node:crypto';
import { isUUID } from 'class-validator';
import { PrismaClient } from '../src/prisma/generated/client.js';

const PROCESSING_VERSION = 'analytics-service@1.0.0';
const SEED_SDK = '@omnixys/domain-facts/ticket';
const ENVIRONMENT = 'DEVELOPMENT';

const CHECKPOINT_TENANT_ID =
  process.env.CHECKPOINT_TENANT_ID ??
  'a738a3b6-c3c1-483f-926c-c25e18fd4ff2';
const PRODUCER = 'ticket';

const SCAN_EVENT = 'QrScanSucceeded';
const WARNING_EVENT = 'QrScanRejected';
const CHECKIN_EVENT = 'GuestCheckedIn';
const CHECKOUT_EVENT = 'GuestCheckedOut';

const SEED_DAYS = 7;
const ACTIVE_START_HOUR = 9;
const ACTIVE_END_HOUR = 21;

function validateCheckpointTenant(): string {
  if (!isUUID(CHECKPOINT_TENANT_ID, '4')) {
    throw new Error('[SEED] CHECKPOINT_TENANT_ID must be a valid UUID v4');
  }
  return CHECKPOINT_TENANT_ID;
}

function mulberry32(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function scansPerMinute(hour: number): number {
  const center = 13.5;
  const peak = 26;
  const base = 5;
  const spread = 3.5;
  const distance = Math.abs(hour - center);
  return Math.max(
    2,
    Math.round(base + (peak - base) * Math.exp(-(distance * distance) / (2 * spread * spread))),
  );
}

function startOfDay(timestamp: number): number {
  const date = new Date(timestamp);
  date.setHours(0, 0, 0, 0);
  return date.getTime();
}

function addSeconds(timestamp: number, seconds: number): Date {
  return new Date(timestamp + seconds * 1000);
}

interface GeneratedEvent {
  name: string;
  occurredAt: Date;
  receivedAt: Date;
  properties: Record<string, unknown>;
  userId?: string;
}

function generateScanEvents(
  minuteStart: number,
  count: number,
  random: () => number,
): GeneratedEvent[] {
  const events: GeneratedEvent[] = [];
  for (let index = 0; index < count; index += 1) {
    const ticketId = randomUUID();
    events.push({
      name: SCAN_EVENT,
      occurredAt: addSeconds(minuteStart, index % 60),
      receivedAt: addSeconds(minuteStart, (index % 60) + 1),
      userId: randomUUID(),
      properties: {
        aggregateId: ticketId,
        aggregateType: 'Ticket',
        ticketId,
        verdict: 'APPROVED',
        method: 'qr',
        hasGate: true,
      },
    });
  }
  return events;
}

function generateWarningEvents(
  minuteStart: number,
  count: number,
  random: () => number,
): GeneratedEvent[] {
  const reasons = [
    { code: 'TICKET_REVOKED', reason: 'Ticket has been revoked' },
    { code: 'INVALID_TICKET', reason: 'Unknown or forged ticket' },
    { code: 'ALREADY_SCANNED', reason: 'Ticket was already scanned' },
    { code: 'GATE_MISMATCH', reason: 'Ticket is not valid for this gate' },
  ];
  const events: GeneratedEvent[] = [];
  for (let index = 0; index < count; index += 1) {
    const entry = reasons[Math.floor(random() * reasons.length)];
    const ticketId = randomUUID();
    events.push({
      name: WARNING_EVENT,
      occurredAt: addSeconds(minuteStart, index % 60),
      receivedAt: addSeconds(minuteStart, (index % 60) + 1),
      userId: randomUUID(),
      properties: {
        aggregateId: ticketId,
        aggregateType: 'Ticket',
        ticketId,
        verdict: 'REJECTED',
        reasonCode: entry.code,
        reason: entry.reason,
        method: 'qr',
      },
    });
  }
  return events;
}

function generateMembershipEvents(
  dayStart: number,
  hour: number,
  count: number,
  checkIn: boolean,
  random: () => number,
): GeneratedEvent[] {
  const events: GeneratedEvent[] = [];
  for (let index = 0; index < count; index += 1) {
    const second = Math.floor(random() * 3600);
    const occurred = dayStart + hour * 3600_000 + second * 1000;
    const ticketId = randomUUID();
    events.push({
      name: checkIn ? CHECKIN_EVENT : CHECKOUT_EVENT,
      occurredAt: new Date(occurred),
      receivedAt: addSeconds(occurred, 1),
      userId: randomUUID(),
      properties: {
        aggregateId: ticketId,
        aggregateType: 'Ticket',
        ticketId,
        method: 'qr',
        hasSeat: random() > 0.4,
      },
    });
  }
  return events;
}

function generateSeedEvents(days: number, now: number): GeneratedEvent[] {
  const random = mulberry32(0x5eed);
  const events: GeneratedEvent[] = [];
  const nowDay = startOfDay(now);

  for (let offset = SEED_DAYS - 1; offset >= 0; offset -= 1) {
    const dayStart = nowDay - offset * 86_400_000;
    for (let hour = ACTIVE_START_HOUR; hour <= ACTIVE_END_HOUR; hour += 1) {
      const perMinute = scansPerMinute(hour);
      for (let minute = 0; minute < 60; minute += 1) {
        const minuteStart = dayStart + hour * 3600_000 + minute * 60_000;
        events.push(...generateScanEvents(minuteStart, perMinute, random));
        const warnings = Math.max(
          0,
          Math.round(perMinute * (0.03 + random() * 0.04)),
        );
        events.push(...generateWarningEvents(minuteStart, warnings, random));
      }
    }
    const checkIns = 8 + Math.floor(random() * 8);
    const checkOuts = 8 + Math.floor(random() * 8);
    events.push(
      ...generateMembershipEvents(dayStart, 9, checkIns, true, random),
    );
    events.push(
      ...generateMembershipEvents(dayStart, 18, checkOuts, false, random),
    );
  }

  return events;
}

function floorMinute(timestamp: number): Date {
  return new Date(Math.floor(timestamp / 60_000) * 60_000);
}

function stableHash(value: unknown): string {
  const serialized =
    typeof value === 'string' ? value : stableStringify(value);
  return createHash('sha256').update(serialized).digest('hex');
}

function stableStringify(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map(stableStringify).join(',')}]`;
  }
  if (value && typeof value === 'object') {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, entry]) => `${JSON.stringify(key)}:${stableStringify(entry)}`)
      .join(',')}}`;
  }
  return JSON.stringify(value);
}

function sourceSlug(producer: string, environment: string): string {
  return `${producer}-${environment.toLowerCase()}`;
}

async function main(): Promise<void> {
  const checkpointTenantId = validateCheckpointTenant();
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error('[SEED] DATABASE_URL is required');
  }

  const adapter = new PrismaPg({ connectionString: databaseUrl });
  const prisma = new PrismaClient({ adapter });

  try {
    const now = Date.now();
    const seedEvents = generateSeedEvents(SEED_DAYS, now);
    const sourceSlugValue = sourceSlug(PRODUCER, ENVIRONMENT);

    const organization = await prisma.organization.upsert({
      where: { id: checkpointTenantId },
      update: {},
      create: {
        id: checkpointTenantId,
        name: `Organization ${checkpointTenantId}`,
        slug: `tenant-${checkpointTenantId}`,
      },
    });

    const workspace = await prisma.workspace.upsert({
      where: {
        organizationId_slug: {
          organizationId: organization.id,
          slug: 'checkpoint',
        },
      },
      update: {},
      create: {
        organizationId: organization.id,
        name: 'Checkpoint',
        slug: 'checkpoint',
      },
    });

    const source = await prisma.source.upsert({
      where: {
        workspaceId_slug: {
          workspaceId: workspace.id,
          slug: sourceSlugValue,
        },
      },
      update: { lifecycle: 'ACTIVE' },
      create: {
        organizationId: organization.id,
        workspaceId: workspace.id,
        name: `${PRODUCER} (${ENVIRONMENT.toLowerCase()})`,
        slug: sourceSlugValue,
        lifecycle: 'ACTIVE',
      },
    });

    const canonicalNames = [
      SCAN_EVENT,
      WARNING_EVENT,
      CHECKIN_EVENT,
      CHECKOUT_EVENT,
    ] as const;
    const definitions: { id: string; name: string }[] = [];
    for (const name of canonicalNames) {
      const definition = await prisma.eventDefinition.upsert({
        where: {
          sourceId_environment_name: {
            sourceId: source.id,
            environment: ENVIRONMENT,
            name,
          },
        },
        update: { lifecycle: 'ACTIVE' },
        create: {
          organizationId: organization.id,
          workspaceId: workspace.id,
          sourceId: source.id,
          environment: ENVIRONMENT,
          name,
          owner: PRODUCER,
          description: `Provisioned canonical fact from ${PRODUCER}`,
          lifecycle: 'ACTIVE',
        },
      });
      await prisma.eventSchemaVersion.upsert({
        where: {
          eventDefinitionId_version: {
            eventDefinitionId: definition.id,
            version: '1.0',
          },
        },
        update: {},
        create: {
          eventDefinitionId: definition.id,
          version: '1.0',
          schema: {
            type: 'object',
            additionalProperties: false,
            properties: {},
          },
          privacy: { classification: 'business', pii: false },
          createdBy: 'bootstrap-seed',
        },
      });
      definitions.push({ id: definition.id, name });
    }

    await prisma.trackingPlan.upsert({
      where: {
        sourceId_environment: { sourceId: source.id, environment: ENVIRONMENT },
      },
      update: { lifecycle: 'ACTIVE', activeVersion: 1 },
      create: {
        organizationId: organization.id,
        workspaceId: workspace.id,
        sourceId: source.id,
        environment: ENVIRONMENT,
        lifecycle: 'ACTIVE',
        activeVersion: 1,
      },
    });

    const metricScans = await upsertMetric(
      prisma,
      organization.id,
      workspace.id,
      'checkpoint.scans_per_minute',
      'Scans per minute',
      SCAN_EVENT,
    );
    const metricWarnings = await upsertMetric(
      prisma,
      organization.id,
      workspace.id,
      'checkpoint.warnings_per_minute',
      'Warnings',
      WARNING_EVENT,
    );

    const rawEvents = seedEvents.map((event) => ({
      eventId: randomUUID(),
      organizationId: organization.id,
      workspaceId: workspace.id,
      sourceId: source.id,
      environment: ENVIRONMENT,
      schemaVersion: '1.0',
      processingVersion: PROCESSING_VERSION,
      type: 'track',
      name: event.name,
      userId: event.userId ?? null,
      properties: event.properties as never,
      sdkName: SEED_SDK,
      sdkVersion: '1',
      occurredAt: event.occurredAt,
      receivedAt: event.receivedAt,
    }));

    const seedStart = startOfDay(now - (SEED_DAYS - 1) * 86_400_000);
    await prisma.rawEvent.deleteMany({
      where: {
        sourceId: source.id,
        environment: ENVIRONMENT,
        occurredAt: { gte: new Date(seedStart) },
      },
    });
    for (let index = 0; index < rawEvents.length; index += 4000) {
      await prisma.rawEvent.createMany({
        data: rawEvents.slice(index, index + 4000),
      });
    }

    const bucketsByVersion = new Map<
      string,
      { bucketStart: Date; count: number }[]
    >([[metricScans.metricVersionId, []], [metricWarnings.metricVersionId, []]]);
    for (const event of seedEvents) {
      const versionId =
        event.name === SCAN_EVENT
          ? metricScans.metricVersionId
          : event.name === WARNING_EVENT
            ? metricWarnings.metricVersionId
            : undefined;
      if (!versionId) continue;
      const bucketStart = floorMinute(event.occurredAt.getTime());
      const buckets = bucketsByVersion.get(versionId)!;
      const last = buckets[buckets.length - 1];
      if (last && last.bucketStart.getTime() === bucketStart.getTime()) {
        last.count += 1;
      } else {
        buckets.push({ bucketStart, count: 1 });
      }
    }

    const dimensionKey = stableHash({});
    for (const versionId of bucketsByVersion.keys()) {
      await prisma.aggregateBucket.deleteMany({
        where: {
          metricVersionId: versionId,
          bucketStart: { gte: new Date(seedStart) },
        },
      });
    }
    const bucketRows = [];
    for (const [versionId, buckets] of bucketsByVersion) {
      for (const bucket of buckets) {
        bucketRows.push({
          organizationId: organization.id,
          workspaceId: workspace.id,
          metricVersionId: versionId,
          bucketStart: bucket.bucketStart,
          bucketSize: '1m',
          dimensions: {},
          dimensionKey,
          value: bucket.count,
          inputCount: BigInt(bucket.count),
          sumValue: bucket.count,
          minimumValue: 1,
          maximumValue: bucket.count,
          numeratorCount: 0n,
          denominatorCount: 0n,
          watermark: new Date(now),
          processingVersion: PROCESSING_VERSION,
        });
      }
    }
    for (let index = 0; index < bucketRows.length; index += 4000) {
      await prisma.aggregateBucket.createMany({
        data: bucketRows.slice(index, index + 4000),
      });
    }

    const result = {
      tenantId: checkpointTenantId,
      organizationId: organization.id,
      workspaceId: workspace.id,
      sourceId: source.id,
      eventDefinitions: definitions.length,
      rawEvents: rawEvents.length,
      aggregateBuckets: bucketRows.length,
      metrics: [metricScans.key, metricWarnings.key],
      windowDays: SEED_DAYS,
    };
    console.log('SEED_ANALYTICS_JSON:' + JSON.stringify(result));
  } finally {
    await prisma.$disconnect();
  }
}

async function upsertMetric(
  prisma: PrismaClient,
  organizationId: string,
  workspaceId: string,
  key: string,
  name: string,
  eventName: string,
): Promise<{ key: string; metricVersionId: string }> {
  const definition = await prisma.metricDefinition.upsert({
    where: {
      workspaceId_key: { workspaceId, key },
    },
    update: { lifecycle: 'ACTIVE', activeVersion: 1 },
    create: {
      organizationId,
      workspaceId,
      key,
      name,
      lifecycle: 'ACTIVE',
      activeVersion: 1,
    },
  });
  const queryAst = {
    definitionVersion: '1.0',
    eventName,
    aggregation: { operation: 'count' },
    dimensions: [],
    bucketSize: '1m',
  };
  const version = await prisma.metricVersion.upsert({
    where: {
      metricDefinitionId_version: {
        metricDefinitionId: definition.id,
        version: 1,
      },
    },
    update: { queryAst: queryAst as never, definitionVersion: '1.0' },
    create: {
      metricDefinitionId: definition.id,
      version: 1,
      definitionVersion: '1.0',
      queryAst: queryAst as never,
      createdBy: 'bootstrap-seed',
    },
  });
  return { key, metricVersionId: version.id };
}

main().catch((error) => {
  console.error('Seed failed', error);
  process.exit(1);
});
