import { jsonError } from "@/lib/api";
import { assertAdminToken, getAdminTokenFromRequest } from "@/lib/admin-auth";
import { prisma } from "@/lib/prisma";
import ExcelJS from "exceljs";

type Params = { params: Promise<{ id: string }> };

export async function GET(request: Request, { params }: Params) {
  const { id: surveyId } = await params;
  if (!(await assertAdminToken(surveyId, getAdminTokenFromRequest(request)))) {
    return jsonError("관리자 인증이 필요합니다.", 401);
  }

  const codes = await prisma.accessCode.findMany({
    where: { surveyId },
    orderBy: { id: "asc" },
    select: {
      code: true,
      used: true,
      usedAt: true,
      studentId: true,
      studentName: true,
      profileJson: true,
    },
  });

  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("코드명단");

  const dynamicKeys = new Set<string>();
  for (const code of codes) {
    const profile =
      code.profileJson && typeof code.profileJson === "object"
        ? (code.profileJson as Record<string, unknown>)
        : null;
    if (!profile) continue;
    for (const key of Object.keys(profile)) dynamicKeys.add(key);
  }

  const orderedDynamicKeys = Array.from(dynamicKeys);
  const baseColumns = orderedDynamicKeys.length
    ? orderedDynamicKeys
    : ["학번", "이름"];

  sheet.columns = [
    ...baseColumns.map((key) => ({ header: key, key, width: 18 })),
    { header: "랜덤코드", key: "randomCode", width: 14 },
    { header: "사용여부", key: "used", width: 12 },
    { header: "사용시각", key: "usedAt", width: 20 },
  ];

  for (const code of codes) {
    const profile =
      code.profileJson && typeof code.profileJson === "object"
        ? (code.profileJson as Record<string, unknown>)
        : {};
    const row: Record<string, unknown> = {};
    for (const key of baseColumns) {
      if (Object.prototype.hasOwnProperty.call(profile, key)) {
        row[key] = String(profile[key] ?? "");
      } else if (key === "학번") {
        row[key] = code.studentId ?? "";
      } else if (key === "이름") {
        row[key] = code.studentName ?? "";
      } else {
        row[key] = "";
      }
    }
    row.randomCode = code.code;
    row.used = code.used ? "사용됨" : "";
    row.usedAt = code.usedAt ? code.usedAt.toLocaleString("ko-KR") : "";
    sheet.addRow(row);
  }

  const buffer = await workbook.xlsx.writeBuffer();
  return new Response(buffer, {
    headers: {
      "Content-Type":
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="codes-${surveyId}.xlsx"`,
    },
  });
}
