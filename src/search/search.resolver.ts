import { TenantId } from "@omnixys/context";
import {
  CookieAuthGuard,
  CurrentUser,
  type CurrentUserData,
} from "@omnixys/security";
import {
  BadRequestException,
  ForbiddenException,
  UseGuards,
} from "@nestjs/common";
import {
  Args,
  Field,
  GraphQLISODateTime,
  ID,
  InputType,
  Int,
  Mutation,
  ObjectType,
  Query,
  Resolver,
} from "@nestjs/graphql";
import type { Environment, Lifecycle } from "../prisma/generated/client.js";
import { SavedSearchService } from "./saved-search.service.js";
import { SearchService } from "./search.service.js";

@InputType()
class EventSearchInput {
  @Field(() => ID, { nullable: true })
  sourceId?: string;

  @Field({ nullable: true })
  environment?: string;

  @Field({ nullable: true })
  name?: string;

  @Field({ nullable: true })
  userId?: string;

  @Field({ nullable: true })
  sessionId?: string;

  @Field({ nullable: true })
  text?: string;

  @Field(() => GraphQLISODateTime, { nullable: true })
  from?: Date;

  @Field(() => GraphQLISODateTime, { nullable: true })
  to?: Date;

  @Field({ nullable: true })
  cursor?: string;

  @Field(() => Int, { nullable: true })
  limit?: number;
}

@InputType()
class SessionSearchInput {
  @Field(() => ID, { nullable: true })
  sourceId?: string;

  @Field({ nullable: true })
  environment?: string;

  @Field({ nullable: true })
  userId?: string;

  @Field({ nullable: true })
  anonymousId?: string;

  @Field(() => GraphQLISODateTime, { nullable: true })
  from?: Date;

  @Field(() => GraphQLISODateTime, { nullable: true })
  to?: Date;

  @Field({ nullable: true })
  cursor?: string;

  @Field(() => Int, { nullable: true })
  limit?: number;
}

@ObjectType()
class SearchPageInfoPayload {
  @Field()
  hasNextPage!: boolean;

  @Field({ nullable: true })
  endCursor!: string | null;
}

@ObjectType()
class EventSearchItemPayload {
  @Field(() => ID)
  id!: string;

  @Field(() => ID)
  eventId!: string;

  @Field()
  name!: string;

  @Field()
  type!: string;

  @Field({ nullable: true })
  userId!: string | null;

  @Field({ nullable: true })
  anonymousId!: string | null;

  @Field({ nullable: true })
  sessionId!: string | null;

  @Field(() => ID)
  sourceId!: string;

  @Field()
  environment!: string;

  @Field()
  propertiesJson!: string;

  @Field(() => GraphQLISODateTime)
  occurredAt!: Date;

  @Field(() => GraphQLISODateTime)
  receivedAt!: Date;

  @Field()
  sdkName!: string;

  @Field()
  sdkVersion!: string;
}

@ObjectType()
class EventSearchConnectionPayload {
  @Field(() => [EventSearchItemPayload])
  nodes!: EventSearchItemPayload[];

  @Field(() => SearchPageInfoPayload)
  pageInfo!: SearchPageInfoPayload;
}

@ObjectType()
class SessionSearchItemPayload {
  @Field(() => ID)
  id!: string;

  @Field(() => ID)
  sourceId!: string;

  @Field()
  environment!: string;

  @Field({ nullable: true })
  userId!: string | null;

  @Field({ nullable: true })
  anonymousId!: string | null;

  @Field(() => GraphQLISODateTime)
  startedAt!: Date;

  @Field(() => GraphQLISODateTime)
  lastSeenAt!: Date;

  @Field(() => Int)
  eventCount!: number;

  @Field()
  durationMs!: string;
}

@ObjectType()
class SessionSearchConnectionPayload {
  @Field(() => [SessionSearchItemPayload])
  nodes!: SessionSearchItemPayload[];

  @Field(() => SearchPageInfoPayload)
  pageInfo!: SearchPageInfoPayload;
}

@ObjectType()
class CatalogSearchItemPayload {
  @Field(() => ID)
  id!: string;

  @Field()
  name!: string;

  @Field()
  owner!: string;

  @Field()
  lifecycle!: string;

  @Field({ nullable: true })
  description!: string | null;
}

@ObjectType()
class TrackingPlanSearchItemPayload {
  @Field(() => ID)
  id!: string;

  @Field(() => ID)
  sourceId!: string;

  @Field()
  environment!: string;

  @Field()
  lifecycle!: string;

  @Field(() => Int, { nullable: true })
  activeVersion!: number | null;
}

@ObjectType()
class SavedSearchPayload {
  @Field(() => ID)
  id!: string;

  @Field()
  name!: string;

  @Field()
  resourceType!: string;

  @Field()
  definitionJson!: string;

  @Field()
  lifecycle!: string;
}

@Resolver()
@UseGuards(CookieAuthGuard)
export class SearchResolver {
  constructor(
    private readonly search: SearchService,
    private readonly saved: SavedSearchService,
  ) {}

