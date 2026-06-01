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

type SurveyWithActivities = Prisma.SurveyGetPayload<{
  include: { activities: true };
}>;

type AuthPayload = {
  authValue?: string;
  studentId?: string;
  studentName?: string;
};

function resolveAuth(survey: { authType: AuthType }, payload: AuthPayload) {
  const normalizedAuth = normalizeAuthValue(
    survey.authType,
    survey.authType === AuthType.CODE
      ? (payload.authValue ?? "")
      : (payload.studentId ?? ""),
  );
  const studentName = (payload.studentName ?? "").trim();
  return { normalizedAuth, studentName };
}

async function validateAuthForRegister(
  survey: SurveyWithActivities,
  payload: AuthPayload,
) {
  const phase = getSurveyPhase(survey.startTime, survey.endTime);
  if (phase === "before") {
    throw new RegisterError("조사가 시작되지 않았습니다.", "NOT_STARTED");
  }
  if (phase === "ended") {
    throw new RegisterError("조사가 종료되었습니다.", "ENDED");
  }

  const { normalizedAuth, studentName } = resolveAuth(survey, payload);

  if (!normalizedAuth) {
    throw new RegisterError("인증 정보를 입력해 주세요.", "INVALID_AUTH");
  }
  if (survey.authType === AuthType.STUDENT_ID && !studentName) {
    throw new RegisterError("이름을 입력해 주세요.", "INVALID_AUTH");
  }

  if (survey.authType === AuthType.CODE) {
    const code = await prisma.accessCode.findFirst({
      where: { surveyId: survey.id, code: normalizedAuth },
    });
    if (!code) {
      throw new RegisterError("유효하지 않은 코드입니다.", "INVALID_AUTH");
    }
  }

  return { normalizedAuth, studentName };
}

async function finalizeAuthIfComplete(
  survey: {
    id: string;
    authType: AuthType;
    selectionMode: SelectionMode;
    selectionCount: number;
  },
  normalizedAuth: string,
  tx: Parameters<Parameters<typeof prisma.$transaction>[0]>[0],
) {
  const participants = await getParticipantsForAuth(
    survey.id,
    survey.authType,
    normalizedAuth,
    tx,
  );

  const shouldComplete =
    survey.selectionMode === SelectionMode.EXACT
      ? participants.length >= survey.selectionCount
      : participants.length > 0;

  if (!shouldComplete) return false;

  if (survey.authType === AuthType.CODE) {
    await tx.accessCode.updateMany({
      where: { surveyId: survey.id, code: normalizedAuth },
      data: { used: true, usedAt: new Date() },
    });
  } else if (survey.selectionMode === SelectionMode.UNLIMITED) {
    await tx.surveyCompletion.upsert({
      where: {
        surveyId_authValue: {
          surveyId: survey.id,
          authValue: normalizedAuth,
        },
      },
      create: { surveyId: survey.id, authValue: normalizedAuth },
      update: {},
    });
  }

  return true;
}

