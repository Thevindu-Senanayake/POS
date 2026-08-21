-- CreateEnum
CREATE TYPE "IngredientDepartment" AS ENUM ('bar', 'restaurant');

-- AlterTable
ALTER TABLE "ingredients" ADD COLUMN     "department" "IngredientDepartment" NOT NULL DEFAULT 'restaurant';

-- Backfill: classify existing rows. Spirits/wine (measured in ml) and any
-- barcoded bottle are bar stock; everything else keeps the `restaurant` default.
UPDATE "ingredients" SET "department" = 'bar' WHERE "baseUnit" = 'ml' OR "barcode" IS NOT NULL;

-- CreateIndex
CREATE INDEX "ingredients_department_idx" ON "ingredients"("department");
