import { ValkeyService } from "@omnixys/cache";
import { KafkaLifecycleService } from "@omnixys/kafka";
import { Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service.js";

export interface ReadinessSnapshot {
  ready: boolean;
  checks: {
    postgres: boolean;
    kafka: boolean;
    valkey: boolean;
  };
}

@Injectable()
export class ReadinessService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly kafka: KafkaLifecycleService,
    private readonly valkey: ValkeyService,
  ) {}

  async snapshot(): Promise<ReadinessSnapshot> {
    const [postgres, valkey] = await Promise.all([
      this.postgresReady(),
      this.valkeyReady(),
    ]);
    const kafka = this.kafka.health().healthy;
    return {
      ready: postgres && kafka && valkey,
      checks: { postgres, kafka, valkey },
    };
  }

  private async postgresReady(): Promise<boolean> {
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      return true;
    } catch {
      return false;
    }
  }

  private async valkeyReady(): Promise<boolean> {
    try {
      return (await this.valkey.health()).healthy;
    } catch {
      return false;
    }
  }
}
