import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@pos/db';
import type { RoomCategoryDTO, RoomDTO, RoomStatus } from '@pos/shared';
import { decToNum } from '../../common/decimal';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateRoomCategoryDto } from './dto/create-room-category.dto';
import { CreateRoomDto } from './dto/create-room.dto';
import { UpdateRoomCategoryDto } from './dto/update-room-category.dto';
import { UpdateRoomDto } from './dto/update-room.dto';

const ROOM_INCLUDE = {
  roomCategory: { select: { name: true, defaultRate: true } },
} satisfies Prisma.RoomInclude;

type RoomWithCategory = Prisma.RoomGetPayload<{ include: typeof ROOM_INCLUDE }>;

/** Effective nightly rate = room override, else the category default (spec §2.7). */
export function effectiveRate(
  rateOverride: Prisma.Decimal | number | null,
  categoryDefault: Prisma.Decimal | number,
): number {
  return rateOverride === null || rateOverride === undefined
    ? decToNum(categoryDefault)
    : decToNum(rateOverride);
}

/**
 * Room categories and rooms (spec §2.7). Rates are configured here; a booking
 * snapshots the effective rate at creation so later config changes never alter
 * an in-progress guest's bill.
 */
@Injectable()
export class RoomsService {
  constructor(private readonly prisma: PrismaService) {}

  // --- Room categories ---------------------------------------------------

  async listCategories(): Promise<RoomCategoryDTO[]> {
    const categories = await this.prisma.roomCategory.findMany({
      orderBy: { name: 'asc' },
    });
    return categories.map((c) => this.toCategoryDTO(c));
  }

  async createCategory(dto: CreateRoomCategoryDto): Promise<RoomCategoryDTO> {
    const category = await this.prisma.roomCategory.create({
      data: { name: dto.name, defaultRate: new Prisma.Decimal(dto.defaultRate) },
    });
    return this.toCategoryDTO(category);
  }

  async updateCategory(id: string, dto: UpdateRoomCategoryDto): Promise<RoomCategoryDTO> {
    await this.getCategoryOrThrow(id);
    const category = await this.prisma.roomCategory.update({
      where: { id },
      data: {
        ...(dto.name !== undefined ? { name: dto.name } : {}),
        ...(dto.defaultRate !== undefined
          ? { defaultRate: new Prisma.Decimal(dto.defaultRate) }
          : {}),
      },
    });
    return this.toCategoryDTO(category);
  }

  async deleteCategory(id: string): Promise<void> {
    const category = await this.prisma.roomCategory.findUnique({
      where: { id },
      include: { _count: { select: { rooms: true } } },
    });
    if (!category) throw new NotFoundException('Room category not found');
    if (category._count.rooms > 0) {
      throw new ConflictException('Category still has rooms; reassign or remove them first');
    }
    await this.prisma.roomCategory.delete({ where: { id } });
  }

  // --- Rooms -------------------------------------------------------------

  async listRooms(filter: { status?: RoomStatus; categoryId?: string }): Promise<RoomDTO[]> {
    const rooms = await this.prisma.room.findMany({
      where: {
        ...(filter.status ? { status: filter.status } : {}),
        ...(filter.categoryId ? { roomCategoryId: filter.categoryId } : {}),
      },
      include: ROOM_INCLUDE,
      orderBy: { roomNumber: 'asc' },
    });
    return rooms.map((r) => this.toRoomDTO(r));
  }

  async getRoom(id: string): Promise<RoomDTO> {
    return this.toRoomDTO(await this.getRoomOrThrow(id));
  }

  async createRoom(dto: CreateRoomDto): Promise<RoomDTO> {
    await this.getCategoryOrThrow(dto.roomCategoryId);
    const existing = await this.prisma.room.findUnique({
      where: { roomNumber: dto.roomNumber },
      select: { id: true },
    });
    if (existing) throw new ConflictException('Room number already exists');

    const room = await this.prisma.room.create({
      data: {
        roomNumber: dto.roomNumber,
        roomCategoryId: dto.roomCategoryId,
        rateOverride:
          dto.rateOverride === undefined || dto.rateOverride === null
            ? null
            : new Prisma.Decimal(dto.rateOverride),
        status: dto.status ?? 'vacant',
      },
      include: ROOM_INCLUDE,
    });
    return this.toRoomDTO(room);
  }

  async updateRoom(id: string, dto: UpdateRoomDto): Promise<RoomDTO> {
    await this.getRoomOrThrow(id);
    if (dto.roomCategoryId !== undefined) {
      await this.getCategoryOrThrow(dto.roomCategoryId);
    }
    if (dto.roomNumber !== undefined) {
      const clash = await this.prisma.room.findFirst({
        where: { roomNumber: dto.roomNumber, id: { not: id } },
        select: { id: true },
      });
      if (clash) throw new ConflictException('Room number already exists');
    }

    const room = await this.prisma.room.update({
      where: { id },
      data: {
        ...(dto.roomNumber !== undefined ? { roomNumber: dto.roomNumber } : {}),
        ...(dto.roomCategoryId !== undefined ? { roomCategoryId: dto.roomCategoryId } : {}),
        // `rateOverride` may be set to null explicitly to clear the override.
        ...(dto.rateOverride !== undefined
          ? {
              rateOverride:
                dto.rateOverride === null ? null : new Prisma.Decimal(dto.rateOverride),
            }
          : {}),
        ...(dto.status !== undefined ? { status: dto.status } : {}),
      },
      include: ROOM_INCLUDE,
    });
    return this.toRoomDTO(room);
  }

  async deleteRoom(id: string): Promise<void> {
    const room = await this.prisma.room.findUnique({
      where: { id },
      include: { _count: { select: { bookings: true } } },
    });
    if (!room) throw new NotFoundException('Room not found');
    if (room._count.bookings > 0) {
      throw new ConflictException(
        'Room has booking history and cannot be deleted; set it to maintenance instead',
      );
    }
    await this.prisma.room.delete({ where: { id } });
  }

  // --- Helpers -----------------------------------------------------------

  private async getCategoryOrThrow(id: string) {
    const category = await this.prisma.roomCategory.findUnique({ where: { id } });
    if (!category) throw new NotFoundException('Room category not found');
    return category;
  }

  private async getRoomOrThrow(id: string): Promise<RoomWithCategory> {
    const room = await this.prisma.room.findUnique({ where: { id }, include: ROOM_INCLUDE });
    if (!room) throw new NotFoundException('Room not found');
    return room;
  }

  private toCategoryDTO(category: {
    id: string;
    name: string;
    defaultRate: Prisma.Decimal;
  }): RoomCategoryDTO {
    return { id: category.id, name: category.name, defaultRate: decToNum(category.defaultRate) };
  }

  private toRoomDTO(room: RoomWithCategory): RoomDTO {
    return {
      id: room.id,
      roomNumber: room.roomNumber,
      roomCategoryId: room.roomCategoryId,
      categoryName: room.roomCategory.name,
      rateOverride: room.rateOverride === null ? null : decToNum(room.rateOverride),
      effectiveRate: effectiveRate(room.rateOverride, room.roomCategory.defaultRate),
      status: room.status,
    };
  }
}
