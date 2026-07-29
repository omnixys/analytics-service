import { Injectable } from "@nestjs/common";
import { ErrorCode, FrameworkException } from "@omnixys/contracts";
import { createHash, timingSafeEqual } from "node:crypto";
import { PrismaService } from "../prisma/prisma.service.js";
import type { ApiKey, Environment } from "../prisma/generated/client.js";
import { BrowserTokenService } from "../browser-token/browser-token.service.js";

export type IngestionPrincipal = Pick<
  ApiKey,
  "id" | "organizationId" | "workspaceId" | "sourceId" | "environment" | "scopes"
>;

@Injectable()
export class ApiKeyService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly browserTokens: BrowserTokenService,
  ) {}

  async authenticate(
    authorization: string | undefined,
    constraints?: { origin?: string; eventNames?: readonly string[] },
  ): Promise<IngestionPrincipal> {
    const rawKey = bearerToken(authorization);
    if (rawKey.split(".").length === 3) {
      try {
        return this.browserTokens.verify(
          rawKey,
          constraints?.origin,
          constraints?.eventNames ?? [],
        );
      } catch {
        throw new FrameworkException(
          ErrorCode.ANALYTICS_API_KEY_INVALID,
          "Invalid analytics browser token",
        );
      }
    }
    const prefix = rawKey.split(".", 1)[0];
    if (!prefix || !rawKey.includes(".")) {
      throw new FrameworkException(
        ErrorCode.ANALYTICS_API_KEY_INVALID,
        "Invalid analytics API key",
      );
    }
    const apiKey = await this.prisma.apiKey.findUnique({ where: { prefix } });
    if (
      !apiKey || !safeEqual(apiKey.secretHash, digest(rawKey))
    ) {
      throw new FrameworkException(
        ErrorCode.ANALYTICS_API_KEY_INVALID,
        "Invalid analytics API key",
      );
    }
    if (apiKey.revokedAt) {
      throw new FrameworkException(
        ErrorCode.ANALYTICS_API_KEY_REVOKED,
        "Analytics API key is revoked",
      );
    }
    if (apiKey.expiresAt && apiKey.expiresAt <= new Date()) {
      throw new FrameworkException(
        ErrorCode.ANALYTICS_API_KEY_EXPIRED,
        "Analytics API key is expired",
      );
    }
    if (!apiKey.scopes.includes("events:write")) {
      throw new FrameworkException(
        ErrorCode.ANALYTICS_SCOPE_FORBIDDEN,
        "Analytics API key lacks events:write",
      );
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
    throw new FrameworkException(
      ErrorCode.ANALYTICS_API_KEY_REQUIRED,
      "Bearer analytics API key is required",
    );
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
