CREATE TABLE "password_reset_tokens" (
	"identifier" text NOT NULL,
	"token" text NOT NULL,
	"expires" timestamp with time zone NOT NULL,
	CONSTRAINT "password_reset_tokens_identifier_token_pk" PRIMARY KEY("identifier","token")
);
