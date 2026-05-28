import { AuthType } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { getSurveyPhase } from "@/lib/survey-status";

export class RegisterError extends Error {
  constructor(
    message: string,
    public code:
      | "NOT_STARTED"
      | "ENDED"
      | "FULL"
      | "DUPLICATE"
      | "INVALID_AUTH"
      | "CODE_USED"
      | "NOT_FOUND",
  ) {
    super(message);
  }
}

export async function registerParticipant(
  surveyId: string,
  activityId: string,
  payload: {
    authValue?: string;
    studentId?: string;
    studentName?: string;
  },
) {
  const survey = await prisma.survey.findUnique({
    where: { id: surveyId },
    include: { activities: { where: { id: activityId } } },
  });

  if (!survey || survey.activities.length === 0) {
    throw new RegisterError("설문 또는 활동을 찾을 수 없습니다.", "NOT_FOUND");
  }

  const phase = getSurveyPhase(survey.startTime, survey.endTime);
  if (phase === "before") {
    throw new RegisterError("조사가 시작되지 않았습니다.", "NOT_STARTED");
  }
  if (phase === "ended") {
    throw new RegisterError("조사가 종료되었습니다.", "ENDED");
  }

  const normalizedAuth =
    survey.authType === AuthType.CODE
      ? (payload.authValue ?? "").trim().toUpperCase()
      : (payload.studentId ?? "").trim();
  const studentName = (payload.studentName ?? "").trim();

  if (!normalizedAuth) {
    throw new RegisterError("인증 정보를 입력해 주세요.", "INVALID_AUTH");
  }
  if (survey.authType === AuthType.STUDENT_ID && !studentName) {
    throw new RegisterError("이름을 입력해 주세요.", "INVALID_AUTH");
  }

  if (!survey.allowDuplicate) {
    const existing = await findDuplicateParticipant(
      surveyId,
      survey.authType,
      normalizedAuth,
    );
    if (existing) {
      throw new RegisterError(
        "이미 참여한 인증 정보입니다.",
        "DUPLICATE",
      );
    }
  }

  if (survey.authType === AuthType.CODE) {
    const code = await prisma.accessCode.findFirst({
      where: { surveyId, code: normalizedAuth },
    });
    if (!code) {
      throw new RegisterError("유효하지 않은 코드입니다.", "INVALID_AUTH");
    }
    if (!survey.allowDuplicate && code.used) {
      throw new RegisterError("이미 사용된 코드입니다.", "CODE_USED");
    }
  }

  return prisma.$transaction(async (tx) => {
    if (!survey.allowDuplicate) {
      const dup = await findDuplicateParticipant(
        surveyId,
        survey.authType,
        normalizedAuth,
        tx,
      );
      if (dup) {
        throw new RegisterError(
          "이미 참여한 인증 정보입니다.",
          "DUPLICATE",
        );
      }
    }

    if (survey.authType === AuthType.CODE) {
      const code = await tx.accessCode.findFirst({
        where: { surveyId, code: normalizedAuth },
      });
      if (!code) {
        throw new RegisterError("유효하지 않은 코드입니다.", "INVALID_AUTH");
      }
      if (!survey.allowDuplicate && code.used) {
        throw new RegisterError("이미 사용된 코드입니다.", "CODE_USED");
      }
    }

    const updated = await tx.$executeRaw`
      UPDATE "Activity"
      SET "currentCount" = "currentCount" + 1
      WHERE "id" = ${activityId}
        AND "surveyId" = ${surveyId}
        AND "currentCount" < "maxCapacity"
    `;

    const rows =
      typeof updated === "number"
        ? updated
        : (updated as { count?: number }).count ?? 0;

    if (rows === 0) {
      throw new RegisterError("정원이 마감되었습니다.", "FULL");
    }

    const participant = await tx.participant.create({
      data: {
        surveyId,
        activityId,
        authValue: normalizedAuth,
        ...(survey.authType === AuthType.STUDENT_ID && {
          studentId: normalizedAuth,
          studentName,
        }),
      },
    });

    if (survey.authType === AuthType.CODE && !survey.allowDuplicate) {
      await tx.accessCode.updateMany({
        where: { surveyId, code: normalizedAuth },
        data: { used: true, usedAt: new Date() },
      });
    }

    const activity = await tx.activity.findUniqueOrThrow({
      where: { id: activityId },
    });

    return { participant, activity };
  });
}

type TxClient = Omit<
  typeof prisma,
  "$connect" | "$disconnect" | "$on" | "$transaction" | "$extends"
>;

async function findDuplicateParticipant(
  surveyId: string,
  authType: AuthType,
  normalizedAuth: string,
  tx: TxClient = prisma,
) {
  if (authType === AuthType.CODE) {
    return tx.participant.findFirst({
      where: { surveyId, authValue: normalizedAuth },
    });
  }
  const participants = await tx.participant.findMany({ where: { surveyId } });
  const key = normalizedAuth.toLowerCase();
  return participants.find((p) => p.authValue.toLowerCase() === key) ?? null;
}
