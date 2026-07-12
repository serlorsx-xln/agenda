ALTER TABLE "payments" ADD COLUMN "expires_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "payments" ADD COLUMN "verified_tran" text;--> statement-breakpoint
ALTER TABLE "payments" ADD COLUMN "verified_ref" text;--> statement-breakpoint
ALTER TABLE "payments" ADD COLUMN "verified_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "payments" ADD COLUMN "slip_receiver_masked" text;--> statement-breakpoint
ALTER TABLE "payments" ADD COLUMN "failure_reason" text;--> statement-breakpoint
CREATE UNIQUE INDEX "payments_promptpay_ref_uidx" ON "payments" USING btree ("promptpay_ref");--> statement-breakpoint
CREATE TABLE "slip_claims" (
	"tran" text PRIMARY KEY NOT NULL,
	"payment_id" uuid NOT NULL,
	"user_id" text NOT NULL,
	"ref_id" text,
	"amount_satang" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
ALTER TABLE "slip_claims" ADD CONSTRAINT "slip_claims_payment_id_payments_id_fk" FOREIGN KEY ("payment_id") REFERENCES "public"."payments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "slip_claims" ADD CONSTRAINT "slip_claims_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;
