-- CreateTable
CREATE TABLE "Survey" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "title" TEXT NOT NULL,
    "totalStudents" INTEGER NOT NULL,
    "authType" TEXT NOT NULL,
    "allowDuplicate" BOOLEAN NOT NULL DEFAULT false,
    "startTime" DATETIME NOT NULL,
    "endTime" DATETIME NOT NULL,
    "adminTokenHash" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "Activity" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "surveyId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "maxCapacity" INTEGER NOT NULL,
    "currentCount" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "Activity_surveyId_fkey" FOREIGN KEY ("surveyId") REFERENCES "Survey" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "AccessCode" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "surveyId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "used" BOOLEAN NOT NULL DEFAULT false,
    "usedAt" DATETIME,
    CONSTRAINT "AccessCode_surveyId_fkey" FOREIGN KEY ("surveyId") REFERENCES "Survey" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Participant" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "surveyId" TEXT NOT NULL,
    "activityId" TEXT NOT NULL,
    "authValue" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Participant_surveyId_fkey" FOREIGN KEY ("surveyId") REFERENCES "Survey" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Participant_activityId_fkey" FOREIGN KEY ("activityId") REFERENCES "Activity" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "Activity_surveyId_idx" ON "Activity"("surveyId");

-- CreateIndex
CREATE INDEX "AccessCode_surveyId_idx" ON "AccessCode"("surveyId");

-- CreateIndex
CREATE UNIQUE INDEX "AccessCode_surveyId_code_key" ON "AccessCode"("surveyId", "code");

-- CreateIndex
CREATE INDEX "Participant_surveyId_idx" ON "Participant"("surveyId");

-- CreateIndex
CREATE INDEX "Participant_activityId_idx" ON "Participant"("activityId");

-- CreateIndex
CREATE INDEX "Participant_surveyId_authValue_idx" ON "Participant"("surveyId", "authValue");
