import { Injectable, NotFoundException } from '@nestjs/common';
import type { Outlet } from '@pos/db';
import type { OutletDTO } from '@pos/shared';
import { PrismaService } from '../../prisma/prisma.service';
import { UpdateOutletDto } from './dto/update-outlet.dto';

/**
 * Reads/writes the single outlet row that backs the business identity and the
 * customer-receipt header/footer (spec: owner-editable bill). Mirrors the
 * ServiceChargeService pattern: a thin typed wrapper over Prisma → DTO.
 */
@Injectable()
export class OutletService {
  constructor(private readonly prisma: PrismaService) {}

  async get(): Promise<OutletDTO> {
    const outlet = await this.prisma.outlet.findFirst({ orderBy: { createdAt: 'asc' } });
    if (!outlet) throw new NotFoundException('Outlet not configured');
    return this.toDTO(outlet);
  }

  async update(dto: UpdateOutletDto): Promise<OutletDTO> {
    const existing = await this.prisma.outlet.findFirst({ orderBy: { createdAt: 'asc' } });
    if (!existing) throw new NotFoundException('Outlet not configured');
    const updated = await this.prisma.outlet.update({
      where: { id: existing.id },
      // Undefined fields are left unchanged; an explicit null clears a text line.
      data: {
        name: dto.name,
        address: dto.address,
        phone: dto.phone,
        tagline: dto.tagline,
        taxNumber: dto.taxNumber,
        receiptFooter: dto.receiptFooter,
        receiptCurrencyLabel: dto.receiptCurrencyLabel,
        showName: dto.showName,
        showTagline: dto.showTagline,
        showAddress: dto.showAddress,
        showPhone: dto.showPhone,
        showTaxNumber: dto.showTaxNumber,
        showFooter: dto.showFooter,
        showCurrencyLabel: dto.showCurrencyLabel,
        showLogo: dto.showLogo,
      },
    });
    return this.toDTO(updated);
  }

  private toDTO(o: Outlet): OutletDTO {
    return {
      id: o.id,
      name: o.name,
      address: o.address,
      phone: o.phone,
      tagline: o.tagline,
      taxNumber: o.taxNumber,
      receiptFooter: o.receiptFooter,
      receiptCurrencyLabel: o.receiptCurrencyLabel,
      showName: o.showName,
      showTagline: o.showTagline,
      showAddress: o.showAddress,
      showPhone: o.showPhone,
      showTaxNumber: o.showTaxNumber,
      showFooter: o.showFooter,
      showCurrencyLabel: o.showCurrencyLabel,
      showLogo: o.showLogo,
    };
  }
}
