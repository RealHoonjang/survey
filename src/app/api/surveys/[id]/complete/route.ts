import { jsonError, jsonOk } from "@/lib/api";
import { RegisterError, completeSelection } from "@/lib/register";

type Params = { params: Promise<{ id: string }> };

export async function POST(request: Request, { params }: Params) {
  const { id: surveyId } = await params;

  let body: { authValue?: string; studentId?: string };
  try {
    body = await request.json();
  } catch {
    return jsonError("잘못된 요청입니다.");
  }

  try {
    const result = await completeSelection(surveyId, body);
    return jsonOk(result);
  } catch (e) {
    if (e instanceof RegisterError) {
      const status =
        e.code === "NOT_STARTED" || e.code === "ENDED"
          ? 403
          : e.code === "CODE_USED" || e.code === "SELECTION_LIMIT"
            ? 409
            : 400;
      return jsonError(e.message, status);
    }
    console.error(e);
    return jsonError("완료 처리 중 오류가 발생했습니다.", 500);
  }
}
