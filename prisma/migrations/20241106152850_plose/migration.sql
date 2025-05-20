-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "auth";

-- CreateEnum
CREATE TYPE "public"."GameType" AS ENUM ('biologia', 'fizyka', 'geografia', 'chemia', 'historia', 'kosmos', 'ksiazki', 'samochody', 'programista');

-- CreateEnum
CREATE TYPE "public"."friend_invite_status" AS ENUM ('Pending', 'Accepted', 'Declined');

-- CreateEnum
CREATE TYPE "auth"."aal_level" AS ENUM ('aal1', 'aal2', 'aal3');

-- CreateEnum
CREATE TYPE "auth"."code_challenge_method" AS ENUM ('s256', 'plain');

-- CreateEnum
CREATE TYPE "auth"."factor_status" AS ENUM ('unverified', 'verified');

-- CreateEnum
CREATE TYPE "auth"."factor_type" AS ENUM ('totp', 'webauthn');

-- CreateEnum
CREATE TYPE "public"."game_invite_status" AS ENUM ('Pending', 'Accepted', 'Declined');

-- CreateEnum
CREATE TYPE "public"."pricing_plan_interval" AS ENUM ('day', 'week', 'month', 'year');

-- CreateEnum
CREATE TYPE "public"."pricing_type" AS ENUM ('one_time', 'recurring');

-- CreateEnum
CREATE TYPE "public"."subscription_status" AS ENUM ('trialing', 'active', 'canceled', 'incomplete', 'incomplete_expired', 'past_due', 'unpaid');

-- CreateTable
CREATE TABLE "public"."GameInvitations" (
    "sender_user_id" UUID NOT NULL,
    "receiver_user_id" UUID NOT NULL,
    "status" "public"."game_invite_status" NOT NULL DEFAULT 'Pending',
    "quiz_id" INTEGER NOT NULL,
    "invitation_id" UUID NOT NULL,

    CONSTRAINT "GameInvitations_pkey" PRIMARY KEY ("invitation_id")
);

-- CreateTable
CREATE TABLE "public"."MultiplayerGame" (
    "quiz_id" INTEGER,
    "start_time" TIMESTAMP(6),
    "end_time" TIMESTAMP(6),
    "winner_user_id" UUID,
    "invitation_id" TEXT NOT NULL,
    "game_id" UUID NOT NULL,
    "questions" JSON,

    CONSTRAINT "MultiplayerGame_pkey" PRIMARY KEY ("game_id")
);

-- CreateTable
CREATE TABLE "public"."GameAnswers" (
    "answer_id" SERIAL NOT NULL,
    "user_id" UUID NOT NULL,
    "game_id" UUID NOT NULL,
    "question_id" INTEGER NOT NULL,
    "is_correct" BOOLEAN[],

    CONSTRAINT "GameAnswers_pkey" PRIMARY KEY ("answer_id")
);

-- CreateTable
CREATE TABLE "public"."Questions" (
    "question_id" SERIAL NOT NULL,
    "quiz_id" INTEGER NOT NULL,
    "question_text" TEXT,
    "content" TEXT,
    "correct_answer" TEXT NOT NULL,
    "options" JSONB,
    "approved" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "Questions_pkey" PRIMARY KEY ("question_id")
);

-- CreateTable
CREATE TABLE "public"."quizzes" (
    "quiz_id" SERIAL NOT NULL,
    "title" VARCHAR(100) NOT NULL,
    "description" TEXT,
    "creator_user_id" UUID,
    "creation_date" TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,
    "logo" TEXT DEFAULT 'tuwstawswojamorde.png',

    CONSTRAINT "quizzes_pkey" PRIMARY KEY ("quiz_id")
);

-- CreateTable
CREATE TABLE "public"."Statistics" (
    "stat_id" SERIAL NOT NULL,
    "user_id" UUID,
    "total_quizzes_taken" INTEGER DEFAULT 0,
    "total_correct_answers" INTEGER DEFAULT 0,

    CONSTRAINT "Statistics_pkey" PRIMARY KEY ("stat_id")
);

