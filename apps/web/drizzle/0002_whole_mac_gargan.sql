CREATE TABLE "presence" (
	"project_id" uuid NOT NULL,
	"tab_id" text NOT NULL,
	"name" text NOT NULL,
	"cut" text NOT NULL,
	"playhead_frame" integer NOT NULL,
	"colour_seed" integer NOT NULL,
	"last_seen_at" timestamp with time zone NOT NULL,
	CONSTRAINT "presence_project_id_tab_id_pk" PRIMARY KEY("project_id","tab_id")
);
--> statement-breakpoint
CREATE TABLE "project_events" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"project_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"payload" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "branches" ADD COLUMN "created_by" text;--> statement-breakpoint
ALTER TABLE "branches" ADD COLUMN "ready_note" text;--> statement-breakpoint
ALTER TABLE "branches" ADD COLUMN "ready_by" text;--> statement-breakpoint
ALTER TABLE "branches" ADD COLUMN "ready_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "branches" ADD COLUMN "ready_working_rev" integer;--> statement-breakpoint
ALTER TABLE "commits" ADD COLUMN "kind" text;--> statement-breakpoint
ALTER TABLE "commits" ADD COLUMN "actor_name" text;--> statement-breakpoint
UPDATE "commits" SET "kind" = CASE
	WHEN "parent_id" IS NULL THEN 'seed'
	WHEN "name" LIKE 'Auto — %' THEN 'auto'
	WHEN "parent2_id" IS NOT NULL THEN 'bring-in'
	WHEN "name" LIKE 'Restored version %' THEN 'restore'
	WHEN "actor" = 'agent' THEN 'agent-run'
	WHEN "name" = 'Imported timeline' THEN 'import'
	ELSE 'mark'
END;--> statement-breakpoint
UPDATE "commits" SET "actor_name" = CASE
	WHEN "parent_id" IS NULL THEN NULL
	WHEN "actor" = 'agent' THEN 'Agent'
	ELSE 'Editor'
END;--> statement-breakpoint
ALTER TABLE "commits" ALTER COLUMN "kind" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "working_state" ADD COLUMN "last_editor_name" text;--> statement-breakpoint
ALTER TABLE "presence" ADD CONSTRAINT "presence_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_events" ADD CONSTRAINT "project_events_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "project_events_project_id_id_idx" ON "project_events" USING btree ("project_id","id");