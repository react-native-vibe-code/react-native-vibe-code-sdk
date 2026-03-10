CREATE TABLE "newsletter_recipients" (
	"template_name" text NOT NULL,
	"user_id" text NOT NULL,
	"email" text NOT NULL,
	"sent_at" timestamp DEFAULT now(),
	CONSTRAINT "newsletter_recipients_template_name_user_id_pk" PRIMARY KEY("template_name","user_id")
);
--> statement-breakpoint
ALTER TABLE "newsletter_recipients" ADD CONSTRAINT "newsletter_recipients_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;