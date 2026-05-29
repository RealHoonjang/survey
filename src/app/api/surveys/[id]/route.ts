import { jsonError, jsonOk } from "@/lib/api";
import { assertAdminToken, getAdminTokenFromRequest } from "@/lib/admin-auth";
import { prisma } from "@/lib/prisma";
import { getSurveyPhase } from "@/lib/survey-status";

type Params = { params: Promise<{ id: string }> };

export async function GET(request: Request, { params }: Params) {
  const { id } = await params;
  const isAdmin = await assertAdminToken(
    id,
    getAdminTokenFromRequest(request),
  );

  if (isAdmin) {
    const survey = await prisma.survey.findUnique({
      where: { id },
      include: {
        activities: { orderBy: { name: "asc" } },
        participants: {
          orderBy: { createdAt: "desc" },
          include: { activity: { select: { name: true } } },
        },
        _count: { select: { accessCodes: true } },
      },
    });
    if (!survey) return jsonError("설문을 찾을 수 없습니다.", 404);
    const phase = getSurveyPhase(survey.startTime, survey.endTime);
    const { adminTokenHash: _hash, _count, ...rest } = survey;
    return jsonOk({
      ...rest,
      phase,
      codesGenerated: _count.accessCodes,
    });
  }

  const survey = await prisma.survey.findUnique({
    where: { id },
    include: { activities: { orderBy: { name: "asc" } } },
  });

  if (!survey) return jsonError("설문을 찾을 수 없습니다.", 404);

  const phase = getSurveyPhase(survey.startTime, survey.endTime);

  return jsonOk({
    id: survey.id,
    title: survey.title,
    authType: survey.authType,
    selectionMode: survey.selectionMode,
    selectionCount: survey.selectionCount,
    phase,
    startTime: survey.startTime,
    endTime: survey.endTime,
    activities: survey.activities.map((a) => ({
      id: a.id,
      name: a.name,
      description: a.description,
      maxCapacity: a.maxCapacity,
      currentCount: a.currentCount,
      remaining: Math.max(0, a.maxCapacity - a.currentCount),
      isFull: a.currentCount >= a.maxCapacity,
    })),
  });
}
