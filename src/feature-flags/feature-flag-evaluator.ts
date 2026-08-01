import {
  FeatureFlagDefinitionSchema,
  type FeatureFlagDefinition,
  type FeatureFlagEvaluation,
} from "@omnixys/contracts-ts/analytics";
import { evaluateRule } from "@omnixys/analytics-rule-engine";
import { createHash } from "node:crypto";

export function evaluateFeatureFlag(
  flagId: string,
  key: string,
  version: number,
  rawDefinition: unknown,
  subjectId: string,
  facts: Readonly<Record<string, unknown>>,
): FeatureFlagEvaluation {
  const definition = FeatureFlagDefinitionSchema.parse(rawDefinition);
  if (!definition.enabled) {
    return evaluation(
      flagId,
      key,
      version,
      definition,
      definition.offVariant,
      "OFF",
    );
  }
  let excluded = false;
  for (const rule of definition.rules) {
    if (!evaluateRule(rule.condition, facts).matched) continue;
    const rolloutBucket = bucket(`${flagId}:${rule.id}:${subjectId}:rollout`);
    if (rolloutBucket >= rule.rollout) {
      excluded = true;
      continue;
    }
    const variant = weightedVariant(
      rule.variants,
      bucket(`${flagId}:${rule.id}:${subjectId}:variant`),
    );
    return evaluation(
      flagId,
      key,
      version,
      definition,
      variant,
      "RULE_MATCH",
      rule.id,
    );
  }
  return evaluation(
    flagId,
    key,
    version,
    definition,
    definition.defaultVariant,
    excluded ? "ROLLOUT_EXCLUDED" : "DEFAULT",
  );
}

function evaluation(
  flagId: string,
  key: string,
  version: number,
  definition: FeatureFlagDefinition,
  variantKey: string,
  reason: FeatureFlagEvaluation["reason"],
  ruleId?: string,
): FeatureFlagEvaluation {
  const variant = definition.variants.find(({ key }) => key === variantKey);
  if (!variant) throw new Error(`Unknown feature flag variant '${variantKey}'`);
  return {
    flagId,
    key,
    version,
    variant: variant.key,
    value: variant.value,
    reason,
    ...(ruleId ? { ruleId } : {}),
  };
}

function weightedVariant(
  variants: Array<{ key: string; weight: number }>,
  value: number,
): string {
  let upperBound = 0;
  for (const variant of variants) {
    upperBound += variant.weight;
    if (value < upperBound) return variant.key;
  }
  return variants.at(-1)?.key ?? "";
}

function bucket(input: string): number {
  const digest = createHash("sha256").update(input).digest();
  return digest.readUInt32BE(0) % 10_000;
}
