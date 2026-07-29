import { Injectable, UnauthorizedException } from "@nestjs/common";
import { createHash, timingSafeEqual } from "node:crypto";
import { PrismaService } from "../prisma/prisma.service.js";
import type { ApiKey, Environment } from "../prisma/generated/client.js";

export type IngestionPrincipal = Pick<
  ApiKey,
  "id" | "organizationId" | "workspaceId" | "sourceId" | "environment" | "scopes"
>;

@Injectable()
export class ApiKeyService {
  constructor(private readonly prisma: PrismaService) {}

  async authenticate(authorization: string | undefined): Promise<IngestionPrincipal> {
    const rawKey = bearerToken(authorization);
    const prefix = rawKey.split(".", 1)[0];
    if (!prefix || !rawKey.includes(".")) {
      throw new UnauthorizedException("Invalid analytics API key");
    }
    const apiKey = await this.prisma.apiKey.findUnique({ where: { prefix } });
    if (
      !apiKey ||
      apiKey.revokedAt ||
      (apiKey.expiresAt && apiKey.expiresAt <= new Date()) ||
      !safeEqual(apiKey.secretHash, digest(rawKey))
    ) {
      throw new UnauthorizedException("Invalid analytics API key");
    }
    if (!apiKey.scopes.includes("events:write")) {
      throw new UnauthorizedException("Analytics API key lacks events:write");
    }
    void this.prisma.apiKey.update({
      where: { id: apiKey.id },
      data: { lastUsedAt: new Date() },
    });
    return apiKey;
  }

  static hash(rawKey: string): string {
    return digest(rawKey);
  }
}

function bearerToken(header: string | undefined): string {
  const [scheme, token] = (header ?? "").split(/\s+/, 2);
  if (scheme?.toLowerCase() !== "bearer" || !token) {
    throw new UnauthorizedException("Bearer analytics API key is required");
  }
  return token;
}

function digest(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function safeEqual(expected: string, actual: string): boolean {
  const left = Buffer.from(expected, "utf8");
  const right = Buffer.from(actual, "utf8");
  return left.length === right.length && timingSafeEqual(left, right);
}

export function contractEnvironment(
  environment: Environment,
): "development" | "staging" | "production" {
  return environment.toLowerCase() as
    | "development"
    | "staging"
    | "production";
}
