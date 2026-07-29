import { Module } from "@nestjs/common";
import { ApiKeyModule } from "../api-key/api-key.module.js";
import { CatalogModule } from "../catalog/catalog.module.js";
import { IngestionController } from "./ingestion.controller.js";
import { IngestionService } from "./ingestion.service.js";
import { QuotaService } from "./quota.service.js";
import { UsageService } from "./usage.service.js";

@Module({
  imports: [ApiKeyModule, CatalogModule],
  controllers: [IngestionController],
  providers: [IngestionService, QuotaService, UsageService],
  exports: [IngestionService],
})
export class IngestionModule {}
