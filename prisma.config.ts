import "dotenv/config";
import { defineConfig } from "prisma/config";

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: { path: "prisma/migrations" },
  datasource: {
    url:
      process.env.DATABASE_URL ??
      "postgresql://analytics:analytics@localhost:5432/analytics",
    shadowDatabaseUrl:
      process.env.SHADOW_DATABASE_URL ??
      "postgresql://analytics:analytics@localhost:5432/analytics_shadow",
  },
});
