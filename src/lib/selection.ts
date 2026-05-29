import { AuthType, SelectionMode } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";

type TxClient = Omit<
  typeof prisma,
  "$connect" | "$disconnect" | "$on" | "$transaction" | "$extends"
>;

export function normalizeAuthValue(authType: AuthType, raw: string) {
  return authType === AuthType.CODE ? raw.trim().toUpperCase() : raw.trim();
}

export async function getParticipantsForAuth(
  surveyId: string,
  authType: AuthType,
  normalizedAuth: string,
  tx: TxClient = prisma,
) {
  if (authType === AuthType.CODE) {
    return tx.participant.findMany({
      where: { surveyId, authValue: normalizedAuth },
      include: { activity: { select: { name: true } } },
      orderBy: { createdAt: "asc" },
    });
  }

  const participants = await tx.participant.findMany({
    where: { surveyId },
    include: { activity: { select: { name: true } } },
    orderBy: { createdAt: "asc" },
  });
  const key = normalizedAuth.toLowerCase();
  return participants.filter((p) => p.authValue.toLowerCase() === key);
}

export async function isAuthCompleted(
  survey: {
    id: string;
    authType: AuthType;
    selectionMode: SelectionMode;
    selectionCount: number;
  },
  normalizedAuth: string,
  tx: TxClient = prisma,
) {
  if (survey.selectionMode === SelectionMode.UNLIMITED) {
    if (survey.authType === AuthType.CODE) {
      const code = await tx.accessCode.findFirst({
        where: { surveyId: survey.id, code: normalizedAuth },
        select: { used: true },
      });
      return code?.used ?? false;
    }

    const completion = await tx.surveyCompletion.findUnique({
      where: {
        surveyId_authValue: { surveyId: survey.id, authValue: normalizedAuth },
      },
    });
    return !!completion;
  }

  const participants = await getParticipantsForAuth(
    survey.id,
    survey.authType,
    normalizedAuth,
    tx,
  );
  return participants.length >= survey.selectionCount;
}
