import { PrismaPg } from '@prisma/adapter-pg';
import 'dotenv/config';
import { isUUID } from 'class-validator';
import { PrismaClient } from '../src/prisma/generated/client.js';

const OMNIXYS_TENANT_ID =
  process.env.DEFAULT_TENANT_ID ??
  '6e788f7f-c233-4cb8-bbde-c0b855e564be';

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter });

async function main() {
  const tenantIdValid = isUUID(OMNIXYS_TENANT_ID, '4');
  const organization = await prisma.organization.findUnique({
    where: { id: OMNIXYS_TENANT_ID },
    select: { id: true },
  });
  const workspace = organization
    ? await prisma.workspace.findUnique({
        where: {
          organizationId_slug: {
            organizationId: organization.id,
            slug: 'checkpoint',
          },
        },
        select: { id: true },
      })
    : null;
  const source = workspace
    ? await prisma.source.findUnique({
        where: {
          workspaceId_slug: {
            workspaceId: workspace.id,
            slug: 'ticket-development',
          },
        },
        select: { id: true },
      })
    : null;

  const [eventDefinitions, rawEvents, metrics, buckets] =
    source && workspace
      ? await Promise.all([
          prisma.eventDefinition.count({
            where: {
              organizationId: organization!.id,
              workspaceId: workspace.id,
            },
          }),
          prisma.rawEvent.count({
            where: { organizationId: organization!.id, workspaceId: workspace.id },
          }),
          prisma.metricDefinition.count({
            where: {
              organizationId: organization!.id,
              workspaceId: workspace.id,
            },
          }),
          prisma.aggregateBucket.count({
            where: {
              organizationId: organization!.id,
              workspaceId: workspace.id,
            },
          }),
        ])
      : [0, 0, 0, 0];

  const result = {
    service: 'analytics',
    checks: [
      {
        name: 'Omnixys tenant id',
        ok: tenantIdValid,
        count: tenantIdValid ? 1 : 0,
      },
      { name: 'Organization', ok: organization !== null, count: organization ? 1 : 0 },
      { name: 'Workspace (checkpoint)', ok: workspace !== null, count: workspace ? 1 : 0 },
      { name: 'Source (ticket-development)', ok: source !== null, count: source ? 1 : 0 },
      { name: 'Event definitions', ok: eventDefinitions > 0, count: eventDefinitions },
      { name: 'Raw events', ok: rawEvents > 0, count: rawEvents },
      { name: 'Metric definitions', ok: metrics > 0, count: metrics },
      { name: 'Aggregate buckets', ok: buckets > 0, count: buckets },
    ],
  };

  console.log('VALIDATE_JSON:' + JSON.stringify(result));
}

main()
  .catch((e) => {
    console.error('Validate failed', e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
