CREATE TABLE "catalog_entries" (
	"organization_id" uuid NOT NULL,
	"snapshot_id" uuid NOT NULL,
	"resource" text NOT NULL,
	"erp_id" text NOT NULL,
	"projection" jsonb NOT NULL,
	"content_hash" text NOT NULL,
	"commercial" text DEFAULT 'PENDING' NOT NULL,
	CONSTRAINT "catalog_entries_organization_id_snapshot_id_resource_erp_id_pk" PRIMARY KEY("organization_id","snapshot_id","resource","erp_id"),
	CONSTRAINT "entry_resource" CHECK ("catalog_entries"."resource" IN ('products','contacts','sellers','priceLists'))
);
--> statement-breakpoint
CREATE TABLE "catalog_heads" (
	"organization_id" uuid PRIMARY KEY NOT NULL,
	"snapshot_id" uuid NOT NULL,
	"revision" integer DEFAULT 1 NOT NULL,
	CONSTRAINT "head_revision" CHECK ("catalog_heads"."revision">0)
);
--> statement-breakpoint
CREATE TABLE "catalog_quarantine" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"snapshot_id" uuid NOT NULL,
	"resource" text NOT NULL,
	"erp_id" text,
	"reason" text NOT NULL,
	"stage" text NOT NULL,
	"resolved" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "catalog_snapshots" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"provider" text DEFAULT 'TINY' NOT NULL,
	"mode" text NOT NULL,
	"status" text DEFAULT 'BUILDING' NOT NULL,
	"commercial" text DEFAULT 'PENDING' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"published_at" timestamp with time zone,
	"manifest" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"checksum" text,
	"anomalies" jsonb DEFAULT '[]'::jsonb NOT NULL,
	CONSTRAINT "snapshot_provider" CHECK ("catalog_snapshots"."provider"='TINY'),
	CONSTRAINT "snapshot_mode" CHECK ("catalog_snapshots"."mode" IN ('FIXTURE','REAL')),
	CONSTRAINT "snapshot_status" CHECK ("catalog_snapshots"."status" IN ('BUILDING','VALIDATING','INCOMPLETE','READY','ACTIVE','SUPERSEDED','REJECTED')),
	CONSTRAINT "snapshot_commercial" CHECK ("catalog_snapshots"."commercial" IN ('PENDING','SYNTHETIC_ONLY'))
);
--> statement-breakpoint
CREATE TABLE "sync_budgets" (
	"key" text PRIMARY KEY NOT NULL,
	"next_at" timestamp with time zone DEFAULT now() NOT NULL,
	"pause_until" timestamp with time zone,
	"lease" uuid,
	"lease_until" timestamp with time zone,
	"remaining" integer,
	"reset_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "sync_jobs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"requested_by" uuid NOT NULL,
	"snapshot_id" uuid NOT NULL,
	"mode" text NOT NULL,
	"resource" text DEFAULT 'ALL' NOT NULL,
	"status" text DEFAULT 'PENDING' NOT NULL,
	"checkpoint" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"pages_processed" integer DEFAULT 0 NOT NULL,
	"records_received" integer DEFAULT 0 NOT NULL,
	"records_validated" integer DEFAULT 0 NOT NULL,
	"records_quarantined" integer DEFAULT 0 NOT NULL,
	"attempt_count" integer DEFAULT 0 NOT NULL,
	"execution_id" uuid,
	"lease_until" timestamp with time zone,
	"retry_after" timestamp with time zone,
	"error_code" text,
	"connection_version" integer,
	"account_key" text,
	"baseline_snapshot_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"started_at" timestamp with time zone,
	"finished_at" timestamp with time zone,
	CONSTRAINT "job_status" CHECK ("sync_jobs"."status" IN ('PENDING','RUNNING','PAUSED','RETRY_WAIT','COMPLETED','FAILED','CANCELLED')),
	CONSTRAINT "job_mode" CHECK ("sync_jobs"."mode" IN ('FIXTURE','REAL')),
	CONSTRAINT "job_counts" CHECK ("sync_jobs"."pages_processed">=0 AND "sync_jobs"."records_received">=0 AND "sync_jobs"."records_validated">=0 AND "sync_jobs"."records_quarantined">=0 AND "sync_jobs"."attempt_count">=0)
);
--> statement-breakpoint
CREATE TABLE "sync_watermarks" (
	"organization_id" uuid NOT NULL,
	"resource" text NOT NULL,
	"watermark" timestamp with time zone,
	"semantics_verified" boolean DEFAULT false NOT NULL,
	"overlap_seconds" integer DEFAULT 300 NOT NULL,
	CONSTRAINT "sync_watermarks_organization_id_resource_pk" PRIMARY KEY("organization_id","resource"),
	CONSTRAINT "watermark_overlap" CHECK ("sync_watermarks"."overlap_seconds">0)
);
--> statement-breakpoint
ALTER TABLE "catalog_entries" ADD CONSTRAINT "catalog_entries_organization_id_snapshot_id_catalog_snapshots_organization_id_id_fk" FOREIGN KEY ("organization_id","snapshot_id") REFERENCES "public"."catalog_snapshots"("organization_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "catalog_heads" ADD CONSTRAINT "catalog_heads_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "catalog_heads" ADD CONSTRAINT "catalog_heads_organization_id_snapshot_id_catalog_snapshots_organization_id_id_fk" FOREIGN KEY ("organization_id","snapshot_id") REFERENCES "public"."catalog_snapshots"("organization_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "catalog_quarantine" ADD CONSTRAINT "catalog_quarantine_organization_id_snapshot_id_catalog_snapshots_organization_id_id_fk" FOREIGN KEY ("organization_id","snapshot_id") REFERENCES "public"."catalog_snapshots"("organization_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "catalog_snapshots" ADD CONSTRAINT "catalog_snapshots_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sync_jobs" ADD CONSTRAINT "sync_jobs_organization_id_requested_by_organization_memberships_organization_id_user_id_fk" FOREIGN KEY ("organization_id","requested_by") REFERENCES "public"."organization_memberships"("organization_id","user_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sync_jobs" ADD CONSTRAINT "sync_jobs_organization_id_snapshot_id_catalog_snapshots_organization_id_id_fk" FOREIGN KEY ("organization_id","snapshot_id") REFERENCES "public"."catalog_snapshots"("organization_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sync_watermarks" ADD CONSTRAINT "sync_watermarks_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "quarantine_snapshot" ON "catalog_quarantine" USING btree ("organization_id","snapshot_id");--> statement-breakpoint
CREATE UNIQUE INDEX "snapshot_tenant_id" ON "catalog_snapshots" USING btree ("organization_id","id");--> statement-breakpoint
CREATE UNIQUE INDEX "one_active_catalog" ON "catalog_snapshots" USING btree ("organization_id","provider") WHERE "catalog_snapshots"."status"='ACTIVE';--> statement-breakpoint
CREATE UNIQUE INDEX "one_sync_per_organization" ON "sync_jobs" USING btree ("organization_id") WHERE "sync_jobs"."status" IN ('PENDING','RUNNING','PAUSED','RETRY_WAIT');