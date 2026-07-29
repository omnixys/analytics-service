import { Module } from "@nestjs/common";
import { BrowserTokenModule } from "../browser-token/browser-token.module.js";
import { ApiKeyService } from "./api-key.service.js";

@Module({
  imports: [BrowserTokenModule],
  providers: [ApiKeyService],
  exports: [ApiKeyService],
})
export class ApiKeyModule {}
