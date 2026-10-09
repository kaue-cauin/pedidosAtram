ALTER TABLE "erp_connections" ADD COLUMN "connection_generation" integer DEFAULT 0 NOT NULL;
--> statement-breakpoint
-- Preserve the meaning of existing job bindings across the epoch migration.
UPDATE erp_connections SET connection_generation=token_version;
