import Link from "next/link";
import { Button } from "@/components/ui";

export default function HomePage() {
  return (
    <main className="mx-auto flex min-h-full max-w-lg flex-col items-center justify-center px-4 py-16 text-center">
      <div className="mb-8 rounded-2xl bg-indigo-600 p-4 text-white shadow-lg">
        <svg
          className="mx-auto h-12 w-12"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          aria-hidden
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={1.5}
            d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4"
          />
        </svg>
      </div>
      <h1 className="mb-3 text-2xl font-bold tracking-tight sm:text-3xl">
        학생 활동 선착순 조사
      </h1>
      <p className="mb-10 text-slate-600">
        교사는 활동별 정원과 인증 방식을 설정하고, 학생은 선착순으로 참여할
        활동을 신청합니다.
      </p>
      <div className="flex w-full flex-col gap-3 sm:flex-row sm:justify-center">
        <Link href="/admin/new" className="w-full sm:w-auto">
          <Button className="w-full">교사: 새 조사 만들기</Button>
        </Link>
      </div>
      <p className="mt-8 text-sm text-slate-500">
        학생은 교사가 안내한 조사 링크로 접속합니다.
      </p>
      <p className="mt-6 text-xs tracking-widest text-slate-400 uppercase">
        MADE BY 훈장님
      </p>
    </main>
  );
}
