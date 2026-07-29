import {
  Body,
  Controller,
  Headers,
  HttpCode,
  HttpStatus,
  Post,
} from "@nestjs/common";
import type { AnalyticsBatchResponse } from "@omnixys/contracts/analytics";
import { IngestionService } from "./ingestion.service.js";

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
    return this.ingestion.ingest(authorization, body, origin);
  }
}
