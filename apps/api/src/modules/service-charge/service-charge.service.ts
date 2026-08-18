import { Injectable } from '@nestjs/common';
import { Prisma } from '@pos/db';
import type { Channel, ServiceChargeRuleDTO } from '@pos/shared';
import { decToNum } from '../../common/decimal';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class ServiceChargeService {
  constructor(private readonly prisma: PrismaService) {}

  async list(): Promise<ServiceChargeRuleDTO[]> {
    const rules = await this.prisma.serviceChargeRule.findMany({
      orderBy: { channel: 'asc' },
    });
    return rules.map((r) => ({
      channel: r.channel,
      percentage: decToNum(r.percentage),
    }));
  }

  async upsert(
    channel: Channel,
    percentage: number,
  ): Promise<ServiceChargeRuleDTO> {
    const rule = await this.prisma.serviceChargeRule.upsert({
      where: { channel },
      create: { channel, percentage: new Prisma.Decimal(percentage) },
      update: { percentage: new Prisma.Decimal(percentage) },
    });
    return { channel: rule.channel, percentage: decToNum(rule.percentage) };
  }

  /** Service-charge percentage for a channel (0 when no rule). Used by billing. */
  async percentageFor(channel: Channel): Promise<number> {
    const rule = await this.prisma.serviceChargeRule.findUnique({
      where: { channel },
    });
    return rule ? decToNum(rule.percentage) : 0;
  }
}
