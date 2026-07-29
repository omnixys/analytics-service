import { BadRequestException, Injectable } from "@nestjs/common";
import { CronExpressionParser } from "cron-parser";

@Injectable()
export class CronService {
  next(
    expression: string,
    timezone: string,
    after: Date,
    endAt?: Date,
  ): Date | null {
    assertTimezone(timezone);
    try {
      const next = CronExpressionParser.parse(expression, {
        currentDate: after,
        endDate: endAt,
        tz: timezone,
      })
        .next()
        .toDate();
      return endAt && next > endAt ? null : next;
    } catch (error) {
      if (endAt && after >= endAt) return null;
      throw new BadRequestException({
        code: "INVALID_SCHEDULE",
        message: error instanceof Error ? error.message : "Invalid cron",
      });
    }
  }
}

function assertTimezone(timezone: string): void {
  try {
    new Intl.DateTimeFormat("en", { timeZone: timezone }).format();
  } catch {
    throw new BadRequestException({
      code: "INVALID_TIMEZONE",
      message: `Unknown IANA timezone '${timezone}'`,
    });
  }
}
