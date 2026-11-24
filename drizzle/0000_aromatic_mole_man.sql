CREATE TYPE "public"."campus_role" AS ENUM('staff', 'admin');--> statement-breakpoint
CREATE TYPE "public"."report_status" AS ENUM('new', 'in_review', 'resolved', 'cancelled');--> statement-breakpoint
CREATE TABLE "accounts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"first_login_at" timestamp with time zone,
	"last_login_at" timestamp with time zone,
	CONSTRAINT "accounts_email_unique" UNIQUE("email"),
	CONSTRAINT "accounts_email_lowercase" CHECK ("accounts"."email" = lower("accounts"."email"))
);
--> statement-breakpoint
CREATE TABLE "buildings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"campus_id" uuid NOT NULL,
	"name" text NOT NULL,
	"name_key" text NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"position_x" real,
	"position_y" real,
	CONSTRAINT "buildings_id_campus_unique" UNIQUE("id","campus_id"),
	CONSTRAINT "buildings_campus_name_key_unique" UNIQUE("campus_id","name_key"),
	CONSTRAINT "buildings_name_length" CHECK (char_length(trim("buildings"."name")) BETWEEN 1 AND 100),
	CONSTRAINT "buildings_position_pair" CHECK (("buildings"."position_x" IS NULL) = ("buildings"."position_y" IS NULL)),
	CONSTRAINT "buildings_position_min" CHECK ("buildings"."position_x" >= 0 AND "buildings"."position_y" >= 0)
);
--> statement-breakpoint
CREATE TABLE "campus_roles" (
	"campus_id" uuid NOT NULL,
	"account_id" uuid NOT NULL,
	"role" "campus_role" NOT NULL,
	"assigned_by" uuid,
	"assigned_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "campus_roles_campus_id_account_id_pk" PRIMARY KEY("campus_id","account_id")
);
--> statement-breakpoint
CREATE TABLE "campuses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"floor_plan_public_id" text NOT NULL,
	"floor_plan_width" integer NOT NULL,
	"floor_plan_height" integer NOT NULL,
	"alert_threshold_new" integer,
	"alert_threshold_in_review" integer,
	"map_threshold_medium" integer,
	"map_threshold_high" integer,
	CONSTRAINT "campuses_slug_unique" UNIQUE("slug"),
	CONSTRAINT "campuses_floor_plan_size" CHECK ("campuses"."floor_plan_width" > 0 AND "campuses"."floor_plan_height" > 0),
	CONSTRAINT "campuses_alert_threshold_new_min" CHECK ("campuses"."alert_threshold_new" >= 1),
	CONSTRAINT "campuses_alert_threshold_in_review_min" CHECK ("campuses"."alert_threshold_in_review" >= 1),
	CONSTRAINT "campuses_map_thresholds_order" CHECK ("campuses"."map_threshold_medium" >= 2 AND "campuses"."map_threshold_high" > "campuses"."map_threshold_medium"),
	CONSTRAINT "campuses_map_thresholds_pair" CHECK (("campuses"."map_threshold_medium" IS NULL) = ("campuses"."map_threshold_high" IS NULL))
);
--> statement-breakpoint
CREATE TABLE "categories" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"campus_id" uuid NOT NULL,
	"name" text NOT NULL,
	"name_key" text NOT NULL,
	"severity" smallint NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	CONSTRAINT "categories_id_campus_unique" UNIQUE("id","campus_id"),
	CONSTRAINT "categories_campus_name_key_unique" UNIQUE("campus_id","name_key"),
	CONSTRAINT "categories_name_length" CHECK (char_length(trim("categories"."name")) BETWEEN 1 AND 100),
	CONSTRAINT "categories_severity_range" CHECK ("categories"."severity" BETWEEN 1 AND 3)
);
--> statement-breakpoint
CREATE TABLE "duplicate_confirmations" (
	"report_id" uuid NOT NULL,
	"account_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "duplicate_confirmations_report_id_account_id_pk" PRIMARY KEY("report_id","account_id")
);
--> statement-breakpoint
CREATE TABLE "report_photos" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"report_id" uuid NOT NULL,
	"public_id" text NOT NULL,
	"format" text NOT NULL,
	"bytes" integer NOT NULL,
	"position" smallint NOT NULL,
	CONSTRAINT "report_photos_report_position_unique" UNIQUE("report_id","position"),
	CONSTRAINT "report_photos_position_range" CHECK ("report_photos"."position" BETWEEN 1 AND 3)
);
--> statement-breakpoint
CREATE TABLE "reports" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"campus_id" uuid NOT NULL,
	"building_id" uuid NOT NULL,
	"space_id" uuid NOT NULL,
	"category_id" uuid NOT NULL,
	"description" varchar(1000) NOT NULL,
	"status" "report_status" DEFAULT 'new' NOT NULL,
	"is_open" boolean GENERATED ALWAYS AS (status IN ('new', 'in_review')) STORED,
	"priority" smallint NOT NULL,
	"confirmation_count" integer DEFAULT 0 NOT NULL,
	"reporter_id" uuid NOT NULL,
	"assignee_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"resolved_at" timestamp with time zone,
	"cancelled_at" timestamp with time zone,
	CONSTRAINT "reports_description_not_blank" CHECK (length(trim("reports"."description")) > 0),
	CONSTRAINT "reports_priority_range" CHECK ("reports"."priority" BETWEEN 1 AND 3),
	CONSTRAINT "reports_confirmation_count_min" CHECK ("reports"."confirmation_count" >= 0),
	CONSTRAINT "reports_in_review_has_assignee" CHECK ("reports"."status" <> 'in_review' OR "reports"."assignee_id" IS NOT NULL)
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"token_hash" text NOT NULL,
	"account_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	CONSTRAINT "sessions_token_hash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
