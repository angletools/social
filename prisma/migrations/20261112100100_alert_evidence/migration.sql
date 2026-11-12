ALTER TABLE "AlertRule" ADD COLUMN "minimumVolume" INTEGER NOT NULL DEFAULT 20;
ALTER TABLE "AlertRule" ADD CONSTRAINT "AlertRule_minimum_volume_check" CHECK ("minimumVolume" BETWEEN 5 AND 10000);
