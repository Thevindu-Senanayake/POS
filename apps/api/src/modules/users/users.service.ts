import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@pos/db';
import bcrypt from 'bcryptjs';
import type { AuthUserDTO, UserRole } from '@pos/shared';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';

const BCRYPT_ROUNDS = 10;

type UserForDTO = {
  id: string;
  name: string;
  username: string;
  role: UserRole;
  pinHash: string | null;
};

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  async list(): Promise<AuthUserDTO[]> {
    const users = await this.prisma.user.findMany({ orderBy: { createdAt: 'asc' } });
    return users.map((u) => this.toDTO(u));
  }

  async get(id: string): Promise<AuthUserDTO> {
    const user = await this.prisma.user.findUnique({ where: { id } });
    if (!user) throw new NotFoundException('User not found');
    return this.toDTO(user);
  }

  async create(dto: CreateUserDto): Promise<AuthUserDTO> {
    const passwordHash = await bcrypt.hash(dto.password, BCRYPT_ROUNDS);
    const pinHash = dto.pin ? await bcrypt.hash(dto.pin, BCRYPT_ROUNDS) : null;
    const user = await this.prisma.user.create({
      data: {
        name: dto.name,
        username: dto.username,
        passwordHash,
        role: dto.role,
        pinHash,
        isActive: dto.isActive ?? true,
      },
    });
    return this.toDTO(user);
  }

  async update(id: string, dto: UpdateUserDto): Promise<AuthUserDTO> {
    const data: Prisma.UserUpdateInput = {};
    if (dto.name !== undefined) data.name = dto.name;
    if (dto.username !== undefined) data.username = dto.username;
    if (dto.role !== undefined) data.role = dto.role;
    if (dto.isActive !== undefined) data.isActive = dto.isActive;
    if (dto.password !== undefined) {
      data.passwordHash = await bcrypt.hash(dto.password, BCRYPT_ROUNDS);
    }
    const user = await this.prisma.user.update({ where: { id }, data });
    return this.toDTO(user);
  }

  async setPin(id: string, pin: string): Promise<AuthUserDTO> {
    const pinHash = await bcrypt.hash(pin, BCRYPT_ROUNDS);
    const user = await this.prisma.user.update({ where: { id }, data: { pinHash } });
    return this.toDTO(user);
  }

  /** Soft delete — deactivates rather than removing, to preserve audit/order history. */
  async deactivate(id: string): Promise<AuthUserDTO> {
    const user = await this.prisma.user.update({ where: { id }, data: { isActive: false } });
    return this.toDTO(user);
  }

  private toDTO(user: UserForDTO): AuthUserDTO {
    return {
      id: user.id,
      name: user.name,
      username: user.username,
      role: user.role,
      hasPin: user.pinHash != null,
    };
  }
}
