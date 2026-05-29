import { jsonError, jsonOk } from "@/lib/api";
import { RegisterError, registerParticipant } from "@/lib/register";

type Params = { params: Promise<{ id: string }> };

export async function POST(request: Request, { params }: Params) {
  const { id: surveyId } = await params;

  let body: { activityId?: string; authValue?: string; studentId?: string; studentName?: string };
  try {
    body = await request.json();
  } catch {
    return jsonError("잘못된 요청입니다.");
  }

  const { activityId } = body;
  if (!activityId) {
    return jsonError("활동 정보가 필요합니다.");
  }

  try {
    const { activity, selectedCount, selectionRequired, selectionMode, isComplete, selectedActivities } =
      await registerParticipant(
      surveyId,
      activityId,
      {
        authValue: body.authValue,
        studentId: body.studentId,
        studentName: body.studentName,
      },
    );
    return jsonOk({
      message: isComplete ? "신청이 완료되었습니다." : "프로그램이 선택되었습니다.",
      activity: {
        id: activity.id,
        name: activity.name,
        currentCount: activity.currentCount,
        maxCapacity: activity.maxCapacity,
      },
      selectedCount,
      selectionRequired,
      selectionMode,
      isComplete,
      selectedActivities,
    });
  } catch (e) {
    if (e instanceof RegisterError) {
      const status =
        e.code === "NOT_STARTED"
          ? 403
          : e.code === "ENDED"
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
