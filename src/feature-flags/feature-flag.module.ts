import { Module } from "@nestjs/common";
import { FeatureFlagController } from "./feature-flag.controller.js";
import { FeatureFlagKeyService } from "./feature-flag-key.service.js";
import { FeatureFlagResolver } from "./feature-flag.resolver.js";
import { FeatureFlagService } from "./feature-flag.service.js";

@Module({
  controllers: [FeatureFlagController],
  providers: [FeatureFlagKeyService, FeatureFlagService, FeatureFlagResolver],
  exports: [FeatureFlagService],
})
export class FeatureFlagModule {}
