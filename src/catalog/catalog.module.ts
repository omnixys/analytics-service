import { Module } from "@nestjs/common";
import { DataQualityService } from "./data-quality.service.js";
import { EventCatalogResolver } from "./event-catalog.resolver.js";

@Module({
  providers: [DataQualityService, EventCatalogResolver],
  exports: [DataQualityService],
})
export class CatalogModule {}
