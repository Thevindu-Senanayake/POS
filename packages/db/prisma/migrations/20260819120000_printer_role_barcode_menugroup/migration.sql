-- CreateEnum
CREATE TYPE "PrinterRole" AS ENUM ('kitchen', 'bar', 'receipt');

-- CreateEnum
CREATE TYPE "PrinterConnection" AS ENUM ('network', 'usb');

-- DropIndex
DROP INDEX "printers_station_key";

-- AlterTable
ALTER TABLE "ingredients" ADD COLUMN     "barcode" TEXT;

-- AlterTable
ALTER TABLE "menu_items" ADD COLUMN     "barcode" TEXT,
ADD COLUMN     "menuGroup" TEXT;

-- AlterTable: introduce printers.role/connection/device. `role` is added
-- nullable first so the existing kitchen/bar rows can be backfilled from the
-- old `station` column before the NOT NULL + unique constraints are enforced.
ALTER TABLE "printers" ADD COLUMN     "connection" "PrinterConnection" NOT NULL DEFAULT 'network',
ADD COLUMN     "device" TEXT,
ADD COLUMN     "role" "PrinterRole";

-- Backfill role from the legacy station (kitchen/bar map 1:1). The station-less
-- receipt printer has no pre-existing row, so there is nothing to backfill there.
UPDATE "printers" SET "role" = "station"::text::"PrinterRole";

-- Every row now has a role: enforce NOT NULL, then drop the superseded column.
ALTER TABLE "printers" ALTER COLUMN "role" SET NOT NULL;
ALTER TABLE "printers" DROP COLUMN "station";

-- CreateIndex
CREATE UNIQUE INDEX "ingredients_barcode_key" ON "ingredients"("barcode");

-- CreateIndex
CREATE UNIQUE INDEX "menu_items_barcode_key" ON "menu_items"("barcode");

-- CreateIndex
CREATE UNIQUE INDEX "printers_role_key" ON "printers"("role");
