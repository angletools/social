-- AlterTable
ALTER TABLE "AlertRule" ADD COLUMN     "webhookUrl" TEXT;

-- AlterTable
ALTER TABLE "Notification" ADD COLUMN     "userId" TEXT;

-- AlterTable
ALTER TABLE "Organization" ADD COLUMN     "onboardingDoneAt" TIMESTAMP(3),
ADD COLUMN     "timezone" TEXT NOT NULL DEFAULT 'Asia/Riyadh',
ADD COLUMN     "weeklyReportDay" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "weeklyReportEnabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "weeklyReportLastSentAt" TIMESTAMP(3),
ADD COLUMN     "weeklyReportLocale" TEXT NOT NULL DEFAULT 'ar',
ADD COLUMN     "weeklyReportRecipients" TEXT[];

-- CreateTable
CREATE TABLE "AppState" (
    "key" TEXT NOT NULL,
    "value" JSONB NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AppState_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "LoginAttempt" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "ip" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LoginAttempt_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "LoginAttempt_key_createdAt_idx" ON "LoginAttempt"("key", "createdAt");
