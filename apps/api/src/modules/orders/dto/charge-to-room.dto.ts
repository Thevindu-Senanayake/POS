import { IsBoolean, IsOptional, IsString, MinLength } from 'class-validator';

/**
 * Settle an order to a guest's room folio instead of taking payment (spec §2.7).
 * Writes a FolioCharge rather than Payment rows.
 */
export class ChargeToRoomDto {
  /** Booking to charge. Optional when the order already carries a bookingId. */
  @IsOptional()
  @IsString()
  @MinLength(1)
  bookingId?: string;

  @IsOptional()
  @IsString()
  label?: string;

  /**
   * Marks a covered board-plan room-service meal: the KOT/stock already fired,
   * so the folio amount is ₨0 (spec §2.7). Only valid for room_service orders on
   * half-/full-board bookings.
   */
  @IsOptional()
  @IsBoolean()
  comp?: boolean;
}
