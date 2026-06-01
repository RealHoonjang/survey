"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Badge, Button, Card, Input, Label, Textarea } from "@/components/ui";
import * as XLSX from "xlsx";

type ActivityDraft = {
  name: string;
  description: string;
  maxCapacity: number;
};

function toLocalInputValue(date: Date) {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export default function NewSurveyPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [created, setCreated] = useState<{
    adminUrl: string;
    studentUrl: string;
    adminToken: string;
  } | null>(null);

  const [title, setTitle] = useState("");
  const [totalStudents, setTotalStudents] = useState("30");
  const [authType, setAuthType] = useState<"CODE" | "STUDENT_ID">("CODE");
  const [allowDuplicate, setAllowDuplicate] = useState(false);
  const [selectionMode, setSelectionMode] = useState<"EXACT" | "UNLIMITED">("EXACT");
  const [selectionCount, setSelectionCount] = useState("1");
  const [startTime, setStartTime] = useState(() =>
    toLocalInputValue(new Date()),
  );
  const [endTime, setEndTime] = useState(() =>
    toLocalInputValue(new Date(Date.now() + 3600000)),
  );
  const [activities, setActivities] = useState<ActivityDraft[]>([
    { name: "", description: "", maxCapacity: 10 },
  ]);
  const [rosterRows, setRosterRows] = useState<Array<Record<string, string>>>([]);
  const [rosterFileName, setRosterFileName] = useState("");

  const addActivity = () =>
    setActivities([...activities, { name: "", description: "", maxCapacity: 10 }]);

  const updateActivity = (i: number, patch: Partial<ActivityDraft>) => {
    const next = [...activities];
    next[i] = { ...next[i], ...patch };
    setActivities(next);
  };

  const removeActivity = (i: number) => {
    if (activities.length <= 1) return;
    setActivities(activities.filter((_, idx) => idx !== i));
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const parsedTotalStudents = Number(totalStudents);
      if (!Number.isInteger(parsedTotalStudents) || parsedTotalStudents < 1) {
        throw new Error("총 대상 학생 수는 1명 이상 정수여야 합니다.");
      }

      const parsedSelectionCount = Number(selectionCount);
      if (
        selectionMode === "EXACT" &&
        (!Number.isInteger(parsedSelectionCount) || parsedSelectionCount < 1)
      ) {
        throw new Error("선택 개수는 1개 이상 정수여야 합니다.");
      }

      const filledActivities = activities.filter((a) => a.name.trim());
      const capacitySum = filledActivities.reduce(
        (sum, activity) => sum + activity.maxCapacity,
        0,
      );
      if (selectionMode === "EXACT") {
        const requiredCapacity = parsedTotalStudents * parsedSelectionCount;
        if (capacitySum !== requiredCapacity) {
          throw new Error(
            `활동 정원 합(${capacitySum})은 총 대상 학생 수(${parsedTotalStudents}) × 선택 개수(${parsedSelectionCount}) = ${requiredCapacity}와 일치해야 합니다.`,
          );
        }
      } else if (capacitySum < parsedTotalStudents) {
        throw new Error(
          `자유 선택 모드에서는 활동 정원 합(${capacitySum})이 총 대상 학생 수(${parsedTotalStudents}) 이상이어야 합니다.`,
        );
      }
      if (authType === "CODE" && rosterRows.length > 0) {
        if (rosterRows.length !== parsedTotalStudents) {
          throw new Error(
            `명단 인원(${rosterRows.length})과 총 대상 학생 수(${parsedTotalStudents})가 일치하지 않습니다.`,
          );
        }
      }

      const res = await fetch("/api/surveys", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title,
          totalStudents: parsedTotalStudents,
          authType,
          allowDuplicate,
          selectionMode,
          selectionCount:
            selectionMode === "EXACT" ? parsedSelectionCount : 1,
          startTime: new Date(startTime).toISOString(),
          endTime: new Date(endTime).toISOString(),
          activities: filledActivities,
          rosterRows: authType === "CODE" ? rosterRows : [],
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "생성 실패");

      const origin =
        typeof window !== "undefined" ? window.location.origin : "";
      const toAbsUrl = (maybeUrl: string, fallbackPath: string) => {
        const url = maybeUrl || fallbackPath;
        if (url.startsWith("http://") || url.startsWith("https://")) return url;
        const path = url.startsWith("/") ? url : `/${url}`;
        return `${origin}${path}`;
      };
      setCreated({
        adminUrl:
          toAbsUrl(
            data.adminUrl,
            `/admin/${data.survey.id}?token=${data.adminToken}`,
          ),
        studentUrl: toAbsUrl(data.studentUrl, `/survey/${data.survey.id}`),
        adminToken: data.adminToken,
      });
      sessionStorage.setItem(`admin-token-${data.survey.id}`, data.adminToken);
      router.prefetch(`/admin/${data.survey.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "오류가 발생했습니다.");
    } finally {
      setLoading(false);
    }
  };

  const handleRosterFileChange = async (
    e: React.ChangeEvent<HTMLInputElement>,
  ) => {
    const file = e.target.files?.[0];
    if (!file) {
      setRosterRows([]);
      setRosterFileName("");
      return;
    }

    try {
      const buffer = await file.arrayBuffer();
      const workbook = XLSX.read(buffer, { type: "array" });
      const firstSheetName = workbook.SheetNames[0];
      if (!firstSheetName) throw new Error("엑셀 시트를 찾을 수 없습니다.");
      const sheet = workbook.Sheets[firstSheetName];
      const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, {
        defval: "",
      });

      const normalizedRows = rows
        .map((row) =>
          Object.fromEntries(
            Object.entries(row).map(([k, v]) => [k.trim(), String(v ?? "").trim()]),
          ),
        )
        .filter((row) => Object.values(row).some((value) => value));

      if (normalizedRows.length === 0) {
        throw new Error("엑셀 명단에 데이터가 없습니다.");
      }

      const hasRequiredColumns = normalizedRows.every(
        (row) => row["학번"] && row["이름"],
      );
      if (!hasRequiredColumns) {
        throw new Error("엑셀에는 '학번'과 '이름' 열이 필요합니다.");
      }

      setRosterRows(normalizedRows);
      setRosterFileName(file.name);
      setTotalStudents(String(normalizedRows.length));
      setError("");
    } catch (error) {
      setRosterRows([]);
      setRosterFileName("");
      setError(
        error instanceof Error
          ? error.message
          : "엑셀 파일을 읽는 중 오류가 발생했습니다.",
      );
    }
  };

  if (created) {
    return (
      <main className="mx-auto max-w-2xl px-4 py-10">
        <Card>
          <Badge tone="success">조사 생성 완료</Badge>
          <h1 className="mt-3 text-xl font-bold">링크를 저장해 주세요</h1>
          <p className="mt-2 text-sm text-slate-600">
            관리자 토큰은 다시 표시되지 않습니다. 북마크하거나 복사해 두세요.
          </p>
          <div className="mt-6 space-y-4 text-sm">
            <div>
              <p className="font-medium text-slate-700">학생 참여 링크</p>
              <p className="mt-1 break-all rounded-lg bg-slate-100 p-3 font-mono text-xs">
                {created.studentUrl || `/survey/[id]`}
              </p>
            </div>
            <div>
              <p className="font-medium text-slate-700">교사 관리 링크</p>
              <p className="mt-1 break-all rounded-lg bg-slate-100 p-3 font-mono text-xs">
                {created.adminUrl}
              </p>
            </div>
          </div>
          <div className="mt-6 flex flex-wrap gap-3">
            <Link href={created.adminUrl || "/"}>
              <Button>대시보드 열기</Button>
            </Link>
            <Link href="/">
              <Button variant="secondary">홈으로</Button>
            </Link>
          </div>
        </Card>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-2xl px-4 py-8 pb-20" lang="ko">
      <Link href="/" className="text-sm text-indigo-600 hover:underline">
        ← 홈
      </Link>
      <h1 className="mt-4 text-2xl font-bold">새 조사 만들기</h1>

      <form onSubmit={submit} className="mt-6 space-y-6">
        <Card>
          <h2 className="mb-4 font-semibold">기본 설정</h2>
          <div className="space-y-4">
            <div>
              <Label>조사 명칭</Label>
              <Input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="예: 2학년 체육 선택 활동"
                required
              />
            </div>
            <div>
              <Label>총 대상 학생 수</Label>
              <Input
                type="number"
                min={1}
                value={totalStudents}
                onChange={(e) => setTotalStudents(e.target.value)}
                placeholder="예: 14"
                required
              />
            </div>
            <div>
              <Label>인증 방식</Label>
              <div className="mt-2 flex flex-col gap-2 sm:flex-row">
                <label className="flex cursor-pointer items-center gap-2 rounded-lg border border-slate-200 p-3 has-checked:border-indigo-500 has-checked:bg-indigo-50">
                  <input
                    type="radio"
                    name="authType"
                    checked={authType === "CODE"}
                    onChange={() => setAuthType("CODE")}
                  />
                  <span className="text-sm">
                    <strong>랜덤 코드</strong>
                    <br />
                    <span className="text-slate-500">
                      학생 수만큼 코드 자동 생성
                    </span>
                  </span>
                </label>
                <label className="flex cursor-pointer items-center gap-2 rounded-lg border border-slate-200 p-3 has-checked:border-indigo-500 has-checked:bg-indigo-50">
                  <input
                    type="radio"
                    name="authType"
                    checked={authType === "STUDENT_ID"}
                    onChange={() => setAuthType("STUDENT_ID")}
                  />
                  <span className="text-sm">
                    <strong>학번 입력</strong>
                    <br />
                    <span className="text-slate-500">학생이 직접 학번 입력</span>
                  </span>
                </label>
              </div>
            </div>
            {authType === "CODE" && (
              <div>
                <Label>학생 명단 엑셀 (선택)</Label>
                <Input
                  type="file"
                  accept=".xlsx,.xls"
                  onChange={handleRosterFileChange}
                />
                <p className="mt-2 text-xs text-slate-500">
                  '학번', '이름' 열이 포함된 엑셀을 업로드하면 학생별 랜덤 코드가
                  생성되어 코드 다운로드 파일에 함께 제공됩니다.
                </p>
                {rosterFileName && (
                  <p className="mt-1 text-xs text-indigo-600">
                    {rosterFileName} ({rosterRows.length}명 로드됨)
                  </p>
                )}
              </div>
            )}
            <div>
              <Label>프로그램 선택 방식</Label>
              <div className="mt-2 flex flex-col gap-2">
                <label className="flex cursor-pointer items-start gap-2 rounded-lg border border-slate-200 p-3 has-checked:border-indigo-500 has-checked:bg-indigo-50">
                  <input
                    type="radio"
                    name="selectionMode"
                    className="mt-1"
                    checked={selectionMode === "EXACT"}
                    onChange={() => setSelectionMode("EXACT")}
                  />
                  <span className="text-sm">
                    <strong>정확히 N개 선택</strong>
                    <br />
                    <span className="text-slate-500">
                      학생이 지정한 개수만큼 모두 선택해야 완료됩니다.
                    </span>
                  </span>
                </label>
                <label className="flex cursor-pointer items-start gap-2 rounded-lg border border-slate-200 p-3 has-checked:border-indigo-500 has-checked:bg-indigo-50">
                  <input
                    type="radio"
                    name="selectionMode"
                    className="mt-1"
                    checked={selectionMode === "UNLIMITED"}
                    onChange={() => setSelectionMode("UNLIMITED")}
                  />
                  <span className="text-sm">
                    <strong>원하는 만큼 선택</strong>
                    <br />
                    <span className="text-slate-500">
                      학생이 원하는 프로그램을 고른 뒤 직접 완료합니다.
                    </span>
                  </span>
                </label>
              </div>
              {selectionMode === "EXACT" && (
                <div className="mt-3">
                  <Label>학생 1인당 선택 개수</Label>
                  <Input
                    type="number"
                    min={1}
                    value={selectionCount}
                    onChange={(e) => setSelectionCount(e.target.value)}
                    placeholder="예: 2"
                    required
                  />
                </div>
              )}
            </div>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={allowDuplicate}
                onChange={(e) => setAllowDuplicate(e.target.checked)}
              />
              동일 코드/학번으로 중복 참여 허용
            </label>
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <Label>시작 시간</Label>
                <Input
                  type="datetime-local"
                  value={startTime}
                  onChange={(e) => setStartTime(e.target.value)}
                  required
                />
              </div>
              <div>
                <Label>종료 시간</Label>
                <Input
                  type="datetime-local"
                  value={endTime}
                  onChange={(e) => setEndTime(e.target.value)}
                  required
                />
              </div>
            </div>
          </div>
        </Card>

        <Card>
          <div className="mb-4 flex items-center justify-between">
            <h2 className="font-semibold">활동 목록</h2>
            <Button type="button" variant="secondary" onClick={addActivity}>
              + 활동 추가
            </Button>
          </div>
          <div className="space-y-4">
            {activities.map((a, i) => (
              <div
                key={i}
                className="rounded-lg border border-slate-100 bg-slate-50 p-4"
              >
                <div className="mb-3 flex items-center justify-between">
                  <span className="text-sm font-medium text-slate-500">
                    활동 {i + 1}
                  </span>
                  {activities.length > 1 && (
                    <button
                      type="button"
                      onClick={() => removeActivity(i)}
                      className="text-xs text-red-600 hover:underline"
                    >
                      삭제
                    </button>
                  )}
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="sm:col-span-2">
                    <Label>활동명</Label>
                    <Input
                      value={a.name}
                      onChange={(e) =>
                        updateActivity(i, { name: e.target.value })
                      }
                      lang="ko"
                      spellCheck
                      required
                    />
                  </div>
                  <div className="sm:col-span-2">
                    <Label>설명</Label>
                    <Textarea
                      rows={2}
                      value={a.description}
                      onChange={(e) =>
                        updateActivity(i, { description: e.target.value })
                      }
                      lang="ko"
                      spellCheck
                    />
                  </div>
                  <div>
                    <Label>정원</Label>
                    <Input
                      type="number"
                      min={1}
                      value={a.maxCapacity}
                      onChange={(e) =>
                        updateActivity(i, {
                          maxCapacity: Number(e.target.value),
                        })
                      }
                      required
                    />
                  </div>
                </div>
              </div>
            ))}
          </div>
        </Card>

        {error && (
          <p className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </p>
        )}

        <Button type="submit" className="w-full" disabled={loading}>
          {loading ? "생성 중…" : "조사 생성"}
        </Button>
      </form>
    </main>
  );
}
