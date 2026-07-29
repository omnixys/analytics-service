import { Module } from "@nestjs/common";
import { ApiKeyService } from "./api-key.service.js";

@Module({
  providers: [ApiKeyService],
  exports: [ApiKeyService],
})
export class ApiKeyModule {}
