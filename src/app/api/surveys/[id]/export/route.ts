import ExcelJS from "exceljs";
import { jsonError } from "@/lib/api";
import { assertAdminToken, getAdminTokenFromRequest } from "@/lib/admin-auth";
import { AuthType } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";

type Params = { params: Promise<{ id: string }> };

export async function GET(request: Request, { params }: Params) {
  const { id: surveyId } = await params;
  if (!(await assertAdminToken(surveyId, getAdminTokenFromRequest(request)))) {
    return jsonError("관리자 인증이 필요합니다.", 401);
  }

  const survey = await prisma.survey.findUnique({
    where: { id: surveyId },
    include: {
      activities: true,
      participants: {
        orderBy: { createdAt: "asc" },
        include: { activity: true },
      },
    },
  });

  if (!survey) return jsonError("설문을 찾을 수 없습니다.", 404);

  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Student Activity Survey";

  const summary = workbook.addWorksheet("요약");
  summary.columns = [
    { header: "항목", key: "key", width: 20 },
    { header: "값", key: "value", width: 40 },
  ];
  summary.addRows([
    { key: "조사명", value: survey.title },
    { key: "인증방식", value: survey.authType === AuthType.CODE ? "코드" : "학번" },
    { key: "시작", value: survey.startTime.toISOString() },
    { key: "종료", value: survey.endTime.toISOString() },
    { key: "총 참여", value: survey.participants.length },
  ]);

  survey.activities.forEach((a) => {
    summary.addRow({
      key: `활동: ${a.name}`,
      value: `${a.currentCount} / ${a.maxCapacity}`,
    });
  });

  const sheet = workbook.addWorksheet("참여자");
  sheet.columns =
    survey.authType === AuthType.CODE
      ? [
          { header: "번호", key: "no", width: 8 },
          { header: "활동명", key: "activity", width: 24 },
          { header: "코드", key: "auth", width: 20 },
          { header: "학번", key: "studentId", width: 16 },
          { header: "이름", key: "studentName", width: 16 },
          { header: "참여시각", key: "time", width: 24 },
        ]
      : [
          { header: "번호", key: "no", width: 8 },
          { header: "활동명", key: "activity", width: 24 },
          { header: "학번", key: "studentId", width: 16 },
          { header: "이름", key: "studentName", width: 16 },
          { header: "참여시각", key: "time", width: 24 },
        ];

  survey.participants.forEach((p, i) => {
    if (survey.authType === AuthType.CODE) {
      sheet.addRow({
        no: i + 1,
        activity: p.activity.name,
        auth: p.authValue,
        studentId: p.studentId ?? "",
        studentName: p.studentName ?? "",
        time: p.createdAt.toLocaleString("ko-KR"),
      });
      return;
    }

    sheet.addRow({
      no: i + 1,
      activity: p.activity.name,
      studentId: p.studentId ?? p.authValue,
      studentName: p.studentName ?? "",
      time: p.createdAt.toLocaleString("ko-KR"),
    });
  });

  const buffer = await workbook.xlsx.writeBuffer();
  const filename = encodeURIComponent(
    `${survey.title.replace(/[^\w\s가-힣]/g, "_")}_결과.xlsx`,
  );

  return new Response(buffer, {
    headers: {
      "Content-Type":
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename*=UTF-8''${filename}`,
    },
  });
}
