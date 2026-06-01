import { jsonError, jsonOk } from "@/lib/api";
import { getSelectionStatus, RegisterError } from "@/lib/register";

type Params = { params: Promise<{ id: string }> };

export async function POST(request: Request, { params }: Params) {
  const { id: surveyId } = await params;

  let body: { authValue?: string; studentId?: string; studentName?: string };
  try {
    body = await request.json();
  } catch {
    return jsonError("잘못된 요청입니다.");
  }

  try {
    const result = await getSelectionStatus(surveyId, body);
    return jsonOk(result);
  } catch (e) {
    if (e instanceof RegisterError) {
      const status = e.code === "NOT_FOUND" ? 404 : 400;
      return jsonError(e.message, status);
    }
    console.error(e);
    return jsonError("선택 상태 조회 중 오류가 발생했습니다.", 500);
  }
}
