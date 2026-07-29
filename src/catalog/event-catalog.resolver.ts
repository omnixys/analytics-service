import { ForbiddenException, UseGuards } from "@nestjs/common";
import { TenantId } from "@omnixys/context";
import { CookieAuthGuard } from "@omnixys/security";
import { Args, Field, ID, ObjectType, Query, Resolver } from "@nestjs/graphql";
import { PrismaService } from "../prisma/prisma.service.js";

@ObjectType()
class EventCatalogEntry {
  @Field(() => ID)
  id!: string;

  @Field()
  name!: string;

  @Field()
  owner!: string;

  @Field()
  lifecycle!: string;
}

@Resolver()
export class EventCatalogResolver {
  constructor(private readonly prisma: PrismaService) {}

  @Query(() => [EventCatalogEntry])
  @UseGuards(CookieAuthGuard)
  async analyticsEventCatalog(
    @Args("workspaceId", { type: () => ID }) workspaceId: string,
    @TenantId() organizationId: string | undefined,
  ): Promise<EventCatalogEntry[]> {
    if (!organizationId) {
      throw new ForbiddenException("Verified tenant context is required");
    }
    return this.prisma.eventDefinition.findMany({
      where: { organizationId, workspaceId },
      select: { id: true, name: true, owner: true, lifecycle: true },
      orderBy: { name: "asc" },
    });
  }
}