-- CreateTable
CREATE TABLE "public"."users" (
    "id" UUID NOT NULL,
    "full_name" TEXT,
    "avatar_url" TEXT DEFAULT 'https://t4.ftcdn.net/jpg/05/49/98/39/360_F_549983970_bRCkYfk0P6PP5fKbMhZMIb07mCJ6esXL.jpg',
    "username" TEXT,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."friends" (
    "id" SERIAL NOT NULL,
    "user1" UUID NOT NULL,
    "user2" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "status" "public"."friend_invite_status" NOT NULL DEFAULT 'Pending',

    CONSTRAINT "friends_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "auth"."audit_log_entries" (
    "instance_id" UUID,
    "id" UUID NOT NULL,
    "payload" JSON,
    "created_at" TIMESTAMPTZ(6),
    "ip_address" VARCHAR(64) NOT NULL DEFAULT '',

    CONSTRAINT "audit_log_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "auth"."flow_state" (
    "id" UUID NOT NULL,
    "user_id" UUID,
    "auth_code" TEXT NOT NULL,
    "code_challenge_method" "auth"."code_challenge_method" NOT NULL,
    "code_challenge" TEXT NOT NULL,
    "provider_type" TEXT NOT NULL,
    "provider_access_token" TEXT,
    "provider_refresh_token" TEXT,
    "created_at" TIMESTAMPTZ(6),
    "updated_at" TIMESTAMPTZ(6),
    "authentication_method" TEXT NOT NULL,

    CONSTRAINT "flow_state_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "auth"."identities" (
    "provider_id" TEXT NOT NULL,
    "user_id" UUID NOT NULL,
    "identity_data" JSONB NOT NULL,
    "provider" TEXT NOT NULL,
    "last_sign_in_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6),
    "updated_at" TIMESTAMPTZ(6),
    "email" TEXT DEFAULT lower((identity_data ->> 'email'::text)),
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),

    CONSTRAINT "identities_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "auth"."instances" (
    "id" UUID NOT NULL,
    "uuid" UUID,
    "raw_base_config" TEXT,
    "created_at" TIMESTAMPTZ(6),
    "updated_at" TIMESTAMPTZ(6),

    CONSTRAINT "instances_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "auth"."mfa_amr_claims" (
    "session_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "authentication_method" TEXT NOT NULL,
    "id" UUID NOT NULL,

    CONSTRAINT "amr_id_pk" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "auth"."mfa_challenges" (
    "id" UUID NOT NULL,
    "factor_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL,
    "verified_at" TIMESTAMPTZ(6),
    "ip_address" INET NOT NULL,

    CONSTRAINT "mfa_challenges_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "auth"."mfa_factors" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "friendly_name" TEXT,
    "factor_type" "auth"."factor_type" NOT NULL,
    "status" "auth"."factor_status" NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "secret" TEXT,

    CONSTRAINT "mfa_factors_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "auth"."refresh_tokens" (
    "instance_id" UUID,
    "id" BIGSERIAL NOT NULL,
    "token" VARCHAR(255),
    "user_id" VARCHAR(255),
    "revoked" BOOLEAN,
    "created_at" TIMESTAMPTZ(6),
    "updated_at" TIMESTAMPTZ(6),
    "parent" VARCHAR(255),
    "session_id" UUID,

    CONSTRAINT "refresh_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "auth"."saml_providers" (
    "id" UUID NOT NULL,
    "sso_provider_id" UUID NOT NULL,
    "entity_id" TEXT NOT NULL,
    "metadata_xml" TEXT NOT NULL,
    "metadata_url" TEXT,
    "attribute_mapping" JSONB,
    "created_at" TIMESTAMPTZ(6),
    "updated_at" TIMESTAMPTZ(6),

    CONSTRAINT "saml_providers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "auth"."saml_relay_states" (
    "id" UUID NOT NULL,
    "sso_provider_id" UUID NOT NULL,
    "request_id" TEXT NOT NULL,
    "for_email" TEXT,
    "redirect_to" TEXT,
    "from_ip_address" INET,
    "created_at" TIMESTAMPTZ(6),
    "updated_at" TIMESTAMPTZ(6),
    "flow_state_id" UUID,

    CONSTRAINT "saml_relay_states_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "auth"."schema_migrations" (
    "version" VARCHAR(255) NOT NULL,

    CONSTRAINT "schema_migrations_pkey" PRIMARY KEY ("version")
);

-- CreateTable
CREATE TABLE "auth"."sessions" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6),
    "updated_at" TIMESTAMPTZ(6),
    "factor_id" UUID,
    "aal" "auth"."aal_level",
    "not_after" TIMESTAMPTZ(6),
    "refreshed_at" TIMESTAMP(6),
    "user_agent" TEXT,
    "ip" INET,
    "tag" TEXT,

    CONSTRAINT "sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "auth"."sso_domains" (
    "id" UUID NOT NULL,
    "sso_provider_id" UUID NOT NULL,
    "domain" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(6),
    "updated_at" TIMESTAMPTZ(6),

    CONSTRAINT "sso_domains_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "auth"."sso_providers" (
    "id" UUID NOT NULL,
    "resource_id" TEXT,
    "created_at" TIMESTAMPTZ(6),
    "updated_at" TIMESTAMPTZ(6),

    CONSTRAINT "sso_providers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "auth"."users" (
    "instance_id" UUID,
    "id" UUID NOT NULL,
    "aud" VARCHAR(255),
    "role" VARCHAR(255),
    "email" VARCHAR(255),
    "encrypted_password" VARCHAR(255),
    "email_confirmed_at" TIMESTAMPTZ(6),
    "invited_at" TIMESTAMPTZ(6),
    "confirmation_token" VARCHAR(255),
    "confirmation_sent_at" TIMESTAMPTZ(6),
    "recovery_token" VARCHAR(255),
    "recovery_sent_at" TIMESTAMPTZ(6),
    "email_change_token_new" VARCHAR(255),
    "email_change" VARCHAR(255),
    "email_change_sent_at" TIMESTAMPTZ(6),
    "last_sign_in_at" TIMESTAMPTZ(6),
    "raw_app_meta_data" JSONB,
    "raw_user_meta_data" JSONB,
    "is_super_admin" BOOLEAN,
    "created_at" TIMESTAMPTZ(6),
    "updated_at" TIMESTAMPTZ(6),
    "phone" TEXT,
    "phone_confirmed_at" TIMESTAMPTZ(6),
    "phone_change" TEXT DEFAULT '',
    "phone_change_token" VARCHAR(255) DEFAULT '',
    "phone_change_sent_at" TIMESTAMPTZ(6),
    "confirmed_at" TIMESTAMPTZ(6) DEFAULT LEAST(email_confirmed_at, phone_confirmed_at),
    "email_change_token_current" VARCHAR(255) DEFAULT '',
    "email_change_confirm_status" SMALLINT DEFAULT 0,
    "banned_until" TIMESTAMPTZ(6),
    "reauthentication_token" VARCHAR(255) DEFAULT '',
    "reauthentication_sent_at" TIMESTAMPTZ(6),
    "is_sso_user" BOOLEAN NOT NULL DEFAULT false,
    "deleted_at" TIMESTAMPTZ(6),

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "quizzes_title_key" ON "public"."quizzes"("title");

