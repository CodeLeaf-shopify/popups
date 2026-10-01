-- CreateTable
CREATE TABLE "ShopBilling" (
    "shop" TEXT NOT NULL PRIMARY KEY,
    "plan" TEXT NOT NULL DEFAULT 'free',
    "subscriptionId" TEXT,
    "status" TEXT,
    "test" BOOLEAN NOT NULL DEFAULT false,
    "unpublishedNames" TEXT NOT NULL DEFAULT '[]',
    "checkedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "PopupDailyStat" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "shop" TEXT NOT NULL,
    "popupId" TEXT NOT NULL,
    "day" TEXT NOT NULL,
    "views" INTEGER NOT NULL DEFAULT 0,
    "clicks" INTEGER NOT NULL DEFAULT 0,
    "submits" INTEGER NOT NULL DEFAULT 0,
    "dismissals" INTEGER NOT NULL DEFAULT 0
);

-- CreateIndex
CREATE INDEX "PopupDailyStat_shop_day_idx" ON "PopupDailyStat"("shop", "day");

-- CreateIndex
CREATE UNIQUE INDEX "PopupDailyStat_shop_popupId_day_key" ON "PopupDailyStat"("shop", "popupId", "day");
