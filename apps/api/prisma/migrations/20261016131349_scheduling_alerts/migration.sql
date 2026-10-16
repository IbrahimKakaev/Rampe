-- CreateEnum
CREATE TYPE "NotificationType" AS ENUM ('REGRESSION');

-- DropIndex
DROP INDEX "scans_organization_id_idx";

-- AlterTable
ALTER TABLE "sites" ADD COLUMN     "next_scan_at" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "notifications" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "scan_id" UUID NOT NULL,
    "type" "NotificationType" NOT NULL,
    "recipients" INTEGER NOT NULL,
    "sent_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "notifications_organization_id_idx" ON "notifications"("organization_id");

-- CreateIndex
CREATE UNIQUE INDEX "notifications_scan_id_type_key" ON "notifications"("scan_id", "type");

-- CreateIndex
CREATE INDEX "scans_organization_id_created_at_idx" ON "scans"("organization_id", "created_at");

-- CreateIndex
CREATE INDEX "sites_next_scan_at_idx" ON "sites"("next_scan_at");

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_scan_id_fkey" FOREIGN KEY ("scan_id") REFERENCES "scans"("id") ON DELETE CASCADE ON UPDATE CASCADE;