-- CreateIndex
CREATE UNIQUE INDEX "quizzes_description_key" ON "public"."quizzes"("description");

-- CreateIndex
CREATE INDEX "audit_logs_instance_id_idx" ON "auth"."audit_log_entries"("instance_id");

-- CreateIndex
CREATE INDEX "flow_state_created_at_idx" ON "auth"."flow_state"("created_at" DESC);

-- CreateIndex
CREATE INDEX "idx_auth_code" ON "auth"."flow_state"("auth_code");

-- CreateIndex
CREATE INDEX "idx_user_id_auth_method" ON "auth"."flow_state"("user_id", "authentication_method");

-- CreateIndex
CREATE INDEX "identities_email_idx" ON "auth"."identities"("email");

-- CreateIndex
CREATE INDEX "identities_user_id_idx" ON "auth"."identities"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "identities_provider_id_provider_unique" ON "auth"."identities"("provider_id", "provider");

-- CreateIndex
CREATE UNIQUE INDEX "mfa_amr_claims_session_id_authentication_method_pkey" ON "auth"."mfa_amr_claims"("session_id", "authentication_method");

-- CreateIndex
CREATE INDEX "mfa_challenge_created_at_idx" ON "auth"."mfa_challenges"("created_at" DESC);

-- CreateIndex
CREATE INDEX "factor_id_created_at_idx" ON "auth"."mfa_factors"("user_id", "created_at");

-- CreateIndex
CREATE INDEX "mfa_factors_user_id_idx" ON "auth"."mfa_factors"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "refresh_tokens_token_unique" ON "auth"."refresh_tokens"("token");

-- CreateIndex
CREATE INDEX "refresh_tokens_instance_id_idx" ON "auth"."refresh_tokens"("instance_id");

-- CreateIndex
CREATE INDEX "refresh_tokens_instance_id_user_id_idx" ON "auth"."refresh_tokens"("instance_id", "user_id");

-- CreateIndex
CREATE INDEX "refresh_tokens_parent_idx" ON "auth"."refresh_tokens"("parent");

-- CreateIndex
CREATE INDEX "refresh_tokens_session_id_revoked_idx" ON "auth"."refresh_tokens"("session_id", "revoked");

