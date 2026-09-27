-- CreateTable
CREATE TABLE "Popup" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "shop" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "schemaVersion" INTEGER NOT NULL DEFAULT 1,
    "draftDocument" TEXT NOT NULL,
    "draftBehavior" TEXT NOT NULL,
    "compiledPayload" TEXT,
    "contentRevision" TEXT,
    "assetUrl" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "Publication" (
    "shop" TEXT NOT NULL PRIMARY KEY,
    "manifest" TEXT NOT NULL,
    "syncStatus" TEXT NOT NULL,
    "error" TEXT,
    "syncedAt" DATETIME
);

-- CreateIndex
CREATE INDEX "Popup_shop_idx" ON "Popup"("shop");
