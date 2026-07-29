import {
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from "@nestjs/common";
import { createHash, timingSafeEqual } from "node:crypto";
import { PrismaService } from "../prisma/prisma.service.js";

export interface FeatureFlagPrincipal {
  organizationId: string;
  workspaceId: string;
}

@Injectable()
export class FeatureFlagKeyService {
  constructor(private readonly prisma: PrismaService) {}

  async authenticate(
    authorization: string | undefined,
  ): Promise<FeatureFlagPrincipal> {
    const [scheme, rawKey] = (authorization ?? "").split(/\s+/, 2);
    if (scheme?.toLowerCase() !== "bearer" || !rawKey) {
      throw new UnauthorizedException("Analytics API key is required");
    }
    const prefix = rawKey.split(".", 1)[0];
    const key = await this.prisma.apiKey.findUnique({ where: { prefix } });
    if (
      !key ||
      key.revokedAt ||
      (key.expiresAt && key.expiresAt <= new Date()) ||
      !safeEqual(key.secretHash, digest(rawKey))
    ) {
      throw new UnauthorizedException("Invalid analytics API key");
    }
    if (
      !key.scopes.includes("flags:read") &&
      !key.scopes.includes("events:write")
    ) {
      throw new ForbiddenException("Analytics API key lacks flags:read");
    }
    void this.prisma.apiKey.update({
      where: { id: key.id },
      data: { lastUsedAt: new Date() },
    });
    return {
      organizationId: key.organizationId,
      workspaceId: key.workspaceId,
    };
  }
}

function digest(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function safeEqual(expected: string, actual: string): boolean {
  const left = Buffer.from(expected, "utf8");
  const right = Buffer.from(actual, "utf8");
  return left.length === right.length && timingSafeEqual(left, right);
}
