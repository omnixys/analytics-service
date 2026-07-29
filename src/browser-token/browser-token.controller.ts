import {
  Body,
  Controller,
  ForbiddenException,
  Headers,
  Post,
  UnauthorizedException,
} from "@nestjs/common";
import { timingSafeEqual } from "node:crypto";
import type { Environment } from "../prisma/generated/client.js";
import { env } from "../config.js";
import { BrowserTokenService } from "./browser-token.service.js";

@Controller("v1/analytics")
export class BrowserTokenController {
  constructor(private readonly tokens: BrowserTokenService) {}

  @Post("tokens")
  issue(
    @Headers("x-internal-token") internalToken: string | undefined,
    @Headers("x-tenant-id") organizationId: string | undefined,
    @Body() body: unknown,
  ): Promise<{ token: string; expiresIn: number }> {
    if (!safeEqual(internalToken, env.INTERNAL_GATEWAY_TOKEN)) {
      throw new UnauthorizedException("Invalid internal gateway token");
    }
    if (!organizationId) throw new ForbiddenException("Verified tenant is required");
    const value = body as Record<string, unknown>;
    return this.tokens.issue({
      organizationId,
      origin: String(value.origin ?? ""),
      environment: environment(value.environment),
      events: Array.isArray(value.events)
        ? value.events.filter((entry): entry is string => typeof entry === "string")
        : [],
    });
  }
}

function environment(value: unknown): Environment {
  const normalized = String(value ?? "development").toUpperCase();
  if (
    normalized !== "DEVELOPMENT" &&
    normalized !== "STAGING" &&
    normalized !== "PRODUCTION"
  ) {
    throw new TypeError("Invalid analytics environment");
  }
  return normalized;
}

function safeEqual(value: string | undefined, expected: string): boolean {
  if (!value) return false;
  const left = Buffer.from(value);
  const right = Buffer.from(expected);
  return left.length === right.length && timingSafeEqual(left, right);
}
