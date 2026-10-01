-- AlterTable
ALTER TABLE "Popup" ADD COLUMN "testId" TEXT;
ALTER TABLE "Popup" ADD COLUMN "variant" TEXT;

-- CreateTable
CREATE TABLE "PopupTest" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "shop" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'running',
    "variantAId" TEXT NOT NULL,
    "variantBId" TEXT NOT NULL,
    "winnerId" TEXT,
    "startedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endedAt" DATETIME
);

-- CreateIndex
CREATE INDEX "Popup_testId_idx" ON "Popup"("testId");
CREATE INDEX "PopupTest_shop_status_idx" ON "PopupTest"("shop", "status");

-- AlterTable
ALTER TABLE "PopupDailyStat" ADD COLUMN "testId" TEXT NOT NULL DEFAULT '';

-- DropIndex
DROP INDEX "PopupDailyStat_shop_popupId_day_key";

-- CreateIndex
CREATE UNIQUE INDEX "PopupDailyStat_shop_popupId_day_testId_key" ON "PopupDailyStat"("shop", "popupId", "day", "testId");
CREATE INDEX "PopupDailyStat_shop_testId_idx" ON "PopupDailyStat"("shop", "testId");
