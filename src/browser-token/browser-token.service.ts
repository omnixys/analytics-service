import type { IngestionPrincipal } from '../api-key/api-key.service.js';
import { env } from '../config/env.js';
import type { Environment } from '../prisma/generated/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { Injectable } from '@nestjs/common';
import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto';

const { BROWSER_TOKEN_SECRET } = env;

interface BrowserTokenClaims {
  aud: 'omnixys-analytics';
  iss: 'analytics-service';
  sub: string;
  organizationId: string;
  workspaceId: string;
  sourceId: string;
  environment: Environment;
  application: AnalyticsApplication;
  origin: string;
  events: string[];
  jti: string;
  iat: number;
  exp: number;
}

@Injectable()
export class BrowserTokenService {
  constructor(private readonly prisma: PrismaService) {}

  async issue(input: BrowserTokenIssue): Promise<{
    token: string;
    expiresIn: number;
  }> {
    validateIssue(input);
    const application = input.application ?? 'checkpoint';
    const source = await this.provision({ ...input, application });
    const now = Math.floor(Date.now() / 1_000);
    const claims: BrowserTokenClaims = {
      aud: 'omnixys-analytics',
      iss: 'analytics-service',
      sub: `${application}:${input.organizationId}`,
      ...source,
      application,
      origin: input.origin,
      events: [...new Set(input.events)].sort(),
      jti: randomUUID(),
      iat: now,
      exp: now + 15 * 60,
    };
    return { token: sign(claims), expiresIn: 15 * 60 };
  }

  verify(
    token: string,
    origin: string | undefined,
    eventNames: readonly string[],
  ): IngestionPrincipal {
    const claims = verifySignature(token);
    if (
      claims.aud !== 'omnixys-analytics' ||
      claims.iss !== 'analytics-service' ||
      claims.exp <= Math.floor(Date.now() / 1_000) ||
      !origin ||
      claims.origin !== origin ||
      eventNames.some((name) => !claims.events.includes(name))
    ) {
      throw new Error('Browser analytics token constraints are invalid');
    }
    return {
      id: claims.jti,
      organizationId: claims.organizationId,
      workspaceId: claims.workspaceId,
      sourceId: claims.sourceId,
      environment: claims.environment,
      scopes: ['events:write'],
    };
  }

  private provision(input: BrowserTokenIssue & { application: AnalyticsApplication }): Promise<{
    organizationId: string;
    workspaceId: string;
    sourceId: string;
    environment: Environment;
  }> {
    return this.prisma.$transaction(async (tx) => {
      await tx.organization.upsert({
        where: { id: input.organizationId },
        create: {
          id: input.organizationId,
          name: `Organization ${input.organizationId}`,
          slug: `tenant-${input.organizationId}`,
        },
        update: {},
      });
      const workspace = await tx.workspace.upsert({
        where: {
          organizationId_slug: {
            organizationId: input.organizationId,
            slug: input.application,
          },
        },
        create: {
          organizationId: input.organizationId,
          name: applicationName(input.application),
          slug: input.application,
        },
        update: {},
      });
      const slug = `${input.application}-${input.environment.toLowerCase()}`;
      const source = await tx.source.upsert({
        where: { workspaceId_slug: { workspaceId: workspace.id, slug } },
        create: {
          organizationId: input.organizationId,
          workspaceId: workspace.id,
          name: `${input.application} (${input.environment.toLowerCase()})`,
          slug,
          lifecycle: 'ACTIVE',
        },
        update: { lifecycle: 'ACTIVE' },
      });
      for (const eventName of [...new Set(input.events)]) {
        const definition = await tx.eventDefinition.upsert({
          where: {
            sourceId_environment_name: {
              sourceId: source.id,
              environment: input.environment,
              name: eventName,
            },
          },
          create: {
            organizationId: input.organizationId,
            workspaceId: workspace.id,
            sourceId: source.id,
            environment: input.environment,
            name: eventName,
            owner: input.application,
            lifecycle: 'ACTIVE',
          },
          update: { lifecycle: 'ACTIVE' },
        });
        await tx.eventSchemaVersion.upsert({
          where: {
            eventDefinitionId_version: {
              eventDefinitionId: definition.id,
              version: '1.0',
            },
          },
          create: {
            eventDefinitionId: definition.id,
            version: '1.0',
            schema: { type: 'object' },
            privacy: { classification: 'business', pii: false },
            createdBy: 'browser-token-provisioner',
          },
          update: {},
        });
      }
      const plan = await tx.trackingPlan.upsert({
        where: {
          sourceId_environment: {
            sourceId: source.id,
            environment: input.environment,
          },
        },
        create: {
          organizationId: input.organizationId,
          workspaceId: workspace.id,
          sourceId: source.id,
          environment: input.environment,
          lifecycle: 'ACTIVE',
          activeVersion: 1,
        },
        update: { lifecycle: 'ACTIVE', activeVersion: 1 },
      });
      const definitions = await tx.eventDefinition.findMany({
        where: {
          sourceId: source.id,
          environment: input.environment,
          lifecycle: 'ACTIVE',
        },
        select: { id: true },
      });
      await tx.trackingPlanVersion.upsert({
        where: {
          trackingPlanId_version: { trackingPlanId: plan.id, version: 1 },
        },
        create: {
          trackingPlanId: plan.id,
          version: 1,
          mode: input.environment === 'DEVELOPMENT' ? 'WARN' : 'QUARANTINE',
          definitionIds: definitions.map(({ id }) => id),
          createdBy: 'browser-token-provisioner',
        },
        update: { definitionIds: definitions.map(({ id }) => id) },
      });
      return {
        organizationId: input.organizationId,
        workspaceId: workspace.id,
        sourceId: source.id,
        environment: input.environment,
      };
    });
  }
}

export interface BrowserTokenIssue {
  application?: AnalyticsApplication;
  organizationId: string;
  origin: string;
  environment: Environment;
  events: string[];
}

export type AnalyticsApplication = 'checkpoint' | 'wedding';

function validateIssue(input: BrowserTokenIssue): void {
  if (
    (input.application !== undefined &&
      input.application !== 'checkpoint' &&
      input.application !== 'wedding') ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      input.organizationId,
    ) ||
    !URL.canParse(input.origin) ||
    input.events.length < 1 ||
    input.events.length > 100 ||
    input.events.some((name) => !/^\$?[A-Za-z][A-Za-z0-9]{1,99}$/.test(name))
  ) {
    throw new TypeError('Invalid browser analytics token request');
  }
}

function applicationName(application: AnalyticsApplication): string {
  return application === 'checkpoint' ? 'Checkpoint' : 'Wedding';
}

function sign(claims: BrowserTokenClaims): string {
  const header = encode({ alg: 'HS256', typ: 'JWT' });
  const payload = encode(claims);
  const signature = signatureFor(`${header}.${payload}`);
  return `${header}.${payload}.${signature}`;
}

function verifySignature(token: string): BrowserTokenClaims {
  const [header, payload, signature] = token.split('.');
  if (!header || !payload || !signature) throw new Error('Invalid token');
  const expected = Buffer.from(signatureFor(`${header}.${payload}`));
  const actual = Buffer.from(signature);
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) {
    throw new Error('Invalid token signature');
  }
  return JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as BrowserTokenClaims;
}

function signatureFor(value: string): string {
  return createHmac('sha256', BROWSER_TOKEN_SECRET).update(value).digest('base64url');
}

function encode(value: unknown): string {
  return Buffer.from(JSON.stringify(value)).toString('base64url');
}
