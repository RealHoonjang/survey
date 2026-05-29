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

type Step = "auth" | "select" | "done";

export default function StudentSurveyPage() {
  const { id } = useParams<{ id: string }>();
  const [survey, setSurvey] = useState<SurveyPublic | null>(null);
  const [step, setStep] = useState<Step>("auth");
  const [authValue, setAuthValue] = useState("");
  const [studentName, setStudentName] = useState("");
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState<string | null>(null);
  const [completing, setCompleting] = useState(false);
  const [error, setError] = useState("");
  const [selectedActivityIds, setSelectedActivityIds] = useState<string[]>([]);
  const [selectedActivityNames, setSelectedActivityNames] = useState<string[]>(
    [],
  );

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

  const handleAuth = (e: React.FormEvent) => {
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
    setSelectedActivityIds([]);
    setSelectedActivityNames([]);
    setStep("select");
  };

  const register = async (activityId: string) => {
    setSubmitting(activityId);
    setError("");
    try {
      const res = await fetch(`/api/surveys/${id}/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ activityId, ...authPayload() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "신청 실패");

      setSelectedActivityIds((prev) =>
        prev.includes(activityId) ? prev : [...prev, activityId],
      );
      setSelectedActivityNames(data.selectedActivities ?? []);

      if (data.isComplete) {
        setStep("done");
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "오류");
      await loadSurvey();
    } finally {
      setSubmitting(null);
    }
  };

  const finishSelection = async () => {
    setCompleting(true);
    setError("");
    try {
      const res = await fetch(`/api/surveys/${id}/complete`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(authPayload()),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "완료 실패");
      setSelectedActivityNames(data.selectedActivities ?? selectedActivityNames);
      setStep("done");
    } catch (e) {
      setError(e instanceof Error ? e.message : "오류");
    } finally {
      setCompleting(false);
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

  const requiredCount =
    survey.selectionMode === "EXACT" ? survey.selectionCount : null;
  const selectedCount = selectedActivityNames.length;

  if (step === "done") {
    return (
      <main className="mx-auto flex min-h-full max-w-lg flex-col items-center justify-center px-4 py-16 text-center">
        <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-emerald-100 text-3xl text-emerald-600">
          ✓
        </div>
        <h1 className="text-xl font-bold">신청이 완료되었습니다</h1>
        <p className="mt-2 text-slate-600">
          선택한 프로그램 ({selectedActivityNames.length}개)
        </p>
        <ul className="mt-3 space-y-1 text-sm text-slate-700">
          {selectedActivityNames.map((name) => (
            <li key={name}>
              <strong>{name}</strong>
            </li>
          ))}
        </ul>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-lg px-4 py-8 pb-20">
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
              disabled={survey.phase === "before"}
            >
              다음
            </Button>
          </form>
        </Card>
      )}

      {step === "select" && (
        <>
          {survey.selectionMode === "EXACT" ? (
            <p className="mt-2 text-sm text-slate-500">
              프로그램을 <strong>{requiredCount}개</strong> 선택해야 합니다. (
              {selectedCount}/{requiredCount})
            </p>
          ) : (
            <p className="mt-2 text-sm text-slate-500">
              원하는 프로그램을 선택한 뒤 「선택 완료」를 눌러 주세요.
            </p>
          )}

          {selectedActivityNames.length > 0 && (
            <Card className="mt-4 border-indigo-200 bg-indigo-50">
              <p className="text-sm font-medium text-indigo-900">선택한 프로그램</p>
              <ul className="mt-2 space-y-1 text-sm text-indigo-800">
                {selectedActivityNames.map((name) => (
                  <li key={name}>• {name}</li>
                ))}
              </ul>
            </Card>
          )}

          <div className="mt-4 space-y-3">
            {mergedActivities().map((a) => {
              const alreadySelected = selectedActivityIds.includes(a.id);
              return (
                <Card
                  key={a.id}
                  className={a.isFull && !alreadySelected ? "opacity-60" : ""}
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
                    {alreadySelected ? (
                      <Badge tone="success">선택됨</Badge>
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
                    disabled={
                      alreadySelected ||
                      (a.isFull && !alreadySelected) ||
                      submitting !== null ||
                      completing
                    }
                    variant={alreadySelected ? "secondary" : "primary"}
                    onClick={() => !alreadySelected && register(a.id)}
                  >
                    {alreadySelected
                      ? "선택 완료"
                      : submitting === a.id
                        ? "신청 중…"
                        : a.isFull
                          ? "마감됨"
                          : "선택하기"}
                  </Button>
                </Card>
              );
            })}
          </div>

          {survey.selectionMode === "UNLIMITED" && (
            <Button
              className="mt-4 w-full"
              disabled={
                completing ||
                submitting !== null ||
                selectedActivityNames.length === 0
              }
              onClick={finishSelection}
            >
              {completing ? "완료 처리 중…" : "선택 완료"}
            </Button>
          )}

          {error && (
            <p className="mt-4 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">
              {error}
            </p>
          )}
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
