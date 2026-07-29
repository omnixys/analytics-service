import { Module } from "@nestjs/common";
import { BrowserTokenController } from "./browser-token.controller.js";
import { BrowserTokenService } from "./browser-token.service.js";

@Module({
  controllers: [BrowserTokenController],
  providers: [BrowserTokenService],
  exports: [BrowserTokenService],
})
export class BrowserTokenModule {}
