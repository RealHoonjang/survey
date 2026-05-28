-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "AuthType" AS ENUM ('CODE', 'STUDENT_ID');

-- CreateTable
CREATE TABLE "Survey" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "totalStudents" INTEGER NOT NULL,
    "authType" "AuthType" NOT NULL,
    "allowDuplicate" BOOLEAN NOT NULL DEFAULT false,
    "startTime" TIMESTAMP(3) NOT NULL,
    "endTime" TIMESTAMP(3) NOT NULL,
    "adminTokenHash" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Survey_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Activity" (
    "id" TEXT NOT NULL,
    "surveyId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "maxCapacity" INTEGER NOT NULL,
    "currentCount" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "Activity_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AccessCode" (
    "id" TEXT NOT NULL,
    "surveyId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "used" BOOLEAN NOT NULL DEFAULT false,
    "usedAt" TIMESTAMP(3),

    CONSTRAINT "AccessCode_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Participant" (
    "id" TEXT NOT NULL,
    "surveyId" TEXT NOT NULL,
    "activityId" TEXT NOT NULL,
    "authValue" TEXT NOT NULL,
    "studentId" TEXT,
    "studentName" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Participant_pkey" PRIMARY KEY ("id")
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

-- AddForeignKey
ALTER TABLE "Activity" ADD CONSTRAINT "Activity_surveyId_fkey" FOREIGN KEY ("surveyId") REFERENCES "Survey"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AccessCode" ADD CONSTRAINT "AccessCode_surveyId_fkey" FOREIGN KEY ("surveyId") REFERENCES "Survey"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Participant" ADD CONSTRAINT "Participant_surveyId_fkey" FOREIGN KEY ("surveyId") REFERENCES "Survey"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Participant" ADD CONSTRAINT "Participant_activityId_fkey" FOREIGN KEY ("activityId") REFERENCES "Activity"("id") ON DELETE CASCADE ON UPDATE CASCADE;

