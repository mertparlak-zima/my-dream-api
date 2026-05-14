CREATE TYPE "public"."auth_provider" AS ENUM('GOOGLE', 'APPLE');--> statement-breakpoint
CREATE TYPE "public"."credit_transaction_type" AS ENUM('USED_WEEKLY', 'USED_EXTRA', 'PURCHASED', 'REFUNDED');--> statement-breakpoint
CREATE TYPE "public"."dream_status" AS ENUM('PENDING', 'PROCESSING', 'COMPLETED', 'FAILED');--> statement-breakpoint
CREATE TYPE "public"."plan" AS ENUM('FREE', 'PRO', 'MAX');--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY NOT NULL,
	"email" varchar(255) NOT NULL,
	"auth_provider" "auth_provider" NOT NULL,
	"provider_id" varchar(255) NOT NULL,
	"first_name" varchar(120),
	"last_name" varchar(120),
	"plan" "plan" DEFAULT 'FREE' NOT NULL,
	"weekly_dream_count" integer DEFAULT 0 NOT NULL,
	"limit_reset_date" timestamp with time zone NOT NULL,
	"extra_credits" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email")
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
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
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
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "credit_transactions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"transaction_type" "credit_transaction_type" NOT NULL,
	"amount" integer NOT NULL,
	"related_dream_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "user_profiles" ADD CONSTRAINT "user_profiles_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "interpreters" ADD CONSTRAINT "interpreters_model_id_ai_models_id_fk" FOREIGN KEY ("model_id") REFERENCES "public"."ai_models"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dreams" ADD CONSTRAINT "dreams_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dreams" ADD CONSTRAINT "dreams_interpreter_id_interpreters_id_fk" FOREIGN KEY ("interpreter_id") REFERENCES "public"."interpreters"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "credit_transactions" ADD CONSTRAINT "credit_transactions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "credit_transactions" ADD CONSTRAINT "credit_transactions_related_dream_id_dreams_id_fk" FOREIGN KEY ("related_dream_id") REFERENCES "public"."dreams"("id") ON DELETE set null ON UPDATE no action;