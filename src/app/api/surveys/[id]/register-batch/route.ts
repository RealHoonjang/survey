import { jsonError, jsonOk } from "@/lib/api";
import { RegisterError, registerParticipantsBatch } from "@/lib/register";

type Params = { params: Promise<{ id: string }> };

export async function POST(request: Request, { params }: Params) {
  const { id: surveyId } = await params;

  let body: {
    activityIds?: string[];
    authValue?: string;
    studentId?: string;
    studentName?: string;
  };
  try {
    body = await request.json();
  } catch {
    return jsonError("잘못된 요청입니다.");
  }

  const activityIds = body.activityIds ?? [];
  if (!Array.isArray(activityIds) || activityIds.length === 0) {
    return jsonError("신청할 프로그램을 선택해 주세요.");
  }

  try {
    const result = await registerParticipantsBatch(surveyId, activityIds, {
      authValue: body.authValue,
      studentId: body.studentId,
      studentName: body.studentName,
    });
    return jsonOk(result);
  } catch (e) {
    if (e instanceof RegisterError) {
      const status =
        e.code === "NOT_STARTED" || e.code === "ENDED"
          ? 403
          : e.code === "FULL"
            ? 409
            : e.code === "SELECTION_LIMIT" || e.code === "CODE_USED"
              ? 409
              : 400;
      return jsonError(e.message, status);
    }
    console.error(e);
    return jsonError("신청 처리 중 오류가 발생했습니다.", 500);
  }
}
