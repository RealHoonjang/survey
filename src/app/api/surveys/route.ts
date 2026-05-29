import { AuthType, SelectionMode } from "@/generated/prisma/client";
import { jsonError, jsonOk } from "@/lib/api";
import { hashAdminToken } from "@/lib/auth";
import { generateAccessCodes } from "@/lib/codes";
import { prisma } from "@/lib/prisma";
import { customAlphabet } from "nanoid";

const adminTokenGen = customAlphabet(
  "23456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz",
  24,
);

export async function POST(request: Request) {
  let body: {
    title?: string;
    totalStudents?: number;
    authType?: "CODE" | "STUDENT_ID";
    allowDuplicate?: boolean;
    startTime?: string;
    endTime?: string;
    activities?: { name: string; description?: string; maxCapacity: number }[];
    rosterRows?: Array<Record<string, string>>;
    selectionMode?: "EXACT" | "UNLIMITED";
    selectionCount?: number;
  };

  try {
    body = await request.json();
  } catch {
    return jsonError("잘못된 요청입니다.");
  }

  const {
    title,
    totalStudents,
    authType,
    allowDuplicate = false,
    startTime,
    endTime,
    activities = [],
    rosterRows = [],
    selectionMode = "EXACT",
    selectionCount = 1,
  } = body;

  if (!title?.trim()) return jsonError("조사 명칭을 입력해 주세요.");
  if (!totalStudents || totalStudents < 1) {
    return jsonError("대상 학생 수는 1명 이상이어야 합니다.");
  }
  if (!authType || !["CODE", "STUDENT_ID"].includes(authType)) {
    return jsonError("인증 방식을 선택해 주세요.");
  }
  if (!startTime || !endTime) {
    return jsonError("시작·종료 시간을 설정해 주세요.");
  }

  if (!["EXACT", "UNLIMITED"].includes(selectionMode)) {
    return jsonError("프로그램 선택 방식을 선택해 주세요.");
  }

  const parsedSelectionCount = Number(selectionCount);
  if (
    selectionMode === "EXACT" &&
    (!Number.isInteger(parsedSelectionCount) || parsedSelectionCount < 1)
  ) {
    return jsonError("선택 개수는 1개 이상 정수여야 합니다.");
  }

  const start = new Date(startTime);
  const end = new Date(endTime);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
    return jsonError("올바른 날짜 형식이 아닙니다.");
  }
  if (end <= start) {
    return jsonError("종료 시간은 시작 시간보다 늦어야 합니다.");
  }

  if (activities.length === 0) {
    return jsonError("최소 1개의 활동을 등록해 주세요.");
  }

  const normalizedActivities = activities
    .filter((a) => a.name?.trim())
    .map((a) => ({
      name: a.name.trim(),
      description: (a.description ?? "").trim(),
      maxCapacity: Number(a.maxCapacity),
    }));

  if (normalizedActivities.length === 0) {
    return jsonError("최소 1개의 활동을 등록해 주세요.");
  }

  const hasInvalidCapacity = normalizedActivities.some(
    (a) => !Number.isInteger(a.maxCapacity) || a.maxCapacity < 1,
  );
  if (hasInvalidCapacity) {
    return jsonError("각 활동 정원은 1명 이상 정수여야 합니다.");
  }

  const capacitySum = normalizedActivities.reduce(
    (sum, activity) => sum + activity.maxCapacity,
    0,
  );

  if (selectionMode === "EXACT") {
    const requiredCapacity = totalStudents * parsedSelectionCount;
    if (capacitySum !== requiredCapacity) {
      return jsonError(
        `활동 정원 합(${capacitySum})은 총 대상 학생 수(${totalStudents}) × 선택 개수(${parsedSelectionCount}) = ${requiredCapacity}와 일치해야 합니다.`,
      );
    }
  } else if (capacitySum < totalStudents) {
    return jsonError(
      `자유 선택 모드에서는 활동 정원 합(${capacitySum})이 총 대상 학생 수(${totalStudents}) 이상이어야 합니다.`,
    );
  }

  const normalizedRosterRows = rosterRows
    .map((row) =>
      Object.fromEntries(
        Object.entries(row).map(([key, value]) => [key.trim(), (value ?? "").trim()]),
      ),
    )
    .filter((row) => Object.values(row).some((value) => value));

  if (authType === "CODE" && normalizedRosterRows.length > 0) {
    if (normalizedRosterRows.length !== totalStudents) {
      return jsonError(
        `명단 인원(${normalizedRosterRows.length})과 총 대상 학생 수(${totalStudents})가 일치하지 않습니다.`,
      );
    }
    const missingCore = normalizedRosterRows.find(
      (row) => !row["학번"] || !row["이름"],
    );
    if (missingCore) {
      return jsonError("명단 엑셀에는 '학번'과 '이름' 열이 모두 필요합니다.");
    }
  }

  const adminToken = adminTokenGen();
  const adminTokenHash = await hashAdminToken(adminToken);

  const survey = await prisma.survey.create({
    data: {
      title: title.trim(),
      totalStudents,
      authType: authType as AuthType,
      allowDuplicate,
      selectionMode: selectionMode as SelectionMode,
      selectionCount:
        selectionMode === "EXACT" ? parsedSelectionCount : 1,
      startTime: start,
      endTime: end,
      adminTokenHash,
      activities: {
        create: normalizedActivities,
      },
    },
    include: { activities: true },
  });

  if (authType === "CODE") {
    const codes = generateAccessCodes(totalStudents);
    if (normalizedRosterRows.length > 0) {
      await prisma.accessCode.createMany({
        data: codes.map((code, index) => ({
          surveyId: survey.id,
          code,
          studentId: normalizedRosterRows[index]?.["학번"] ?? null,
          studentName: normalizedRosterRows[index]?.["이름"] ?? null,
          profileJson: normalizedRosterRows[index] ?? null,
        })),
      });
    } else {
      await prisma.accessCode.createMany({
        data: codes.map((code) => ({ surveyId: survey.id, code })),
      });
    }
  }

  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL ?? "";
  return jsonOk({
    survey: {
      id: survey.id,
      title: survey.title,
      authType: survey.authType,
      startTime: survey.startTime,
      endTime: survey.endTime,
      activities: survey.activities,
    },
    adminToken,
    studentUrl: `${baseUrl}/survey/${survey.id}`,
    adminUrl: `${baseUrl}/admin/${survey.id}?token=${adminToken}`,
  });
}
