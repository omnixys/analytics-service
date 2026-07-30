import { Module } from "@nestjs/common";
import { IngestionModule } from "../ingestion/ingestion.module.js";
import { DomainEventIngestionHandler } from "./domain-event-ingestion.handler.js";
import { DomainEventIngestionService } from "./domain-event-ingestion.service.js";
import { DomainProvisioningService } from "./domain-provisioning.service.js";
import { env } from "../config/env.js";

@Module({
  imports: [IngestionModule],
  providers: env.DOMAIN_INGESTION_ENABLED
    ? [
        DomainEventIngestionHandler,
        DomainEventIngestionService,
        DomainProvisioningService,
      ]
    : [],
})
export class DomainEventIngestionModule {}
