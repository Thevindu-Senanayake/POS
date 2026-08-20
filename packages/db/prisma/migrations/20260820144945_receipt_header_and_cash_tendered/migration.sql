-- AlterTable
ALTER TABLE "outlets" ADD COLUMN     "receiptCurrencyLabel" TEXT DEFAULT 'Rs.',
ADD COLUMN     "receiptFooter" TEXT DEFAULT 'Thank you!',
ADD COLUMN     "showAddress" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "showCurrencyLabel" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "showFooter" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "showName" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "showPhone" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "showTagline" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "showTaxNumber" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "tagline" TEXT,
ADD COLUMN     "taxNumber" TEXT;

-- AlterTable
ALTER TABLE "payments" ADD COLUMN     "tendered" DECIMAL(12,2);
