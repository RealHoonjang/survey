-- CreateEnum
CREATE TYPE "SelectionMode" AS ENUM ('EXACT', 'UNLIMITED');

-- AlterTable
ALTER TABLE "Survey"
ADD COLUMN "selectionMode" "SelectionMode" NOT NULL DEFAULT 'EXACT',
ADD COLUMN "selectionCount" INTEGER NOT NULL DEFAULT 1;

-- CreateTable
CREATE TABLE "SurveyCompletion" (
    "id" TEXT NOT NULL,
    "surveyId" TEXT NOT NULL,
    "authValue" TEXT NOT NULL,
    "completedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SurveyCompletion_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "SurveyCompletion_surveyId_authValue_key" ON "SurveyCompletion"("surveyId", "authValue");

-- CreateIndex
CREATE INDEX "SurveyCompletion_surveyId_idx" ON "SurveyCompletion"("surveyId");

-- AddForeignKey
ALTER TABLE "SurveyCompletion" ADD CONSTRAINT "SurveyCompletion_surveyId_fkey" FOREIGN KEY ("surveyId") REFERENCES "Survey"("id") ON DELETE CASCADE ON UPDATE CASCADE;
