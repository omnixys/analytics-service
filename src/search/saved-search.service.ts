import { BadRequestException, Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service.js";

const RESOURCE_TYPES = new Set([
  "events",
  "sessions",
  "catalog",
  "tracking-plans",
]);

@Injectable()
export class SavedSearchService {
  constructor(private readonly prisma: PrismaService) {}

  create(
    organizationId: string,
    workspaceId: string,
    name: string,
    resourceType: string,
    definition: unknown,
    createdBy: string,
  ) {
    if (!RESOURCE_TYPES.has(resourceType)) {
      throw new BadRequestException("Unsupported saved-search resource type");
    }
    if (!definition || typeof definition !== "object") {
      throw new BadRequestException("Saved-search definition must be an object");
    }
    return this.prisma.savedSearch.create({
      data: {
        organizationId,
        workspaceId,
        name: name.trim(),
        resourceType,
        definition,
        createdBy,
      },
    });
  }

  list(organizationId: string, workspaceId: string, resourceType?: string) {
    return this.prisma.savedSearch.findMany({
      where: {
        organizationId,
        workspaceId,
        resourceType,
        lifecycle: "ACTIVE",
      },
      orderBy: { updatedAt: "desc" },
    });
  }

  archive(organizationId: string, id: string) {
    return this.prisma.savedSearch.update({
      where: { id, organizationId },
      data: { lifecycle: "ARCHIVED" },
    });
  }
}
