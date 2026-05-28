"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Badge, Button, Card, Input, Label, Textarea } from "@/components/ui";

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
  const [startTime, setStartTime] = useState(() =>
    toLocalInputValue(new Date(Date.now() + 3600000)),
  );
  const [endTime, setEndTime] = useState(() =>
    toLocalInputValue(new Date(Date.now() + 7200000)),
  );
  const [activities, setActivities] = useState<ActivityDraft[]>([
    { name: "", description: "", maxCapacity: 10 },
  ]);

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

      const filledActivities = activities.filter((a) => a.name.trim());
      const capacitySum = filledActivities.reduce(
        (sum, activity) => sum + activity.maxCapacity,
        0,
      );
      if (capacitySum !== parsedTotalStudents) {
        throw new Error(
          `총 대상 학생 수(${parsedTotalStudents})와 활동 정원 합(${capacitySum})이 일치하지 않습니다.`,
        );
      }

      const res = await fetch("/api/surveys", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title,
          totalStudents: parsedTotalStudents,
          authType,
          allowDuplicate,
          startTime: new Date(startTime).toISOString(),
          endTime: new Date(endTime).toISOString(),
          activities: filledActivities,
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
    <main className="mx-auto max-w-2xl px-4 py-8 pb-20">
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
