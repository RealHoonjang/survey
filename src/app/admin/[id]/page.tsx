"use client";

import Link from "next/link";
import { useParams, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { Badge, Button, Card } from "@/components/ui";
import { useSurveyStream } from "@/hooks/use-survey-stream";
import { formatKoreanDateTime } from "@/lib/survey-status";

type Participant = {
  id: string;
  authValue: string;
  studentId?: string | null;
  studentName?: string | null;
  createdAt: string;
  activity: { name: string };
};

type SurveyAdmin = {
  id: string;
  title: string;
  authType: string;
  allowDuplicate: boolean;
  startTime: string;
  endTime: string;
  phase: string;
  totalStudents: number;
  codesGenerated: number;
  activities: {
    id: string;
    name: string;
    description: string;
    maxCapacity: number;
    currentCount: number;
  }[];
  participants: Participant[];
};

export default function AdminDashboardPage() {
  const { id } = useParams<{ id: string }>();
  const searchParams = useSearchParams();
  const [token, setToken] = useState("");
  const [survey, setSurvey] = useState<SurveyAdmin | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  const { activities: liveActivities, connected } = useSurveyStream(
    id,
    !!survey,
  );

  useEffect(() => {
    const fromUrl = searchParams.get("token");
    const fromStorage = sessionStorage.getItem(`admin-token-${id}`);
    setToken(fromUrl ?? fromStorage ?? "");
  }, [id, searchParams]);

  const fetchSurvey = useCallback(async () => {
    if (!token) {
      setError("관리자 토큰이 필요합니다. 생성 시 받은 링크로 접속해 주세요.");
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const res = await fetch(`/api/surveys/${id}?token=${encodeURIComponent(token)}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "불러오기 실패");
      setSurvey(data);
      sessionStorage.setItem(`admin-token-${id}`, token);
      setError("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "오류");
    } finally {
      setLoading(false);
    }
  }, [id, token]);

  useEffect(() => {
    if (token) fetchSurvey();
  }, [token, fetchSurvey]);

  useEffect(() => {
    if (!token || survey?.phase !== "active") return;
    const interval = setInterval(fetchSurvey, 5000);
    return () => clearInterval(interval);
  }, [token, survey?.phase, fetchSurvey]);

  const activityMap = new Map(
    (liveActivities.length > 0 ? liveActivities : survey?.activities ?? []).map(
      (a) => [a.id, a],
    ),
  );

  const exportExcel = () => {
    window.open(
      `/api/surveys/${id}/export?token=${encodeURIComponent(token)}`,
      "_blank",
    );
  };

  const downloadCodes = () => {
    window.open(
      `/api/surveys/${id}/codes?token=${encodeURIComponent(token)}`,
      "_blank",
    );
  };

  const copyStudentLink = () => {
    const url = `${window.location.origin}/survey/${id}`;
    navigator.clipboard.writeText(url);
    alert("학생 링크가 복사되었습니다.");
  };

  if (!token && !loading) {
    return (
      <main className="mx-auto max-w-lg px-4 py-16 text-center">
        <p className="text-red-600">{error}</p>
        <Link href="/" className="mt-4 inline-block text-indigo-600">
          홈으로
        </Link>
      </main>
    );
  }

  if (loading || !survey) {
    return (
      <main className="flex min-h-full items-center justify-center">
        <p className="text-slate-500">불러오는 중…</p>
      </main>
    );
  }

  const phaseLabel =
    survey.phase === "before"
      ? "시작 전"
      : survey.phase === "active"
        ? "진행 중"
        : "종료";

  const phaseTone =
    survey.phase === "active"
      ? "success"
      : survey.phase === "before"
        ? "warning"
        : "default";

  return (
    <main className="mx-auto max-w-4xl px-4 py-6 pb-20">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <Link href="/" className="text-sm text-indigo-600 hover:underline">
            ← 홈
          </Link>
          <h1 className="mt-2 text-2xl font-bold">{survey.title}</h1>
          <p className="mt-1 text-sm text-slate-500">
            {formatKoreanDateTime(new Date(survey.startTime))} ~{" "}
            {formatKoreanDateTime(new Date(survey.endTime))}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone={phaseTone}>{phaseLabel}</Badge>
          <Badge tone={connected ? "success" : "warning"}>
            {connected ? "실시간 연결됨" : "연결 중…"}
          </Badge>
        </div>
      </div>

      <div className="mt-6 flex flex-wrap gap-2">
        <Button variant="secondary" onClick={copyStudentLink}>
          학생 링크 복사
        </Button>
        {survey.authType === "CODE" && survey.codesGenerated > 0 && (
          <Button variant="secondary" onClick={downloadCodes}>
            코드 목록 다운로드
          </Button>
        )}
        <Button variant="secondary" onClick={exportExcel}>
          엑셀보내기
        </Button>
        <Button variant="ghost" onClick={fetchSurvey}>
          새로고침
        </Button>
      </div>

      <section className="mt-8">
        <h2 className="mb-4 text-lg font-semibold">활동별 현황</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          {survey.activities.map((a) => {
            const live = activityMap.get(a.id);
            const current = live?.currentCount ?? a.currentCount;
            const max = live?.maxCapacity ?? a.maxCapacity;
            const remaining = Math.max(0, max - current);
            const isFull = current >= max;
            const pct = Math.min(100, Math.round((current / max) * 100));

            return (
              <Card key={a.id}>
                <div className="flex items-start justify-between gap-2">
                  <h3 className="font-semibold">{a.name}</h3>
                  {isFull ? (
                    <Badge tone="danger">마감</Badge>
                  ) : (
                    <Badge tone="success">잔여 {remaining}명</Badge>
                  )}
                </div>
                {a.description && (
                  <p className="mt-1 text-sm text-slate-500">{a.description}</p>
                )}
                <p className="mt-3 text-2xl font-bold text-indigo-600">
                  {current}{" "}
                  <span className="text-base font-normal text-slate-400">
                    / {max}명
                  </span>
                </p>
                <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-100">
                  <div
                    className="h-full rounded-full bg-indigo-500 transition-all"
                    style={{ width: `${pct}%` }}
                  />
                </div>
              </Card>
            );
          })}
        </div>
      </section>

      <section className="mt-10">
        <h2 className="mb-4 text-lg font-semibold">
          참여자 명단 ({survey.participants.length}명)
        </h2>
        <Card className="overflow-x-auto p-0">
          <table className="w-full min-w-[480px] text-left text-sm">
            <thead className="border-b border-slate-100 bg-slate-50 text-slate-600">
              <tr>
                <th className="px-4 py-3 font-medium">시각</th>
                <th className="px-4 py-3 font-medium">활동</th>
                {survey.authType === "CODE" ? (
                  <>
                    <th className="px-4 py-3 font-medium">코드</th>
                    <th className="px-4 py-3 font-medium">학번</th>
                    <th className="px-4 py-3 font-medium">이름</th>
                  </>
                ) : (
                  <>
                    <th className="px-4 py-3 font-medium">학번</th>
                    <th className="px-4 py-3 font-medium">이름</th>
                  </>
                )}
              </tr>
            </thead>
            <tbody>
              {survey.participants.length === 0 ? (
                <tr>
                  <td
                    colSpan={survey.authType === "CODE" ? 5 : 4}
                    className="px-4 py-8 text-center text-slate-400"
                  >
                    아직 참여자가 없습니다.
                  </td>
                </tr>
              ) : (
                survey.participants.map((p) => (
                  <tr key={p.id} className="border-b border-slate-50">
                    <td className="px-4 py-3 whitespace-nowrap">
                      {new Date(p.createdAt).toLocaleString("ko-KR")}
                    </td>
                    <td className="px-4 py-3">{p.activity.name}</td>
                    {survey.authType === "CODE" ? (
                      <>
                        <td className="px-4 py-3 font-mono">{p.authValue}</td>
                        <td className="px-4 py-3 font-mono">{p.studentId ?? "-"}</td>
                        <td className="px-4 py-3">{p.studentName ?? "-"}</td>
                      </>
                    ) : (
                      <>
                        <td className="px-4 py-3 font-mono">
                          {p.studentId ?? p.authValue}
                        </td>
                        <td className="px-4 py-3">{p.studentName ?? "-"}</td>
                      </>
                    )}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </Card>
      </section>

      {error && (
        <p className="mt-4 text-sm text-red-600">{error}</p>
      )}
    </main>
  );
}
