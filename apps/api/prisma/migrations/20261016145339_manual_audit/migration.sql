-- CreateEnum
CREATE TYPE "AuditStatus" AS ENUM ('C', 'NC', 'NA');

-- CreateEnum
CREATE TYPE "AuditOrigin" AS ENUM ('AUTOMATIC', 'AUDITOR');

-- CreateEnum
CREATE TYPE "ProposalKind" AS ENUM ('NON_COMPLIANT', 'COMPLIANT_TO_CONFIRM', 'CLUE');

-- CreateTable
CREATE TABLE "audits" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "site_id" UUID NOT NULL,
    "scan_id" UUID,
    "referential_version" TEXT NOT NULL,
    "created_by_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audits_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_pages" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "audit_id" UUID NOT NULL,
    "position" INTEGER NOT NULL,
    "url" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "scan_page_id" UUID,

    CONSTRAINT "audit_pages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_results" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "audit_page_id" UUID NOT NULL,
    "criterion" TEXT NOT NULL,
    "status" "AuditStatus",
    "origin" "AuditOrigin",
    "note" TEXT,
    "proposal" "ProposalKind",
    "proposal_rules" TEXT[],
    "author_id" UUID,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "audit_results_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "statements" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "audit_id" UUID NOT NULL,
    "entity_name" TEXT NOT NULL DEFAULT '',
    "service_name" TEXT NOT NULL DEFAULT '',
    "audited_by" TEXT NOT NULL DEFAULT '',
    "derogations" TEXT NOT NULL DEFAULT '',
    "exemptions" TEXT NOT NULL DEFAULT '',
    "technologies" TEXT NOT NULL DEFAULT '',
    "test_environment" TEXT NOT NULL DEFAULT '',
    "tools" TEXT NOT NULL DEFAULT '',
    "contact_form_url" TEXT NOT NULL DEFAULT '',
    "contact_details" TEXT NOT NULL DEFAULT '',
    "multi_year_plan_url" TEXT NOT NULL DEFAULT '',
    "action_plan_url" TEXT NOT NULL DEFAULT '',
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "statements_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "audits_organization_id_idx" ON "audits"("organization_id");

-- CreateIndex
CREATE INDEX "audits_site_id_created_at_idx" ON "audits"("site_id", "created_at");

-- CreateIndex
CREATE INDEX "audit_pages_organization_id_idx" ON "audit_pages"("organization_id");

-- CreateIndex
CREATE UNIQUE INDEX "audit_pages_audit_id_url_key" ON "audit_pages"("audit_id", "url");

-- CreateIndex
CREATE INDEX "audit_results_organization_id_idx" ON "audit_results"("organization_id");

-- CreateIndex
CREATE UNIQUE INDEX "audit_results_audit_page_id_criterion_key" ON "audit_results"("audit_page_id", "criterion");

-- CreateIndex
CREATE UNIQUE INDEX "statements_audit_id_key" ON "statements"("audit_id");

-- CreateIndex
CREATE INDEX "statements_organization_id_idx" ON "statements"("organization_id");

-- AddForeignKey
ALTER TABLE "audits" ADD CONSTRAINT "audits_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audits" ADD CONSTRAINT "audits_site_id_fkey" FOREIGN KEY ("site_id") REFERENCES "sites"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audits" ADD CONSTRAINT "audits_scan_id_fkey" FOREIGN KEY ("scan_id") REFERENCES "scans"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audits" ADD CONSTRAINT "audits_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_pages" ADD CONSTRAINT "audit_pages_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_pages" ADD CONSTRAINT "audit_pages_audit_id_fkey" FOREIGN KEY ("audit_id") REFERENCES "audits"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_results" ADD CONSTRAINT "audit_results_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_results" ADD CONSTRAINT "audit_results_audit_page_id_fkey" FOREIGN KEY ("audit_page_id") REFERENCES "audit_pages"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_results" ADD CONSTRAINT "audit_results_author_id_fkey" FOREIGN KEY ("author_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "statements" ADD CONSTRAINT "statements_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "statements" ADD CONSTRAINT "statements_audit_id_fkey" FOREIGN KEY ("audit_id") REFERENCES "audits"("id") ON DELETE CASCADE ON UPDATE CASCADE;
