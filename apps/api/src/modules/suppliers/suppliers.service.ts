import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { Supplier } from '@pos/db';
import type { SupplierDTO } from '@pos/shared';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateSupplierDto } from './dto/create-supplier.dto';
import { UpdateSupplierDto } from './dto/update-supplier.dto';

@Injectable()
export class SuppliersService {
  constructor(private readonly prisma: PrismaService) {}

  async list(): Promise<SupplierDTO[]> {
    const suppliers = await this.prisma.supplier.findMany({
      orderBy: { name: 'asc' },
    });
    return suppliers.map((s) => this.toDTO(s));
  }

  async get(id: string): Promise<SupplierDTO> {
    const supplier = await this.prisma.supplier.findUnique({ where: { id } });
    if (!supplier) {
      throw new NotFoundException('Supplier not found');
    }
    return this.toDTO(supplier);
  }

  async create(dto: CreateSupplierDto): Promise<SupplierDTO> {
    const supplier = await this.prisma.supplier.create({
      data: {
        name: dto.name,
        contactInfo: dto.contactInfo ?? null,
        phone: dto.phone ?? null,
        email: dto.email ?? null,
      },
    });
    return this.toDTO(supplier);
  }

  async update(id: string, dto: UpdateSupplierDto): Promise<SupplierDTO> {
    await this.get(id);
    const supplier = await this.prisma.supplier.update({
      where: { id },
      data: {
        ...(dto.name !== undefined ? { name: dto.name } : {}),
        ...(dto.contactInfo !== undefined
          ? { contactInfo: dto.contactInfo }
          : {}),
        ...(dto.phone !== undefined ? { phone: dto.phone } : {}),
        ...(dto.email !== undefined ? { email: dto.email } : {}),
      },
    });
    return this.toDTO(supplier);
  }

  /** Refuse to delete a supplier still referenced by ingredients or POs. */
  async remove(id: string): Promise<void> {
    await this.get(id);
    const [ingredientCount, poCount] = await Promise.all([
      this.prisma.ingredient.count({ where: { supplierId: id } }),
      this.prisma.purchaseOrder.count({ where: { supplierId: id } }),
    ]);
    if (ingredientCount > 0 || poCount > 0) {
      throw new ConflictException(
        'Supplier is referenced by ingredients or purchase orders and cannot be deleted',
      );
    }
    await this.prisma.supplier.delete({ where: { id } });
  }

  private toDTO(supplier: Supplier): SupplierDTO {
    return {
      id: supplier.id,
      name: supplier.name,
      contactInfo: supplier.contactInfo,
      phone: supplier.phone,
      email: supplier.email,
    };
  }
}
