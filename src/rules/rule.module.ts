import { Module } from "@nestjs/common";
import { RuleActionService } from "./rule-action.service.js";
import { RuleHandler } from "./rule.handler.js";
import { RuleResolver } from "./rule.resolver.js";
import { RuleRuntimeService } from "./rule-runtime.service.js";
import { RuleService } from "./rule.service.js";

@Module({
  providers: [
    RuleActionService,
    RuleRuntimeService,
    RuleService,
    RuleHandler,
    RuleResolver,
  ],
  exports: [RuleActionService, RuleRuntimeService, RuleService],
})
export class RuleModule {}
