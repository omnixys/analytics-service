import "reflect-metadata";
import { ValidationPipe } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import {
  FastifyAdapter,
  type NestFastifyApplication,
} from "@nestjs/platform-fastify";
import { AppModule } from "./app.module.js";
import { env } from "./config.js";

async function bootstrap(): Promise<void> {
  const app = (await NestFactory.create(
    AppModule,
    new FastifyAdapter({
      logger: false,
      bodyLimit: 1_048_576,
    }) as never,
  )) as NestFastifyApplication;
  app.useGlobalPipes(
    new ValidationPipe({
      transform: true,
      whitelist: true,
      forbidNonWhitelisted: true,
    }),
  );
  app.enableShutdownHooks();
  await app.listen(env.PORT, "0.0.0.0");
}

void bootstrap();
