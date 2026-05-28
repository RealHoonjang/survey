import { jsonError } from "@/lib/api";
import { assertAdminToken, getAdminTokenFromRequest } from "@/lib/admin-auth";
import { prisma } from "@/lib/prisma";

type Params = { params: Promise<{ id: string }> };

export async function GET(request: Request, { params }: Params) {
  const { id: surveyId } = await params;
  if (!(await assertAdminToken(surveyId, getAdminTokenFromRequest(request)))) {
    return jsonError("관리자 인증이 필요합니다.", 401);
  }

  const codes = await prisma.accessCode.findMany({
    where: { surveyId },
    orderBy: { code: "asc" },
    select: { code: true, used: true, usedAt: true },
  });

  const headers = new Headers();
  headers.set(
    "Content-Disposition",
    `attachment; filename="codes-${surveyId}.txt"`,
  );
  headers.set("Content-Type", "text/plain; charset=utf-8");

  const lines = codes.map(
    (c) => `${c.code}${c.used ? "\t(사용됨)" : ""}`,
  );
  return new Response(lines.join("\n"), { headers });
}