-- CreateIndex
CREATE INDEX "refresh_tokens_updated_at_idx" ON "auth"."refresh_tokens"("updated_at" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "saml_providers_entity_id_key" ON "auth"."saml_providers"("entity_id");

-- CreateIndex
CREATE INDEX "saml_providers_sso_provider_id_idx" ON "auth"."saml_providers"("sso_provider_id");

-- CreateIndex
CREATE INDEX "saml_relay_states_created_at_idx" ON "auth"."saml_relay_states"("created_at" DESC);

-- CreateIndex
CREATE INDEX "saml_relay_states_for_email_idx" ON "auth"."saml_relay_states"("for_email");

-- CreateIndex
CREATE INDEX "saml_relay_states_sso_provider_id_idx" ON "auth"."saml_relay_states"("sso_provider_id");

-- CreateIndex
CREATE INDEX "sessions_not_after_idx" ON "auth"."sessions"("not_after" DESC);

-- CreateIndex
CREATE INDEX "sessions_user_id_idx" ON "auth"."sessions"("user_id");

-- CreateIndex
CREATE INDEX "user_id_created_at_idx" ON "auth"."sessions"("user_id", "created_at");

-- CreateIndex
CREATE INDEX "sso_domains_sso_provider_id_idx" ON "auth"."sso_domains"("sso_provider_id");

-- CreateIndex
CREATE UNIQUE INDEX "users_phone_key" ON "auth"."users"("phone");

-- CreateIndex
CREATE INDEX "users_instance_id_idx" ON "auth"."users"("instance_id");

-- AddForeignKey
ALTER TABLE "public"."GameInvitations" ADD CONSTRAINT "GameInvitations_quiz_id_fkey" FOREIGN KEY ("quiz_id") REFERENCES "public"."quizzes"("quiz_id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "public"."GameInvitations" ADD CONSTRAINT "GameInvitations_receiver_user_id_fkey" FOREIGN KEY ("receiver_user_id") REFERENCES "public"."users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "public"."GameInvitations" ADD CONSTRAINT "GameInvitations_sender_user_id_fkey" FOREIGN KEY ("sender_user_id") REFERENCES "public"."users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "public"."MultiplayerGame" ADD CONSTRAINT "MultiplayerGame_quiz_id_fkey" FOREIGN KEY ("quiz_id") REFERENCES "public"."quizzes"("quiz_id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "public"."GameAnswers" ADD CONSTRAINT "GameAnswers_game_id_fkey" FOREIGN KEY ("game_id") REFERENCES "public"."MultiplayerGame"("game_id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "public"."GameAnswers" ADD CONSTRAINT "GameAnswers_question_id_fkey" FOREIGN KEY ("question_id") REFERENCES "public"."Questions"("question_id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "public"."GameAnswers" ADD CONSTRAINT "GameAnswers_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "public"."Questions" ADD CONSTRAINT "Questions_quiz_id_fkey" FOREIGN KEY ("quiz_id") REFERENCES "public"."quizzes"("quiz_id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "public"."quizzes" ADD CONSTRAINT "quizzes_creator_user_id_fkey" FOREIGN KEY ("creator_user_id") REFERENCES "public"."users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "public"."Statistics" ADD CONSTRAINT "Statistics_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "public"."users" ADD CONSTRAINT "users_id_fkey" FOREIGN KEY ("id") REFERENCES "auth"."users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "public"."friends" ADD CONSTRAINT "friends_user1_fkey" FOREIGN KEY ("user1") REFERENCES "public"."users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."friends" ADD CONSTRAINT "friends_user2_fkey" FOREIGN KEY ("user2") REFERENCES "public"."users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "auth"."identities" ADD CONSTRAINT "identities_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "auth"."mfa_amr_claims" ADD CONSTRAINT "mfa_amr_claims_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "auth"."sessions"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "auth"."mfa_challenges" ADD CONSTRAINT "mfa_challenges_auth_factor_id_fkey" FOREIGN KEY ("factor_id") REFERENCES "auth"."mfa_factors"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "auth"."mfa_factors" ADD CONSTRAINT "mfa_factors_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "auth"."refresh_tokens" ADD CONSTRAINT "refresh_tokens_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "auth"."sessions"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "auth"."saml_providers" ADD CONSTRAINT "saml_providers_sso_provider_id_fkey" FOREIGN KEY ("sso_provider_id") REFERENCES "auth"."sso_providers"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "auth"."saml_relay_states" ADD CONSTRAINT "saml_relay_states_flow_state_id_fkey" FOREIGN KEY ("flow_state_id") REFERENCES "auth"."flow_state"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "auth"."saml_relay_states" ADD CONSTRAINT "saml_relay_states_sso_provider_id_fkey" FOREIGN KEY ("sso_provider_id") REFERENCES "auth"."sso_providers"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "auth"."sessions" ADD CONSTRAINT "sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "auth"."sso_domains" ADD CONSTRAINT "sso_domains_sso_provider_id_fkey" FOREIGN KEY ("sso_provider_id") REFERENCES "auth"."sso_providers"("id") ON DELETE CASCADE ON UPDATE NO ACTION;
