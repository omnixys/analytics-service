import {
  Body,
  Controller,
  Headers,
  HttpCode,
  HttpStatus,
  Post,
} from "@nestjs/common";
import type { FeatureFlagEvaluationResponse } from "@omnixys/contracts/analytics";
import { FeatureFlagKeyService } from "./feature-flag-key.service.js";
import { FeatureFlagService } from "./feature-flag.service.js";

@Controller("v1/analytics/flags")
export class FeatureFlagController {
  constructor(
    private readonly keys: FeatureFlagKeyService,
    private readonly flags: FeatureFlagService,
  ) {}

  @Post("evaluate")
  @HttpCode(HttpStatus.OK)
  async evaluate(
    @Headers("authorization") authorization: string | undefined,
    @Body() body: unknown,
  ): Promise<FeatureFlagEvaluationResponse> {
    const principal = await this.keys.authenticate(authorization);
    return this.flags.evaluate(
      principal.organizationId,
      principal.workspaceId,
      body,
    );
  }
}
