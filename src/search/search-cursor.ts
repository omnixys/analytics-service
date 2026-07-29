import { BadRequestException } from "@nestjs/common";

export interface SearchCursor {
  id: string;
  timestamp: Date;
}

export function encodeCursor(cursor: SearchCursor): string {
  return Buffer.from(
    JSON.stringify({
      id: cursor.id,
      timestamp: cursor.timestamp.toISOString(),
    }),
    "utf8",
  ).toString("base64url");
}

export function decodeCursor(value: string | undefined): SearchCursor | undefined {
  if (!value) return undefined;
  try {
    const parsed = JSON.parse(
      Buffer.from(value, "base64url").toString("utf8"),
    ) as unknown;
    if (!parsed || typeof parsed !== "object") throw new Error("invalid");
    const record = parsed as Record<string, unknown>;
    const timestamp = new Date(String(record.timestamp));
    if (
      typeof record.id !== "string" ||
      !record.id ||
      Number.isNaN(timestamp.getTime())
    ) {
      throw new Error("invalid");
    }
    return { id: record.id, timestamp };
  } catch {
    throw new BadRequestException("Invalid search cursor");
  }
}
