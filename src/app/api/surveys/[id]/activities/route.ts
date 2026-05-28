import { jsonError, jsonOk } from "@/lib/api";
import { assertAdminToken, getAdminTokenFromRequest } from "@/lib/admin-auth";
import { prisma } from "@/lib/prisma";

type Params = { params: Promise<{ id: string }> };

export async function POST(request: Request, { params }: Params) {
  const { id: surveyId } = await params;
  if (!(await assertAdminToken(surveyId, getAdminTokenFromRequest(request)))) {
    return jsonError("관리자 인증이 필요합니다.", 401);
  }

  let body: { name?: string; description?: string; maxCapacity?: number };
  try {
    body = await request.json();
  } catch {
    return jsonError("잘못된 요청입니다.");
  }

  const { name, description = "", maxCapacity } = body;
  if (!name?.trim()) return jsonError("활동명을 입력해 주세요.");
  if (!maxCapacity || maxCapacity < 1) {
    return jsonError("정원은 1명 이상이어야 합니다.");
  }

  const activity = await prisma.activity.create({
    data: {
      surveyId,
      name: name.trim(),
      description: description.trim(),
      maxCapacity,
    },
  });

  return jsonOk({ activity });
}
