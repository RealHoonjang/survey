export type SurveyPhase = "before" | "active" | "ended";

export function getSurveyPhase(
  startTime: Date,
  endTime: Date,
  now = new Date(),
): SurveyPhase {
  if (now < startTime) return "before";
  if (now > endTime) return "ended";
  return "active";
}

export function formatKoreanDateTime(date: Date): string {
  return new Intl.DateTimeFormat("ko-KR", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}
