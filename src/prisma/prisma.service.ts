import { PrismaPg } from "@prisma/adapter-pg";
import { Injectable, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import { env } from "../config.js";
import { PrismaClient } from "./generated/client.js";

@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  constructor() {
    super({ adapter: new PrismaPg({ connectionString: env.DATABASE_URL }) });
  }

  async onModuleInit(): Promise<void> {
    await this.$connect();
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }
}
