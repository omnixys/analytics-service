import {
  Body,
  Controller,
  Headers,
  HttpCode,
  HttpStatus,
  Post,
  ServiceUnavailableException,
} from "@nestjs/common";
import type { AnalyticsBatchResponse } from "@omnixys/contracts-ts/analytics";
import { IngestionService } from "./ingestion.service.js";
import { env } from "../config/env.js";

@Controller("v1/analytics")
export class IngestionController {
  constructor(private readonly ingestion: IngestionService) {}

  @Post("batch")
  @HttpCode(HttpStatus.ACCEPTED)
  ingestBatch(
    @Headers("authorization") authorization: string | undefined,
    @Headers("origin") origin: string | undefined,
    @Body() body: unknown,
  ): Promise<AnalyticsBatchResponse> {
    if (!env.CLIENT_INGESTION_ENABLED) {
      throw new ServiceUnavailableException({
        code: "CLIENT_INGESTION_DISABLED",
        message: "Client analytics ingestion is not enabled in this environment",
      });
    }
    return this.ingestion.ingest(authorization, body, origin);
  }
}
