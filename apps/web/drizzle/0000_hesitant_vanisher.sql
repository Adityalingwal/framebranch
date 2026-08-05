CREATE TABLE "branches" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"name" text NOT NULL,
	"head_commit_id" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "commits" (
	"id" text PRIMARY KEY NOT NULL,
	"project_id" uuid NOT NULL,
	"parent_id" text,
	"parent2_id" text,
	"name" text NOT NULL,
	"actor" text NOT NULL,
	"snapshot_distance" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"import_warnings" jsonb
);
--> statement-breakpoint
CREATE TABLE "merge_attempts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"branch_into" uuid NOT NULL,
	"branch_from" uuid NOT NULL,
	"head_into" text NOT NULL,
	"head_from" text NOT NULL,
	"draft_timeline" jsonb NOT NULL,
	"conflicts" jsonb NOT NULL,
	"choices" jsonb NOT NULL,
	"status" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ops" (
	"id" uuid PRIMARY KEY NOT NULL,
	"project_id" uuid NOT NULL,
	"commit_id" text NOT NULL,
	"seq" integer NOT NULL,
	"command" jsonb NOT NULL,
	"actor" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "projects" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_token" text NOT NULL,
	"project_rate" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "snapshots" (
	"commit_id" text PRIMARY KEY NOT NULL,
	"project_id" uuid NOT NULL,
	"timeline" jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tickets" (
	"ticket" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"endpoint" text NOT NULL,
	"result" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "tickets_project_id_endpoint_ticket_key" PRIMARY KEY("project_id","endpoint","ticket")
);
--> statement-breakpoint
CREATE TABLE "working_state" (
	"branch_id" uuid PRIMARY KEY NOT NULL,
	"project_id" uuid NOT NULL,
	"base_commit_id" text NOT NULL,
	"pending_ops" jsonb NOT NULL,
	"working_rev" integer NOT NULL
);
--> statement-breakpoint
ALTER TABLE "branches" ADD CONSTRAINT "branches_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "commits" ADD CONSTRAINT "commits_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "merge_attempts" ADD CONSTRAINT "merge_attempts_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "merge_attempts" ADD CONSTRAINT "merge_attempts_branch_into_branches_id_fk" FOREIGN KEY ("branch_into") REFERENCES "public"."branches"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "merge_attempts" ADD CONSTRAINT "merge_attempts_branch_from_branches_id_fk" FOREIGN KEY ("branch_from") REFERENCES "public"."branches"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ops" ADD CONSTRAINT "ops_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ops" ADD CONSTRAINT "ops_commit_id_commits_id_fk" FOREIGN KEY ("commit_id") REFERENCES "public"."commits"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "snapshots" ADD CONSTRAINT "snapshots_commit_id_commits_id_fk" FOREIGN KEY ("commit_id") REFERENCES "public"."commits"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "snapshots" ADD CONSTRAINT "snapshots_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tickets" ADD CONSTRAINT "tickets_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "working_state" ADD CONSTRAINT "working_state_branch_id_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "working_state" ADD CONSTRAINT "working_state_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "working_state" ADD CONSTRAINT "working_state_base_commit_id_commits_id_fk" FOREIGN KEY ("base_commit_id") REFERENCES "public"."commits"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "branches_project_id_idx" ON "branches" USING btree ("project_id");--> statement-breakpoint
CREATE UNIQUE INDEX "branches_project_id_name_key" ON "branches" USING btree ("project_id","name");--> statement-breakpoint
CREATE INDEX "commits_project_id_idx" ON "commits" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "commits_parent_id_idx" ON "commits" USING btree ("parent_id");--> statement-breakpoint
CREATE INDEX "merge_attempts_project_id_idx" ON "merge_attempts" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "ops_project_id_idx" ON "ops" USING btree ("project_id");--> statement-breakpoint
CREATE UNIQUE INDEX "ops_commit_id_seq_key" ON "ops" USING btree ("commit_id","seq");--> statement-breakpoint
CREATE UNIQUE INDEX "projects_owner_token_key" ON "projects" USING btree ("owner_token");--> statement-breakpoint
CREATE INDEX "projects_created_at_idx" ON "projects" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "snapshots_project_id_idx" ON "snapshots" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "tickets_project_id_idx" ON "tickets" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "tickets_created_at_idx" ON "tickets" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "working_state_project_id_idx" ON "working_state" USING btree ("project_id");