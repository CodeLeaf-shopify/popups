-- AlterTable
ALTER TABLE "Popup" ADD COLUMN "publishedTokens" TEXT;

-- CreateTable
CREATE TABLE "ShopSettings" (
    "shop" TEXT NOT NULL PRIMARY KEY,
    "conflictMode" TEXT NOT NULL DEFAULT 'queue',
    "paused" BOOLEAN NOT NULL DEFAULT false,
    "tokens" TEXT NOT NULL DEFAULT '{}',
    "excludePaths" TEXT NOT NULL DEFAULT '[]',
    "hideForSubscribed" BOOLEAN NOT NULL DEFAULT false,
    "hideForLoggedIn" BOOLEAN NOT NULL DEFAULT false,
    "updatedAt" DATETIME NOT NULL
);
