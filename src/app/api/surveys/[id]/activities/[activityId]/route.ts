import { jsonError, jsonOk } from "@/lib/api";
import { assertAdminToken, getAdminTokenFromRequest } from "@/lib/admin-auth";
import { prisma } from "@/lib/prisma";

type Params = { params: Promise<{ id: string; activityId: string }> };

export async function PATCH(request: Request, { params }: Params) {
  const { id: surveyId, activityId } = await params;
  if (!(await assertAdminToken(surveyId, getAdminTokenFromRequest(request)))) {
    return jsonError("관리자 인증이 필요합니다.", 401);
  }

  let body: { name?: string; description?: string; maxCapacity?: number };
  try {
    body = await request.json();
  } catch {
    return jsonError("잘못된 요청입니다.");
  }

  const activity = await prisma.activity.findFirst({
    where: { id: activityId, surveyId },
  });
  if (!activity) return jsonError("활동을 찾을 수 없습니다.", 404);

  if (
    body.maxCapacity !== undefined &&
    body.maxCapacity < activity.currentCount
  ) {
    return jsonError(
      `정원은 현재 신청 인원(${activity.currentCount}명)보다 작을 수 없습니다.`,
    );
  }

  const updated = await prisma.activity.update({
    where: { id: activityId },
    data: {
      ...(body.name !== undefined && { name: body.name.trim() }),
      ...(body.description !== undefined && {
        description: body.description.trim(),
      }),
      ...(body.maxCapacity !== undefined && { maxCapacity: body.maxCapacity }),
    },
  });

  return jsonOk({ activity: updated });
}

export async function DELETE(request: Request, { params }: Params) {
  const { id: surveyId, activityId } = await params;
  if (!(await assertAdminToken(surveyId, getAdminTokenFromRequest(request)))) {
    return jsonError("관리자 인증이 필요합니다.", 401);
  }

  const activity = await prisma.activity.findFirst({
    where: { id: activityId, surveyId },
    include: { _count: { select: { participants: true } } },
  });
  if (!activity) return jsonError("활동을 찾을 수 없습니다.", 404);
  if (activity._count.participants > 0) {
    return jsonError("참여자가 있는 활동은 삭제할 수 없습니다.");
  }

  await prisma.activity.delete({ where: { id: activityId } });
  return jsonOk({ ok: true });
}
