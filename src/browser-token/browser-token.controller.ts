import { env } from '../config/env.js';
import type { Environment } from '../prisma/generated/client.js';
import { BrowserTokenService } from './browser-token.service.js';
import {
  Body,
  Controller,
  ForbiddenException,
  Headers,
  Post,
  UnauthorizedException,
} from '@nestjs/common';
import { timingSafeEqual } from 'node:crypto';

const { INTERNAL_GATEWAY_TOKEN } = env;

@Controller('v1/analytics')
export class BrowserTokenController {
  constructor(private readonly tokens: BrowserTokenService) {}

  @Post('tokens')
  issue(
    @Headers('x-internal-token') internalToken: string | undefined,
    @Headers('x-tenant-id') organizationId: string | undefined,
    @Body() body: unknown,
  ): Promise<{ token: string; expiresIn: number }> {
    if (!safeEqual(internalToken, INTERNAL_GATEWAY_TOKEN)) {
      throw new UnauthorizedException('Invalid internal gateway token');
    }
    if (!organizationId) throw new ForbiddenException('Verified tenant is required');
    const value = body as Record<string, unknown>;
    return this.tokens.issue({
      application: application(value.application),
      organizationId,
      origin: typeof value.origin === 'string' ? value.origin : '',
      environment: environment(value.environment),
      events: Array.isArray(value.events)
        ? value.events.filter((entry): entry is string => typeof entry === 'string')
        : [],
    });
  }
}

function application(value: unknown): 'checkpoint' | 'wedding' {
  if (value === undefined || value === 'checkpoint') return 'checkpoint';
  if (value === 'wedding') return 'wedding';
  throw new TypeError('Invalid analytics application');
}

function environment(value: unknown): Environment {
  const normalized = (typeof value === 'string' ? value : 'development').toUpperCase();
  if (normalized !== 'DEVELOPMENT' && normalized !== 'STAGING' && normalized !== 'PRODUCTION') {
    throw new TypeError('Invalid analytics environment');
  }
  return normalized;
}

function safeEqual(value: string | undefined, expected: string): boolean {
  if (!value) return false;
  const left = Buffer.from(value);
  const right = Buffer.from(expected);
  return left.length === right.length && timingSafeEqual(left, right);
}
