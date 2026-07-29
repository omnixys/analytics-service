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
  ID,
  Int,
  Mutation,
  ObjectType,
  Query,
  Resolver,
} from "@nestjs/graphql";
import { FeatureFlagService } from "./feature-flag.service.js";

@ObjectType()
class FeatureFlagPayload {
  @Field(() => ID)
  id!: string;

  @Field()
  key!: string;

  @Field()
  lifecycle!: string;

  @Field(() => Int, { nullable: true })
  activeVersion!: number | null;

  @Field(() => [Int])
  versions!: number[];
}

@Resolver()
@UseGuards(CookieAuthGuard)
export class FeatureFlagResolver {
  constructor(private readonly flags: FeatureFlagService) {}

  @Mutation(() => FeatureFlagPayload)
  async createAnalyticsFeatureFlag(
    @Args("workspaceId", { type: () => ID }) workspaceId: string,
    @Args("key") key: string,
    @Args("definitionJson") definitionJson: string,
    @TenantId() organizationId: string | undefined,
    @CurrentUser() user: CurrentUserData,
  ): Promise<FeatureFlagPayload> {
    if (!organizationId) throw new ForbiddenException("Tenant is required");
    const flag = await this.flags.create(
      organizationId,
      workspaceId,
      key,
      parseJson(definitionJson),
      user.id,
    );
    return payload(flag);
  }

  @Mutation(() => FeatureFlagPayload)
  async addAnalyticsFeatureFlagVersion(
    @Args("workspaceId", { type: () => ID }) workspaceId: string,
    @Args("flagId", { type: () => ID }) flagId: string,
    @Args("definitionJson") definitionJson: string,
    @TenantId() organizationId: string | undefined,
    @CurrentUser() user: CurrentUserData,
  ): Promise<FeatureFlagPayload> {
    if (!organizationId) throw new ForbiddenException("Tenant is required");
    await this.flags.addVersion(
      organizationId,
      workspaceId,
      flagId,
      parseJson(definitionJson),
      user.id,
    );
    const flag = (await this.flags.list(organizationId, workspaceId)).find(
      ({ id }) => id === flagId,
    );
    if (!flag) throw new BadRequestException("Feature flag not found");
    return payload(flag);
  }

  @Mutation(() => FeatureFlagPayload)
  async activateAnalyticsFeatureFlag(
    @Args("workspaceId", { type: () => ID }) workspaceId: string,
    @Args("flagId", { type: () => ID }) flagId: string,
    @Args("version", { type: () => Int }) version: number,
    @TenantId() organizationId: string | undefined,
    @CurrentUser() user: CurrentUserData,
  ): Promise<FeatureFlagPayload> {
    if (!organizationId) throw new ForbiddenException("Tenant is required");
    await this.flags.activate(
      organizationId,
      workspaceId,
      flagId,
      version,
      user.id,
    );
    const flag = (await this.flags.list(organizationId, workspaceId)).find(
      ({ id }) => id === flagId,
    );
    if (!flag) throw new BadRequestException("Feature flag not found");
    return payload(flag);
  }

  @Query(() => [FeatureFlagPayload])
  async analyticsFeatureFlags(
    @Args("workspaceId", { type: () => ID }) workspaceId: string,
    @TenantId() organizationId: string | undefined,
  ): Promise<FeatureFlagPayload[]> {
    if (!organizationId) throw new ForbiddenException("Tenant is required");
    return (await this.flags.list(organizationId, workspaceId)).map(payload);
  }
}

function parseJson(value: string): unknown {
  try {
    return JSON.parse(value);
  } catch {
    throw new BadRequestException("definitionJson must be valid JSON");
  }
}

function payload(flag: {
  id: string;
  key: string;
  lifecycle: string;
  activeVersion: number | null;
  versions?: Array<{ version: number }>;
}): FeatureFlagPayload {
  return {
    id: flag.id,
    key: flag.key,
    lifecycle: flag.lifecycle,
    activeVersion: flag.activeVersion,
    versions: flag.versions?.map(({ version }) => version) ?? [],
  };
}