async function registerOneActivity(
  survey: SurveyWithActivities,
  activityId: string,
  normalizedAuth: string,
  studentName: string,
) {
  const activity = survey.activities.find((a) => a.id === activityId);
  if (!activity) {
    throw new RegisterError("설문 또는 활동을 찾을 수 없습니다.", "NOT_FOUND");
  }

  return prisma.$transaction(async (tx) => {
    const existingParticipants = await getParticipantsForAuth(
      survey.id,
      survey.authType,
      normalizedAuth,
      tx,
    );

    if (existingParticipants.some((p) => p.activityId === activityId)) {
      throw new RegisterError("이미 신청한 프로그램입니다.", "DUPLICATE");
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
        where: { surveyId: survey.id, code: normalizedAuth },
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
        AND "surveyId" = ${survey.id}
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
      surveyId: survey.id,
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

    const participant = await tx.participant.create({ data: participantData });
    const updatedActivity = await tx.activity.findUniqueOrThrow({
      where: { id: activityId },
    });

    return { participant, activity: updatedActivity };
  });
}

function buildSelectionResult(
  survey: {
    selectionMode: SelectionMode;
    selectionCount: number;
  },
  participants: Awaited<ReturnType<typeof getParticipantsForAuth>>,
  isComplete: boolean,
) {
  return {
    selectedCount: participants.length,
    selectionRequired:
      survey.selectionMode === SelectionMode.EXACT
        ? survey.selectionCount
        : null,
    selectionMode: survey.selectionMode,
    isComplete,
    selectedActivities: participants.map((p) => ({
      id: p.activityId,
      name: p.activity.name,
    })),
  };
}

export async function registerParticipantsBatch(
  surveyId: string,
  activityIds: string[],
  payload: AuthPayload,
) {
  const survey = await prisma.survey.findUnique({
    where: { id: surveyId },
    include: { activities: true },
  });

  if (!survey) {
    throw new RegisterError("설문을 찾을 수 없습니다.", "NOT_FOUND");
  }

  const { normalizedAuth, studentName } = await validateAuthForRegister(
    survey,
    payload,
  );

  if (await isAuthCompleted(survey, normalizedAuth)) {
    throw new RegisterError(
      survey.selectionMode === SelectionMode.UNLIMITED
        ? "이미 신청을 완료했습니다."
        : "이미 필요한 개수만큼 프로그램을 신청했습니다.",
      survey.authType === AuthType.CODE ? "CODE_USED" : "SELECTION_LIMIT",
    );
  }

  const uniqueIds = [...new Set(activityIds.filter(Boolean))];
  if (uniqueIds.length === 0) {
    throw new RegisterError("신청할 프로그램을 선택해 주세요.", "INVALID_AUTH");
  }

  const unknownId = uniqueIds.find(
    (id) => !survey.activities.some((a) => a.id === id),
  );
  if (unknownId) {
    throw new RegisterError("설문 또는 활동을 찾을 수 없습니다.", "NOT_FOUND");
  }

  const existingParticipants = await getParticipantsForAuth(
    surveyId,
    survey.authType,
    normalizedAuth,
  );
  const alreadyRegisteredIds = new Set(
    existingParticipants.map((p) => p.activityId),
  );
  const toRegister = uniqueIds.filter((id) => !alreadyRegisteredIds.has(id));

  if (toRegister.length === 0) {
    throw new RegisterError(
      "새로 신청할 프로그램이 없습니다.",
      "INVALID_AUTH",
    );
  }

  const totalAfter = existingParticipants.length + toRegister.length;
  if (
    survey.selectionMode === SelectionMode.EXACT &&
    totalAfter > survey.selectionCount
  ) {
    throw new RegisterError(
      `프로그램은 ${survey.selectionCount}개까지 신청할 수 있습니다.`,
      "SELECTION_LIMIT",
    );
  }

  const succeeded: { id: string; name: string }[] = [];
  const failed: { id: string; name: string; message: string }[] = [];

  for (const activityId of toRegister) {
    const activity = survey.activities.find((a) => a.id === activityId)!;
    try {
      await registerOneActivity(
        survey,
        activityId,
        normalizedAuth,
        studentName,
      );
      succeeded.push({ id: activity.id, name: activity.name });
    } catch (e) {
      if (e instanceof RegisterError && e.code === "FULL") {
        failed.push({
          id: activity.id,
          name: activity.name,
          message: e.message,
        });
        continue;
      }
      throw e;
    }
  }

  const allParticipants = await getParticipantsForAuth(
    surveyId,
    survey.authType,
    normalizedAuth,
  );

  let isComplete = false;
  if (failed.length === 0) {
    if (survey.selectionMode === SelectionMode.EXACT) {
      isComplete = allParticipants.length >= survey.selectionCount;
    } else {
      isComplete = allParticipants.length > 0;
    }

    if (isComplete) {
      await prisma.$transaction(async (tx) => {
        await finalizeAuthIfComplete(survey, normalizedAuth, tx);
      });
    }
  }

  const selection = buildSelectionResult(survey, allParticipants, isComplete);

  return {
    succeeded,
    failed,
    ...selection,
    message: isComplete
      ? "신청이 완료되었습니다."
      : failed.length > 0
        ? "일부 프로그램은 정원 마감으로 신청되지 않았습니다. 다른 프로그램을 선택해 주세요."
        : "프로그램이 신청되었습니다.",
  };
}

export async function getSelectionStatus(
  surveyId: string,
  payload: AuthPayload,
) {
  const survey = await prisma.survey.findUnique({ where: { id: surveyId } });
  if (!survey) {
    throw new RegisterError("설문을 찾을 수 없습니다.", "NOT_FOUND");
  }

  const { normalizedAuth, studentName } = resolveAuth(survey, payload);

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

  const participants = await getParticipantsForAuth(
    surveyId,
    survey.authType,
    normalizedAuth,
  );
  const isComplete = await isAuthCompleted(survey, normalizedAuth);

  return {
    selectedCount: participants.length,
    selectionRequired:
      survey.selectionMode === SelectionMode.EXACT
        ? survey.selectionCount
        : null,
    selectionMode: survey.selectionMode,
    isComplete,
    selectedActivities: participants.map((p) => ({
      id: p.activityId,
      name: p.activity.name,
    })),
  };
}

export async function registerParticipant(
  surveyId: string,
  activityId: string,
  payload: AuthPayload,
) {
  const result = await registerParticipantsBatch(
    surveyId,
    [activityId],
    payload,
  );

  if (result.failed.length > 0) {
    throw new RegisterError(result.failed[0].message, "FULL");
  }

  const activity = result.succeeded[0];
  return {
    participant: null,
    activity: {
      id: activity.id,
      name: activity.name,
      currentCount: 0,
      maxCapacity: 0,
    },
    selectedCount: result.selectedCount,
    selectionRequired: result.selectionRequired,
    selectionMode: result.selectionMode,
    isComplete: result.isComplete,
    selectedActivities: result.selectedActivities.map((a) => a.name),
  };
}

export async function completeSelection(
  surveyId: string,
  payload: AuthPayload,
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

  const { normalizedAuth } = resolveAuth(survey, payload);

  if (!normalizedAuth) {
    throw new RegisterError("인증 정보를 입력해 주세요.", "INVALID_AUTH");
  }

  if (await isAuthCompleted(survey, normalizedAuth)) {
    throw new RegisterError("이미 신청을 완료했습니다.", "CODE_USED");
  }

  const participants = await getParticipantsForAuth(
    surveyId,
    survey.authType,
    normalizedAuth,
  );

  if (participants.length === 0) {
    throw new RegisterError(
      "최소 1개 이상의 프로그램을 신청해야 합니다.",
      "INVALID_AUTH",
    );
  }

  await prisma.$transaction(async (tx) => {
    await finalizeAuthIfComplete(survey, normalizedAuth, tx);
  });

  return {
    message: "신청이 완료되었습니다.",
    selectedCount: participants.length,
    selectedActivities: participants.map((p) => p.activity.name),
  };
}
