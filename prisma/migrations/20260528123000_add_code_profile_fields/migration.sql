ALTER TABLE "AccessCode"
ADD COLUMN "studentId" TEXT,
ADD COLUMN "studentName" TEXT,
ADD COLUMN "profileJson" JSONB;

ALTER TABLE "Participant"
ADD COLUMN "profileJson" JSONB;
