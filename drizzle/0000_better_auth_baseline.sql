CREATE TYPE "public"."audit_event" AS ENUM('SIGN_IN', 'SIGN_OUT', 'ACCOUNT_LINK', 'SESSION_REVOKE', 'PROFILE_BOOTSTRAP', 'ADMIN_ACTION', 'AUTH_FAILURE');--> statement-breakpoint
CREATE TYPE "public"."audit_source" AS ENUM('api', 'webhook', 'admin', 'worker');--> statement-breakpoint
CREATE TYPE "public"."billing_provider" AS ENUM('revenuecat', 'admin', 'free');--> statement-breakpoint
CREATE TYPE "public"."dream_status" AS ENUM('PENDING', 'PROCESSING', 'COMPLETED', 'FAILED');--> statement-breakpoint
CREATE TYPE "public"."entitlement_status" AS ENUM('active', 'expired', 'canceled');--> statement-breakpoint
CREATE TYPE "public"."language" AS ENUM('tr', 'en');--> statement-breakpoint
CREATE TYPE "public"."ledger_reason" AS ENUM('purchase', 'admin_adjustment', 'dream_charge', 'dream_processing_refund');--> statement-breakpoint
CREATE TYPE "public"."plan" AS ENUM('FREE', 'PRO', 'MAX');--> statement-breakpoint
CREATE TYPE "public"."quota_key" AS ENUM('weekly_free_dream', 'subscription_daily_dream');--> statement-breakpoint
CREATE TYPE "public"."quota_source" AS ENUM('weekly_free', 'subscription_daily', 'wallet');--> statement-breakpoint
CREATE TYPE "public"."store" AS ENUM('app_store', 'google_play');--> statement-breakpoint
CREATE TYPE "public"."text_size" AS ENUM('small', 'normal', 'large', 'xlarge');--> statement-breakpoint
CREATE TYPE "public"."dictionary_entry_type" AS ENUM('category', 'symbol', 'theme');--> statement-breakpoint
CREATE TYPE "public"."app_update_tag" AS ENUM('new_interpreter', 'new_feature', 'improvement');--> statement-breakpoint
CREATE TABLE "accounts" (
	"id" uuid PRIMARY KEY DEFAULT pg_catalog.gen_random_uuid() NOT NULL,
	"account_id" text NOT NULL,
	"provider_id" text NOT NULL,
	"user_id" uuid NOT NULL,
	"access_token" text,
	"refresh_token" text,
	"id_token" text,
	"access_token_expires_at" timestamp with time zone,
	"refresh_token_expires_at" timestamp with time zone,
	"scope" text,
	"password" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"id" uuid PRIMARY KEY DEFAULT pg_catalog.gen_random_uuid() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"token" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	"ip_address" text,
	"user_agent" text,
	"user_id" uuid NOT NULL,
	CONSTRAINT "sessions_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT pg_catalog.gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"email_verified" boolean DEFAULT false NOT NULL,
	"image" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"first_name" text,
	"last_name" text,
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "verifications" (
	"id" uuid PRIMARY KEY DEFAULT pg_catalog.gen_random_uuid() NOT NULL,
	"identifier" text NOT NULL,
	"value" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_entitlements" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"plan" "plan" DEFAULT 'FREE' NOT NULL,
	"status" "entitlement_status" DEFAULT 'active' NOT NULL,
	"expires_at" timestamp with time zone,
	"billing_provider" "billing_provider" DEFAULT 'free' NOT NULL,
	"store" "store",
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_usage" (
	"user_id" uuid NOT NULL,
	"quota_key" "quota_key" NOT NULL,
	"window_started_at" timestamp with time zone NOT NULL,
	"used_count" integer DEFAULT 0 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_usage_user_id_quota_key_pk" PRIMARY KEY("user_id","quota_key"),
	CONSTRAINT "user_usage_used_count_nonneg" CHECK ("user_usage"."used_count" >= 0)
);
--> statement-breakpoint
CREATE TABLE "user_wallets" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"balance" integer DEFAULT 0 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_wallets_balance_nonneg" CHECK ("user_wallets"."balance" >= 0)
);
--> statement-breakpoint
CREATE TABLE "entitlement_history" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid,
	"previous_plan" "plan",
	"new_plan" "plan" NOT NULL,
	"previous_status" "entitlement_status",
	"new_status" "entitlement_status" NOT NULL,
	"billing_provider" "billing_provider" NOT NULL,
	"store" "store",
	"reason" text,
	"effective_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "audit_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"actor_user_id" uuid,
	"target_user_id" uuid,
	"event" "audit_event" NOT NULL,
	"source" "audit_source" NOT NULL,
	"request_id" text,
	"ip_address" text,
	"user_agent" text,
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_profiles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"zodiac_sign" varchar(80),
	"birth_date" date,
	"birth_place" varchar(180),
	"country" varchar(120),
	"job" varchar(160),
	"hobbies" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_profiles_user_id_unique" UNIQUE("user_id")
);
--> statement-breakpoint
CREATE TABLE "user_preferences" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"text_size" text_size DEFAULT 'normal' NOT NULL,
	"language" "language" DEFAULT 'tr' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_preferences_user_id_unique" UNIQUE("user_id")
);
--> statement-breakpoint
CREATE TABLE "ai_models" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(160) NOT NULL,
	"openrouter_model_id" varchar(255) NOT NULL,
	"required_plan" "plan" DEFAULT 'FREE' NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"context_length" integer,
	"price_prompt" numeric(12, 8),
	"price_completion" numeric(12, 8),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ai_models_openrouter_model_id_unique" UNIQUE("openrouter_model_id")
);
--> statement-breakpoint
CREATE TABLE "interpreters" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(140) NOT NULL,
	"description" text NOT NULL,
	"system_prompt" text NOT NULL,
	"image_url" varchar(500),
	"is_premium" boolean DEFAULT false NOT NULL,
	"model_id" uuid NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"tag" varchar(80) NOT NULL,
	"accent_color" varchar(9) NOT NULL,
	"rating" numeric(2, 1),
	"reviews" integer DEFAULT 0 NOT NULL,
	"styles" text[],
	"story" text,
	"samples" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "dictionary_entries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"type" "dictionary_entry_type" NOT NULL,
	"slug" varchar(80) NOT NULL,
	"icon" varchar(60) NOT NULL,
	"cat" varchar(80),
	"color" varchar(9),
	"sort_order" integer DEFAULT 0 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"name_tr" varchar(160) NOT NULL,
	"name_en" varchar(160),
	"tagline_tr" text,
	"tagline_en" text,
	"brief_tr" text,
	"brief_en" text,
	"kw_tr" text,
	"kw_en" text,
	"spiritual_tr" text,
	"spiritual_en" text,
	"psych_tr" text,
	"psych_en" text,
	"intuitive_tr" text,
	"intuitive_en" text,
	"related" text[],
	"search_tr" text,
	"search_en" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "dictionary_entries_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "app_updates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" varchar(80) NOT NULL,
	"tag" "app_update_tag" NOT NULL,
	"is_new" boolean DEFAULT false NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"published_at" timestamp with time zone NOT NULL,
	"title_tr" varchar(200) NOT NULL,
	"title_en" varchar(200),
	"blurb_tr" text,
	"blurb_en" text,
	"media_tr" text,
	"media_en" text,
	"body_tr" text[],
	"body_en" text[],
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "app_updates_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "dreams" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"interpreter_id" uuid NOT NULL,
	"content" text NOT NULL,
	"interpretation" text,
	"status" "dream_status" DEFAULT 'PENDING' NOT NULL,
	"user_rating" integer,
	"user_feedback_text" text,
	"is_bookmarked" boolean DEFAULT false NOT NULL,
	"client_request_id" uuid NOT NULL,
	"request_hash" char(64) NOT NULL,
	"queued_at" timestamp with time zone,
	"processing_started_at" timestamp with time zone,
	"processing_attempt_id" uuid,
	"processing_lease_expires_at" timestamp with time zone,
	"attempt_count" integer DEFAULT 0 NOT NULL,
	"last_error" text,
	"completed_at" timestamp with time zone,
	"failed_at" timestamp with time zone,
	"quota_source" "quota_source",
	"quota_key" "quota_key",
	"quota_window_started_at" timestamp with time zone,
	"quota_units_consumed" smallint DEFAULT 0 NOT NULL,
	"used_coins" integer DEFAULT 0 NOT NULL,
	"used_cost" integer DEFAULT 0 NOT NULL,
	"charged_transaction_id" uuid,
	"refund_transaction_id" uuid,
	"refunded_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "dreams_attempt_count_nonneg" CHECK ("dreams"."attempt_count" >= 0),
	CONSTRAINT "dreams_quota_units_nonneg" CHECK ("dreams"."quota_units_consumed" >= 0),
	CONSTRAINT "dreams_used_coins_nonneg" CHECK ("dreams"."used_coins" >= 0),
	CONSTRAINT "dreams_used_cost_nonneg" CHECK ("dreams"."used_cost" >= 0),
	CONSTRAINT "dreams_completed_at_present" CHECK ("dreams"."status" <> 'COMPLETED' OR "dreams"."completed_at" IS NOT NULL),
	CONSTRAINT "dreams_failed_at_present" CHECK ("dreams"."status" <> 'FAILED' OR "dreams"."failed_at" IS NOT NULL)
);
--> statement-breakpoint
CREATE TABLE "credit_transactions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid,
	"amount" integer NOT NULL,
	"balance_after" integer NOT NULL,
	"reason" "ledger_reason" NOT NULL,
	"related_dream_id" uuid,
	"idempotency_key" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "credit_transactions_amount_nonzero" CHECK ("credit_transactions"."amount" <> 0),
	CONSTRAINT "credit_transactions_balance_after_nonneg" CHECK ("credit_transactions"."balance_after" >= 0)
);
--> statement-breakpoint
ALTER TABLE "accounts" ADD CONSTRAINT "accounts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_entitlements" ADD CONSTRAINT "user_entitlements_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_usage" ADD CONSTRAINT "user_usage_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_wallets" ADD CONSTRAINT "user_wallets_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "entitlement_history" ADD CONSTRAINT "entitlement_history_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_actor_user_id_users_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_target_user_id_users_id_fk" FOREIGN KEY ("target_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_profiles" ADD CONSTRAINT "user_profiles_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_preferences" ADD CONSTRAINT "user_preferences_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "interpreters" ADD CONSTRAINT "interpreters_model_id_ai_models_id_fk" FOREIGN KEY ("model_id") REFERENCES "public"."ai_models"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dreams" ADD CONSTRAINT "dreams_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dreams" ADD CONSTRAINT "dreams_interpreter_id_interpreters_id_fk" FOREIGN KEY ("interpreter_id") REFERENCES "public"."interpreters"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dreams" ADD CONSTRAINT "dreams_charged_transaction_id_credit_transactions_id_fk" FOREIGN KEY ("charged_transaction_id") REFERENCES "public"."credit_transactions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dreams" ADD CONSTRAINT "dreams_refund_transaction_id_credit_transactions_id_fk" FOREIGN KEY ("refund_transaction_id") REFERENCES "public"."credit_transactions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "credit_transactions" ADD CONSTRAINT "credit_transactions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "credit_transactions" ADD CONSTRAINT "credit_transactions_related_dream_id_dreams_id_fk" FOREIGN KEY ("related_dream_id") REFERENCES "public"."dreams"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "accounts_userId_idx" ON "accounts" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "sessions_userId_idx" ON "sessions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "verifications_identifier_idx" ON "verifications" USING btree ("identifier");--> statement-breakpoint
CREATE INDEX "entitlement_history_user_created_idx" ON "entitlement_history" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "entitlement_history_effective_idx" ON "entitlement_history" USING btree ("effective_at");--> statement-breakpoint
CREATE INDEX "audit_logs_target_created_idx" ON "audit_logs" USING btree ("target_user_id","created_at");--> statement-breakpoint
CREATE INDEX "audit_logs_event_created_idx" ON "audit_logs" USING btree ("event","created_at");--> statement-breakpoint
CREATE INDEX "interpreters_active_sort_idx" ON "interpreters" USING btree ("is_active","sort_order");--> statement-breakpoint
CREATE INDEX "interpreters_model_id_idx" ON "interpreters" USING btree ("model_id");--> statement-breakpoint
CREATE INDEX "dictionary_entries_type_sort_idx" ON "dictionary_entries" USING btree ("type","sort_order");--> statement-breakpoint
CREATE INDEX "dictionary_entries_cat_idx" ON "dictionary_entries" USING btree ("cat");--> statement-breakpoint
CREATE INDEX "app_updates_published_idx" ON "app_updates" USING btree ("is_active","published_at");--> statement-breakpoint
CREATE INDEX "dreams_user_created_at_idx" ON "dreams" USING btree ("user_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "dreams_user_status_idx" ON "dreams" USING btree ("user_id","status");--> statement-breakpoint
CREATE INDEX "dreams_user_bookmarked_created_at_idx" ON "dreams" USING btree ("user_id","is_bookmarked","created_at");--> statement-breakpoint
CREATE INDEX "dreams_interpreter_id_idx" ON "dreams" USING btree ("interpreter_id");--> statement-breakpoint
CREATE UNIQUE INDEX "dreams_user_client_request_uq" ON "dreams" USING btree ("user_id","client_request_id");--> statement-breakpoint
CREATE INDEX "dreams_pending_recovery_idx" ON "dreams" USING btree ("queued_at") WHERE "dreams"."status" = 'PENDING';--> statement-breakpoint
CREATE INDEX "dreams_processing_lease_idx" ON "dreams" USING btree ("processing_lease_expires_at") WHERE "dreams"."status" = 'PROCESSING';--> statement-breakpoint
CREATE INDEX "credit_transactions_user_created_at_idx" ON "credit_transactions" USING btree ("user_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE UNIQUE INDEX "credit_transactions_user_idempotency_uq" ON "credit_transactions" USING btree ("user_id","idempotency_key") WHERE "credit_transactions"."idempotency_key" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "credit_transactions_dream_refund_uq" ON "credit_transactions" USING btree ("related_dream_id") WHERE "credit_transactions"."reason" = 'dream_processing_refund';--> statement-breakpoint
CREATE INDEX "credit_transactions_related_dream_id_idx" ON "credit_transactions" USING btree ("related_dream_id");