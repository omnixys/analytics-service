import { TenantId } from "@omnixys/context-ts";
import {
  CookieAuthGuard,
  CurrentUser,
  type CurrentUserData,
} from "@omnixys/security-ts";
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
import { RuleService } from "./rule.service.js";

@ObjectType()
class AnalyticsRulePayload {
  @Field(() => ID)
  id!: string;

  @Field()
  name!: string;

  @Field()
  lifecycle!: string;

  @Field(() => Int, { nullable: true })
  activeVersion!: number | null;

  @Field(() => [Int])
  versions!: number[];
}

@Resolver()
@UseGuards(CookieAuthGuard)
export class RuleResolver {
  constructor(private readonly rules: RuleService) {}

  @Mutation(() => AnalyticsRulePayload)
  async createAnalyticsRule(
    @Args("workspaceId", { type: () => ID }) workspaceId: string,
    @Args("name") name: string,
    @Args("definitionJson") definitionJson: string,
    @TenantId() organizationId: string | undefined,
    @CurrentUser() user: CurrentUserData,
  ): Promise<AnalyticsRulePayload> {
    if (!organizationId) throw new ForbiddenException("Tenant is required");
    return payload(
      await this.rules.create(
        organizationId,
        workspaceId,
        name,
        parseJson(definitionJson),
        user.id,
      ),
    );
  }

  @Mutation(() => AnalyticsRulePayload)
  async addAnalyticsRuleVersion(
    @Args("workspaceId", { type: () => ID }) workspaceId: string,
    @Args("ruleId", { type: () => ID }) ruleId: string,
    @Args("definitionJson") definitionJson: string,
    @TenantId() organizationId: string | undefined,
    @CurrentUser() user: CurrentUserData,
  ): Promise<AnalyticsRulePayload> {
    if (!organizationId) throw new ForbiddenException("Tenant is required");
    await this.rules.addVersion(
      organizationId,
      workspaceId,
      ruleId,
      parseJson(definitionJson),
      user.id,
    );
    const rule = (await this.rules.list(organizationId, workspaceId)).find(
      ({ id }) => id === ruleId,
    );
    if (!rule) throw new BadRequestException("Rule not found");
    return payload(rule);
  }

  @Mutation(() => AnalyticsRulePayload)
  async activateAnalyticsRule(
    @Args("workspaceId", { type: () => ID }) workspaceId: string,
    @Args("ruleId", { type: () => ID }) ruleId: string,
    @Args("version", { type: () => Int }) version: number,
    @TenantId() organizationId: string | undefined,
    @CurrentUser() user: CurrentUserData,
  ): Promise<AnalyticsRulePayload> {
    if (!organizationId) throw new ForbiddenException("Tenant is required");
    await this.rules.activate(
      organizationId,
      workspaceId,
      ruleId,
      version,
      user.id,
    );
    const rule = (await this.rules.list(organizationId, workspaceId)).find(
      ({ id }) => id === ruleId,
    );
    if (!rule) throw new BadRequestException("Rule not found");
    return payload(rule);
  }

  @Query(() => [AnalyticsRulePayload])
  async analyticsRules(
    @Args("workspaceId", { type: () => ID }) workspaceId: string,
    @TenantId() organizationId: string | undefined,
  ): Promise<AnalyticsRulePayload[]> {
    if (!organizationId) throw new ForbiddenException("Tenant is required");
    return (await this.rules.list(organizationId, workspaceId)).map(payload);
  }
}

function parseJson(value: string): unknown {
  try {
    return JSON.parse(value);
  } catch {
    throw new BadRequestException("definitionJson must be valid JSON");
  }
}

function payload(rule: {
  id: string;
  name: string;
  lifecycle: string;
  activeVersion: number | null;
  versions?: Array<{ version: number }>;
}): AnalyticsRulePayload {
  return {
    id: rule.id,
    name: rule.name,
    lifecycle: rule.lifecycle,
    activeVersion: rule.activeVersion,
    versions: rule.versions?.map(({ version }) => version) ?? [],
  };
}
