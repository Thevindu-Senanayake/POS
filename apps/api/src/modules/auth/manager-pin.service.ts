import { Injectable } from '@nestjs/common';
import bcrypt from 'bcryptjs';
import { PrismaService } from '../../prisma/prisma.service';

/**
 * Verifies a manager/admin override PIN (spec §7). In this single-outlet model
 * only admins hold PINs; a valid PIN returns the approving admin's user id so
 * callers can record it on an AuditLog. Returns null when no PIN matches.
 */
@Injectable()
export class ManagerPinService {
  constructor(private readonly prisma: PrismaService) {}

  async verify(pin: string): Promise<string | null> {
    if (!pin) return null;
    const admins = await this.prisma.user.findMany({
      where: { role: 'admin', isActive: true, pinHash: { not: null } },
      select: { id: true, pinHash: true },
    });
    for (const admin of admins) {
      if (admin.pinHash && (await bcrypt.compare(pin, admin.pinHash))) {
        return admin.id;
      }
    }
    return null;
  }
}
