-- CreateTable OAuthStateNonce
CREATE TABLE "OAuthStateNonce" (
    "id" TEXT NOT NULL,
    "stateHash" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "returnUrl" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "consumedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OAuthStateNonce_pkey" PRIMARY KEY ("id")
);

-- CreateIndexes
CREATE UNIQUE INDEX "OAuthStateNonce_stateHash_key" ON "OAuthStateNonce"("stateHash");
CREATE INDEX "OAuthStateNonce_stateHash_idx" ON "OAuthStateNonce"("stateHash");
CREATE INDEX "OAuthStateNonce_userId_idx" ON "OAuthStateNonce"("userId");
