-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateTable
CREATE TABLE "Session" (
    "id" TEXT NOT NULL,
    "shop" TEXT NOT NULL,
    "state" TEXT NOT NULL,
    "isOnline" BOOLEAN NOT NULL DEFAULT false,
    "scope" TEXT,
    "expires" TIMESTAMP(3),
    "accessToken" TEXT NOT NULL,
    "userId" BIGINT,
    "firstName" TEXT,
    "lastName" TEXT,
    "email" TEXT,
    "accountOwner" BOOLEAN NOT NULL DEFAULT false,
    "locale" TEXT,
    "collaborator" BOOLEAN DEFAULT false,
    "emailVerified" BOOLEAN DEFAULT false,
    "refreshToken" TEXT,
    "refreshTokenExpires" TIMESTAMP(3),

    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Popup" (
    "id" TEXT NOT NULL,
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
    "publishedTokens" TEXT,
    "testId" TEXT,
    "variant" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Popup_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PopupTest" (
    "id" TEXT NOT NULL,
    "shop" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'running',
    "variantAId" TEXT NOT NULL,
    "variantBId" TEXT NOT NULL,
    "winnerId" TEXT,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endedAt" TIMESTAMP(3),

    CONSTRAINT "PopupTest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Publication" (
    "shop" TEXT NOT NULL,
    "manifest" TEXT NOT NULL,
    "syncStatus" TEXT NOT NULL,
    "error" TEXT,
    "syncedAt" TIMESTAMP(3),

    CONSTRAINT "Publication_pkey" PRIMARY KEY ("shop")
);

-- CreateTable
CREATE TABLE "ShopSettings" (
    "shop" TEXT NOT NULL,
    "conflictMode" TEXT NOT NULL DEFAULT 'queue',
    "paused" BOOLEAN NOT NULL DEFAULT false,
    "tokens" TEXT NOT NULL DEFAULT '{}',
    "excludePaths" TEXT NOT NULL DEFAULT '[]',
    "hideForSubscribed" BOOLEAN NOT NULL DEFAULT false,
    "hideForLoggedIn" BOOLEAN NOT NULL DEFAULT false,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ShopSettings_pkey" PRIMARY KEY ("shop")
);

-- CreateTable
CREATE TABLE "ShopBilling" (
    "shop" TEXT NOT NULL,
    "plan" TEXT NOT NULL DEFAULT 'free',
    "subscriptionId" TEXT,
    "status" TEXT,
    "test" BOOLEAN NOT NULL DEFAULT false,
    "unpublishedNames" TEXT NOT NULL DEFAULT '[]',
    "checkedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ShopBilling_pkey" PRIMARY KEY ("shop")
);

-- CreateTable
CREATE TABLE "PopupDailyStat" (
    "id" TEXT NOT NULL,
    "shop" TEXT NOT NULL,
    "popupId" TEXT NOT NULL,
    "day" TEXT NOT NULL,
    "testId" TEXT NOT NULL DEFAULT '',
    "views" INTEGER NOT NULL DEFAULT 0,
    "clicks" INTEGER NOT NULL DEFAULT 0,
    "submits" INTEGER NOT NULL DEFAULT 0,
    "dismissals" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "PopupDailyStat_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Popup_shop_idx" ON "Popup"("shop");

-- CreateIndex
CREATE INDEX "Popup_testId_idx" ON "Popup"("testId");

-- CreateIndex
CREATE INDEX "PopupTest_shop_status_idx" ON "PopupTest"("shop", "status");

-- CreateIndex
CREATE INDEX "PopupDailyStat_shop_day_idx" ON "PopupDailyStat"("shop", "day");

-- CreateIndex
CREATE INDEX "PopupDailyStat_shop_testId_idx" ON "PopupDailyStat"("shop", "testId");

-- CreateIndex
CREATE UNIQUE INDEX "PopupDailyStat_shop_popupId_day_testId_key" ON "PopupDailyStat"("shop", "popupId", "day", "testId");