  @Query(() => EventSearchConnectionPayload)
  async analyticsEventSearch(
    @Args("workspaceId", { type: () => ID }) workspaceId: string,
    @Args("filter", { type: () => EventSearchInput })
    filter: EventSearchInput,
    @TenantId() organizationId: string | undefined,
  ): Promise<EventSearchConnectionPayload> {
    const result = await this.search.events(
      requiredTenant(organizationId),
      workspaceId,
      { ...filter, environment: environment(filter.environment) },
    );
    return {
      nodes: result.nodes.map((node) => ({
        ...node,
        propertiesJson: JSON.stringify(node.properties),
      })),
      pageInfo: result.pageInfo,
    };
  }

  @Query(() => SessionSearchConnectionPayload)
  async analyticsSessionSearch(
    @Args("workspaceId", { type: () => ID }) workspaceId: string,
    @Args("filter", { type: () => SessionSearchInput })
    filter: SessionSearchInput,
    @TenantId() organizationId: string | undefined,
  ): Promise<SessionSearchConnectionPayload> {
    const result = await this.search.sessions(
      requiredTenant(organizationId),
      workspaceId,
      { ...filter, environment: environment(filter.environment) },
    );
    return {
      nodes: result.nodes.map((node) => ({
        ...node,
        durationMs: node.durationMs.toString(),
      })),
      pageInfo: result.pageInfo,
    };
  }

  @Query(() => [CatalogSearchItemPayload])
  analyticsCatalogSearch(
    @Args("workspaceId", { type: () => ID }) workspaceId: string,
    @Args("text", { nullable: true }) text: string | undefined,
    @Args("lifecycle", { nullable: true }) lifecycle: string | undefined,
    @TenantId() organizationId: string | undefined,
  ): Promise<CatalogSearchItemPayload[]> {
    return this.search.catalog(
      requiredTenant(organizationId),
      workspaceId,
      text,
      lifecycleValue(lifecycle),
    );
  }

  @Query(() => [TrackingPlanSearchItemPayload])
  analyticsTrackingPlanSearch(
    @Args("workspaceId", { type: () => ID }) workspaceId: string,
    @Args("sourceId", { type: () => ID, nullable: true })
    sourceId: string | undefined,
    @Args("lifecycle", { nullable: true }) lifecycle: string | undefined,
    @TenantId() organizationId: string | undefined,
  ): Promise<TrackingPlanSearchItemPayload[]> {
    return this.search.trackingPlans(
      requiredTenant(organizationId),
      workspaceId,
      sourceId,
      lifecycleValue(lifecycle),
    );
  }

  @Mutation(() => SavedSearchPayload)
  async saveAnalyticsSearch(
    @Args("workspaceId", { type: () => ID }) workspaceId: string,
    @Args("name") name: string,
    @Args("resourceType") resourceType: string,
    @Args("definitionJson") definitionJson: string,
    @TenantId() organizationId: string | undefined,
    @CurrentUser() user: CurrentUserData,
  ): Promise<SavedSearchPayload> {
    const saved = await this.saved.create(
      requiredTenant(organizationId),
      workspaceId,
      name,
      resourceType,
      parseJson(definitionJson),
      user.id,
    );
    return savedPayload(saved);
  }

  @Query(() => [SavedSearchPayload])
  async analyticsSavedSearches(
    @Args("workspaceId", { type: () => ID }) workspaceId: string,
    @Args("resourceType", { nullable: true })
    resourceType: string | undefined,
    @TenantId() organizationId: string | undefined,
  ): Promise<SavedSearchPayload[]> {
    return (
      await this.saved.list(
        requiredTenant(organizationId),
        workspaceId,
        resourceType,
      )
    ).map(savedPayload);
  }

  @Mutation(() => SavedSearchPayload)
  async archiveAnalyticsSavedSearch(
    @Args("id", { type: () => ID }) id: string,
    @TenantId() organizationId: string | undefined,
  ): Promise<SavedSearchPayload> {
    return savedPayload(
      await this.saved.archive(requiredTenant(organizationId), id),
    );
  }
}

function requiredTenant(value: string | undefined): string {
  if (!value) throw new ForbiddenException("Tenant is required");
  return value;
}

function environment(value: string | undefined): Environment | undefined {
  if (!value) return undefined;
  if (!["DEVELOPMENT", "STAGING", "PRODUCTION"].includes(value)) {
    throw new BadRequestException("Invalid analytics environment");
  }
  return value as Environment;
}

function lifecycleValue(value: string | undefined): Lifecycle | undefined {
  if (!value) return undefined;
  if (!["DRAFT", "ACTIVE", "DEPRECATED", "ARCHIVED"].includes(value)) {
    throw new BadRequestException("Invalid lifecycle");
  }
  return value as Lifecycle;
}

function parseJson(value: string): unknown {
  try {
    return JSON.parse(value) as unknown;
  } catch {
    throw new BadRequestException("definitionJson must be valid JSON");
  }
}

function savedPayload(saved: {
  id: string;
  name: string;
  resourceType: string;
  definition: unknown;
  lifecycle: string;
}): SavedSearchPayload {
  return {
    id: saved.id,
    name: saved.name,
    resourceType: saved.resourceType,
    definitionJson: JSON.stringify(saved.definition),
    lifecycle: saved.lifecycle,
  };
}
