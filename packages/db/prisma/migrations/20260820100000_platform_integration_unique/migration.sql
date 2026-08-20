-- Platform-owned integrations (Google Tag Manager, Search Console, …) are stored
-- as Integration rows with userId = NULL, so they are never confused with a
-- customer's own connected account.
--
-- @@unique([userId, kind]) does NOT constrain these: Postgres treats every NULL
-- as distinct, so that index would happily allow ten platform GTM rows and a
-- lookup would pick an arbitrary one. A partial unique index is what actually
-- enforces "at most one platform row per kind".

-- Collapse any pre-existing duplicates first (none expected), keeping the newest.
DELETE FROM "Integration" a
USING "Integration" b
WHERE a."userId" IS NULL
  AND b."userId" IS NULL
  AND a."kind" = b."kind"
  AND a."updatedAt" < b."updatedAt";

CREATE UNIQUE INDEX "Integration_platform_kind_key"
  ON "Integration" ("kind")
  WHERE "userId" IS NULL;
