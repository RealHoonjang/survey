"use client";

import { useParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { Badge, Button, Card, Input, Label } from "@/components/ui";
import { useSurveyStream } from "@/hooks/use-survey-stream";

type SurveyPublic = {
  id: string;
  title: string;
  authType: "CODE" | "STUDENT_ID";
  selectionMode: "EXACT" | "UNLIMITED";
  selectionCount: number;
  phase: "before" | "active" | "ended";
  activities: {
    id: string;
    name: string;
    description: string;
    maxCapacity: number;
    currentCount: number;
    remaining: number;
    isFull: boolean;
  }[];
};

type RegisteredActivity = { id: string; name: string };

type Step = "auth" | "select" | "done";

export default function StudentSurveyPage() {
  const { id } = useParams<{ id: string }>();
  const [survey, setSurvey] = useState<SurveyPublic | null>(null);
  const [step, setStep] = useState<Step>("auth");
  const [authValue, setAuthValue] = useState("");
  const [studentName, setStudentName] = useState("");
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [pendingIds, setPendingIds] = useState<string[]>([]);
  const [registeredActivities, setRegisteredActivities] = useState<
    RegisteredActivity[]
  >([]);

  const { activities: liveActivities } = useSurveyStream(
    id,
    step === "select",
  );

  const loadSurvey = useCallback(async () => {
    try {
      const res = await fetch(`/api/surveys/${id}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setSurvey(data);
    } catch {
      setError("설문을 불러올 수 없습니다.");
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    loadSurvey();
  }, [loadSurvey]);

  const mergedActivities = () => {
    if (!survey) return [];
    const map = new Map(liveActivities.map((a) => [a.id, a]));
    return survey.activities.map((a) => {
      const live = map.get(a.id);
      if (!live) return a;
      return {
        ...a,
        currentCount: live.currentCount,
        remaining: live.remaining,
        isFull: live.isFull,
      };
    });
  };

  const authPayload = () =>
    survey?.authType === "CODE"
      ? { authValue }
      : { studentId: authValue, studentName };

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    const missingCode = survey?.authType === "CODE" && !authValue.trim();
    const missingStudentInfo =
      survey?.authType === "STUDENT_ID" &&
      (!authValue.trim() || !studentName.trim());

    if (missingCode || missingStudentInfo) {
      setError(
        survey?.authType === "STUDENT_ID"
          ? "학번과 이름을 모두 입력해 주세요."
          : "인증 정보를 입력해 주세요.",
      );
      return;
    }
    if (survey?.phase === "before") {
      setError("조사가 시작되지 않았습니다.");
      return;
    }
    if (survey?.phase === "ended") {
      setError("조사가 종료되었습니다.");
      return;
    }
    setError("");
    setSubmitting(true);
    try {
      const res = await fetch(`/api/surveys/${id}/selection-status`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(authPayload()),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "인증에 실패했습니다.");

      const selected = (data.selectedActivities ?? []) as RegisteredActivity[];
      setRegisteredActivities(selected);
      setPendingIds([]);
      setStep(data.isComplete ? "done" : "select");
    } catch (err) {
      setError(err instanceof Error ? err.message : "인증 처리 중 오류가 발생했습니다.");
    } finally {
      setSubmitting(false);
    }
  };

  const registeredIds = registeredActivities.map((a) => a.id);
  const registeredCount = registeredActivities.length;

  const requiredCount =
    survey?.selectionMode === "EXACT" ? survey.selectionCount : null;

  const remainingToPick =
    requiredCount !== null ? Math.max(0, requiredCount - registeredCount) : null;

  const toggleActivity = (activityId: string) => {
    if (registeredIds.includes(activityId)) return;

    setPendingIds((prev) => {
      if (prev.includes(activityId)) {
        return prev.filter((id) => id !== activityId);
      }
      if (
        requiredCount !== null &&
        registeredCount + prev.length >= requiredCount
      ) {
        return prev;
      }
      return [...prev, activityId];
    });
    setError("");
  };

  const canSubmit = () => {
    if (pendingIds.length === 0) return false;
    if (requiredCount !== null) {
      return registeredCount + pendingIds.length === requiredCount;
    }
    return true;
  };

  const submitRegistration = async () => {
    if (!canSubmit()) return;

    setSubmitting(true);
    setError("");
    try {
      const res = await fetch(`/api/surveys/${id}/register-batch`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ activityIds: pendingIds, ...authPayload() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "신청 실패");

      const succeeded: RegisteredActivity[] = data.succeeded ?? [];
      const failed: { id: string; name: string; message: string }[] =
        data.failed ?? [];

      setRegisteredActivities((prev) => {
        const map = new Map(prev.map((a) => [a.id, a]));
        for (const item of succeeded) {
          map.set(item.id, item);
        }
        for (const item of data.selectedActivities ?? []) {
          map.set(item.id, item);
        }
        return Array.from(map.values());
      });

      setPendingIds((prev) =>
        prev.filter(
          (id) => !succeeded.some((s: RegisteredActivity) => s.id === id),
        ),
      );

      await loadSurvey();

      if (data.isComplete) {
        setRegisteredActivities(
          (data.selectedActivities as RegisteredActivity[]) ??
            registeredActivities,
        );
        setStep("done");
        return;
      }

      if (failed.length > 0) {
        const failedNames = failed.map((f) => f.name).join(", ");
        const needMore =
          requiredCount !== null
            ? Math.max(0, requiredCount - (data.selectedCount ?? 0))
            : 0;
        setError(
          needMore > 0
            ? `${failedNames}은(는) 정원이 마감되어 신청되지 않았습니다. 다른 프로그램을 ${needMore}개 더 선택한 뒤 신청해 주세요.`
            : `${failedNames}은(는) 정원이 마감되어 신청되지 않았습니다. 다른 프로그램을 선택해 주세요.`,
        );
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "오류");
      await loadSurvey();
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <main className="flex min-h-full items-center justify-center">
        <p className="text-slate-500">불러오는 중…</p>
      </main>
    );
  }

  if (!survey) {
    return (
      <main className="mx-auto max-w-lg px-4 py-16 text-center text-red-600">
        {error || "설문을 찾을 수 없습니다."}
      </main>
    );
  }

  const pendingCount = pendingIds.length;
  const displaySelectedCount = registeredCount + pendingCount;

  if (step === "done") {
    return (
      <main className="mx-auto flex min-h-full max-w-lg flex-col items-center justify-center px-4 py-16 text-center">
        <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-emerald-100 text-3xl text-emerald-600">
          ✓
        </div>
        <h1 className="text-xl font-bold">신청이 완료되었습니다</h1>
        <p className="mt-2 text-slate-600">
          선택한 프로그램 ({registeredActivities.length}개)
        </p>
        <ul className="mt-3 space-y-1 text-sm text-slate-700">
          {registeredActivities.map((a) => (
            <li key={a.id}>
              <strong>{a.name}</strong>
            </li>
          ))}
        </ul>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-lg px-4 py-8 pb-28">
      <h1 className="text-xl font-bold">{survey.title}</h1>

      {survey.phase === "before" && (
        <Card className="mt-6 border-amber-200 bg-amber-50">
          <p className="text-center font-medium text-amber-800">
            조사가 시작되지 않았습니다.
          </p>
          <p className="mt-1 text-center text-sm text-amber-700">
            교사가 안내한 시작 시간 이후에 다시 접속해 주세요.
          </p>
        </Card>
      )}

      {survey.phase === "ended" && (
        <Card className="mt-6 border-slate-200 bg-slate-100">
          <p className="text-center font-medium text-slate-700">
            조사가 종료되었습니다.
          </p>
        </Card>
      )}

      {step === "auth" && survey.phase !== "ended" && (
        <Card className="mt-6">
          <form onSubmit={handleAuth}>
            <Label>
              {survey.authType === "CODE" ? "참여 코드 입력" : "학번 입력"}
            </Label>
            <Input
              className="mt-2 font-mono uppercase"
              value={authValue}
              onChange={(e) =>
                setAuthValue(
                  survey.authType === "CODE"
                    ? e.target.value.toUpperCase()
                    : e.target.value,
                )
              }
              placeholder={
                survey.authType === "CODE" ? "예: A3K9M2" : "예: 20101"
              }
              autoComplete="off"
              disabled={survey.phase === "before"}
            />
            {survey.authType === "STUDENT_ID" && (
              <>
                <Label>이름 입력</Label>
                <Input
                  className="mt-2"
                  value={studentName}
                  onChange={(e) => setStudentName(e.target.value)}
                  placeholder="예: 훈장님"
                  autoComplete="off"
                  disabled={survey.phase === "before"}
                />
              </>
            )}
            {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
            <Button
              type="submit"
              className="mt-4 w-full"
              disabled={survey.phase === "before" || submitting}
            >
              {submitting ? "확인 중…" : "다음"}
            </Button>
          </form>
        </Card>
      )}

      {step === "select" && (
        <>
          {survey.selectionMode === "EXACT" ? (
            <p className="mt-2 text-sm text-slate-500">
              프로그램을 <strong>{requiredCount}개</strong> 선택한 뒤 맨 아래
              「신청하기」를 눌러 주세요. (
              {registeredCount > 0
                ? `신청 완료 ${registeredCount}개 · 선택 중 ${pendingCount}개`
                : `선택 ${displaySelectedCount}/${requiredCount}`}
              )
            </p>
          ) : (
            <p className="mt-2 text-sm text-slate-500">
              원하는 프로그램을 선택한 뒤 맨 아래 「신청하기」를 눌러 주세요.
              {registeredCount > 0 && ` (이미 신청 ${registeredCount}개)`}
            </p>
          )}

          {(registeredActivities.length > 0 || pendingIds.length > 0) && (
            <Card className="mt-4 border-indigo-200 bg-indigo-50">
              <p className="text-sm font-medium text-indigo-900">
                선택·신청 현황
              </p>
              <ul className="mt-2 space-y-1 text-sm text-indigo-800">
                {registeredActivities.map((a) => (
                  <li key={a.id}>✓ {a.name} (신청됨)</li>
                ))}
                {pendingIds.map((pid) => {
                  const act = survey.activities.find((a) => a.id === pid);
                  return act ? (
                    <li key={pid}>• {act.name} (선택 중)</li>
                  ) : null;
                })}
              </ul>
            </Card>
          )}

          <div className="mt-4 space-y-3">
            {mergedActivities().map((a) => {
              const isRegistered = registeredIds.includes(a.id);
              const isPending = pendingIds.includes(a.id);
              const atLimit =
                requiredCount !== null &&
                !isPending &&
                !isRegistered &&
                registeredCount + pendingIds.length >= requiredCount!;

              return (
                <Card
                  key={a.id}
                  className={
                    isPending
                      ? "border-indigo-400 ring-1 ring-indigo-200"
                      : isRegistered
                        ? "border-emerald-200 bg-emerald-50/50"
                        : a.isFull
                          ? "opacity-60"
                          : ""
                  }
                >
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <h3 className="font-semibold">{a.name}</h3>
                      {a.description && (
                        <p className="mt-1 text-sm text-slate-500">
                          {a.description}
                        </p>
                      )}
                    </div>
                    {isRegistered ? (
                      <Badge tone="success">신청됨</Badge>
                    ) : isPending ? (
                      <Badge tone="warning">선택됨</Badge>
                    ) : a.isFull ? (
                      <Badge tone="danger">마감</Badge>
                    ) : (
                      <Badge tone="success">잔여 {a.remaining}명</Badge>
                    )}
                  </div>
                  <p className="mt-2 text-xs text-slate-400">
                    {a.currentCount} / {a.maxCapacity}명 신청
                  </p>
                  <Button
                    className="mt-3 w-full"
                    disabled={isRegistered || submitting || atLimit}
                    variant={
                      isPending ? "secondary" : isRegistered ? "ghost" : "primary"
                    }
                    onClick={() => toggleActivity(a.id)}
                  >
                    {isRegistered
                      ? "신청 완료"
                      : isPending
                        ? "선택 해제"
                        : atLimit
                          ? "선택 한도 도달"
                          : "선택하기"}
                  </Button>
                </Card>
              );
            })}
          </div>

          {error && (
            <p className="mt-4 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">
              {error}
            </p>
          )}

          <div className="fixed right-0 bottom-0 left-0 border-t border-slate-200 bg-white/95 px-4 py-4 backdrop-blur">
            <div className="mx-auto max-w-lg">
              {requiredCount !== null && remainingToPick !== null && (
                <p className="mb-2 text-center text-xs text-slate-500">
                  {registeredCount > 0
                    ? `아직 ${remainingToPick}개 프로그램을 더 선택·신청해야 합니다.`
                    : `총 ${requiredCount}개를 선택한 뒤 신청해 주세요.`}
                </p>
              )}
              <Button
                className="w-full"
                disabled={!canSubmit() || submitting}
                onClick={submitRegistration}
              >
                {submitting
                  ? "신청 중…"
                  : requiredCount !== null
                    ? `신청하기 (${registeredCount + pendingCount}/${requiredCount})`
                    : `신청하기 (${pendingCount}개 선택)`}
              </Button>
            </div>
          </div>

          <button
            type="button"
            onClick={() => setStep("auth")}
            className="mt-4 text-sm text-slate-500 hover:underline"
          >
            ← 인증 다시 하기
          </button>
        </>
      )}
    </main>
  );
}
