import { AuthType, Prisma, SelectionMode } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { getSurveyPhase } from "@/lib/survey-status";
import {
  getParticipantsForAuth,
  isAuthCompleted,
  normalizeAuthValue,
} from "@/lib/selection";

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
      | "SELECTION_LIMIT"
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

  if (survey.authType === AuthType.CODE) {
    const code = await prisma.accessCode.findFirst({
      where: { surveyId, code: normalizedAuth },
    });
    if (!code) {
      throw new RegisterError("유효하지 않은 코드입니다.", "INVALID_AUTH");
    }
  }

  if (await isAuthCompleted(survey, normalizedAuth)) {
    throw new RegisterError(
      survey.selectionMode === SelectionMode.UNLIMITED
        ? "이미 선택을 완료했습니다."
        : "이미 필요한 개수만큼 프로그램을 선택했습니다.",
      survey.authType === AuthType.CODE ? "CODE_USED" : "SELECTION_LIMIT",
    );
  }

  const existingParticipants = await getParticipantsForAuth(
    surveyId,
    survey.authType,
    normalizedAuth,
  );

  if (existingParticipants.some((p) => p.activityId === activityId)) {
    throw new RegisterError("이미 선택한 프로그램입니다.", "DUPLICATE");
  }

  if (
    survey.selectionMode === SelectionMode.EXACT &&
    existingParticipants.length >= survey.selectionCount
  ) {
    throw new RegisterError(
      `프로그램은 ${survey.selectionCount}개까지 선택할 수 있습니다.`,
      "SELECTION_LIMIT",
    );
  }

  return prisma.$transaction(async (tx) => {
    if (await isAuthCompleted(survey, normalizedAuth, tx)) {
      throw new RegisterError(
        survey.selectionMode === SelectionMode.UNLIMITED
          ? "이미 선택을 완료했습니다."
          : "이미 필요한 개수만큼 프로그램을 선택했습니다.",
        survey.authType === AuthType.CODE ? "CODE_USED" : "SELECTION_LIMIT",
      );
    }

    let matchedCode:
      | {
          studentId: string | null;
          studentName: string | null;
          profileJson: unknown;
        }
      | null = null;

    if (survey.authType === AuthType.CODE) {
      const code = await tx.accessCode.findFirst({
        where: { surveyId, code: normalizedAuth },
        select: {
          studentId: true,
          studentName: true,
          profileJson: true,
        },
      });
      if (!code) {
        throw new RegisterError("유효하지 않은 코드입니다.", "INVALID_AUTH");
      }
      matchedCode = code;
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

    const participantData: Prisma.ParticipantUncheckedCreateInput = {
      surveyId,
      activityId,
      authValue: normalizedAuth,
    };

    if (survey.authType === AuthType.STUDENT_ID) {
      participantData.studentId = normalizedAuth;
      participantData.studentName = studentName;
    } else {
      participantData.studentId = matchedCode?.studentId ?? null;
      participantData.studentName = matchedCode?.studentName ?? null;
      if (
        matchedCode?.profileJson !== undefined &&
        matchedCode.profileJson !== null
      ) {
        participantData.profileJson =
          matchedCode.profileJson as Prisma.InputJsonValue;
      }
    }

    const participant = await tx.participant.create({
      data: participantData,
    });

    const allParticipants = await getParticipantsForAuth(
      surveyId,
      survey.authType,
      normalizedAuth,
      tx,
    );

    const isComplete =
      survey.selectionMode === SelectionMode.EXACT
        ? allParticipants.length >= survey.selectionCount
        : false;

    if (
      isComplete &&
      survey.authType === AuthType.CODE &&
      survey.selectionMode === SelectionMode.EXACT
    ) {
      await tx.accessCode.updateMany({
        where: { surveyId, code: normalizedAuth },
        data: { used: true, usedAt: new Date() },
      });
    }

    const activity = await tx.activity.findUniqueOrThrow({
      where: { id: activityId },
    });

    return {
      participant,
      activity,
      selectedCount: allParticipants.length,
      selectionRequired:
        survey.selectionMode === SelectionMode.EXACT
          ? survey.selectionCount
          : null,
      selectionMode: survey.selectionMode,
      isComplete,
      selectedActivities: allParticipants.map((p) => p.activity.name),
    };
  });
}

export async function completeSelection(
  surveyId: string,
  payload: {
    authValue?: string;
    studentId?: string;
  },
) {
  const survey = await prisma.survey.findUnique({ where: { id: surveyId } });
  if (!survey) {
    throw new RegisterError("설문을 찾을 수 없습니다.", "NOT_FOUND");
  }

  if (survey.selectionMode !== SelectionMode.UNLIMITED) {
    throw new RegisterError(
      "이 조사는 자유 선택 완료 방식이 아닙니다.",
      "INVALID_AUTH",
    );
  }

  const phase = getSurveyPhase(survey.startTime, survey.endTime);
  if (phase === "before") {
    throw new RegisterError("조사가 시작되지 않았습니다.", "NOT_STARTED");
  }
  if (phase === "ended") {
    throw new RegisterError("조사가 종료되었습니다.", "ENDED");
  }

  const normalizedAuth = normalizeAuthValue(
    survey.authType,
    survey.authType === AuthType.CODE
      ? (payload.authValue ?? "")
      : (payload.studentId ?? ""),
  );

  if (!normalizedAuth) {
    throw new RegisterError("인증 정보를 입력해 주세요.", "INVALID_AUTH");
  }

  if (await isAuthCompleted(survey, normalizedAuth)) {
    throw new RegisterError("이미 선택을 완료했습니다.", "CODE_USED");
  }

  const participants = await getParticipantsForAuth(
    surveyId,
    survey.authType,
    normalizedAuth,
  );

  if (participants.length === 0) {
    throw new RegisterError(
      "최소 1개 이상의 프로그램을 선택해야 합니다.",
      "INVALID_AUTH",
    );
  }

  await prisma.$transaction(async (tx) => {
    if (survey.authType === AuthType.CODE) {
      await tx.accessCode.updateMany({
        where: { surveyId, code: normalizedAuth },
        data: { used: true, usedAt: new Date() },
      });
    } else {
      await tx.surveyCompletion.create({
        data: { surveyId, authValue: normalizedAuth },
      });
    }
  });

  return {
    message: "신청이 완료되었습니다.",
    selectedCount: participants.length,
    selectedActivities: participants.map((p) => p.activity.name),
  };
}