CREATE TABLE "spaces" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"building_id" uuid NOT NULL,
	"name" text NOT NULL,
	"name_key" text NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"link_code" text NOT NULL,
	CONSTRAINT "spaces_link_code_unique" UNIQUE("link_code"),
	CONSTRAINT "spaces_building_name_key_unique" UNIQUE("building_id","name_key"),
	CONSTRAINT "spaces_name_length" CHECK (char_length(trim("spaces"."name")) BETWEEN 1 AND 100)
);
--> statement-breakpoint
ALTER TABLE "buildings" ADD CONSTRAINT "buildings_campus_id_campuses_id_fk" FOREIGN KEY ("campus_id") REFERENCES "public"."campuses"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campus_roles" ADD CONSTRAINT "campus_roles_campus_id_campuses_id_fk" FOREIGN KEY ("campus_id") REFERENCES "public"."campuses"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campus_roles" ADD CONSTRAINT "campus_roles_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campus_roles" ADD CONSTRAINT "campus_roles_assigned_by_accounts_id_fk" FOREIGN KEY ("assigned_by") REFERENCES "public"."accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "categories" ADD CONSTRAINT "categories_campus_id_campuses_id_fk" FOREIGN KEY ("campus_id") REFERENCES "public"."campuses"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "duplicate_confirmations" ADD CONSTRAINT "duplicate_confirmations_report_id_reports_id_fk" FOREIGN KEY ("report_id") REFERENCES "public"."reports"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "duplicate_confirmations" ADD CONSTRAINT "duplicate_confirmations_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "report_photos" ADD CONSTRAINT "report_photos_report_id_reports_id_fk" FOREIGN KEY ("report_id") REFERENCES "public"."reports"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reports" ADD CONSTRAINT "reports_campus_id_campuses_id_fk" FOREIGN KEY ("campus_id") REFERENCES "public"."campuses"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reports" ADD CONSTRAINT "reports_space_id_spaces_id_fk" FOREIGN KEY ("space_id") REFERENCES "public"."spaces"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reports" ADD CONSTRAINT "reports_reporter_id_accounts_id_fk" FOREIGN KEY ("reporter_id") REFERENCES "public"."accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reports" ADD CONSTRAINT "reports_assignee_id_accounts_id_fk" FOREIGN KEY ("assignee_id") REFERENCES "public"."accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reports" ADD CONSTRAINT "reports_building_campus_fk" FOREIGN KEY ("building_id","campus_id") REFERENCES "public"."buildings"("id","campus_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reports" ADD CONSTRAINT "reports_category_campus_fk" FOREIGN KEY ("category_id","campus_id") REFERENCES "public"."categories"("id","campus_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "spaces" ADD CONSTRAINT "spaces_building_id_buildings_id_fk" FOREIGN KEY ("building_id") REFERENCES "public"."buildings"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "reports_order_idx" ON "reports" USING btree ("is_open" DESC NULLS LAST,"priority" DESC NULLS LAST,"created_at");--> statement-breakpoint
CREATE INDEX "reports_duplicates_idx" ON "reports" USING btree ("campus_id","category_id","building_id") WHERE is_open;--> statement-breakpoint
CREATE INDEX "reports_map_idx" ON "reports" USING btree ("campus_id","building_id") WHERE is_open;--> statement-breakpoint
CREATE INDEX "reports_thresholds_idx" ON "reports" USING btree ("campus_id","status") WHERE is_open;--> statement-breakpoint
CREATE INDEX "reports_reporter_idx" ON "reports" USING btree ("reporter_id","created_at");--> statement-breakpoint
CREATE INDEX "reports_assignee_idx" ON "reports" USING btree ("assignee_id") WHERE is_open;--> statement-breakpoint
CREATE INDEX "sessions_account_idx" ON "sessions" USING btree ("account_id");