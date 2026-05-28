import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: Params) {
  const { id: surveyId } = await params;

  const survey = await prisma.survey.findUnique({ where: { id: surveyId } });
  if (!survey) {
    return new Response("Not found", { status: 404 });
  }

  const encoder = new TextEncoder();
  let closed = false;

  const stream = new ReadableStream({
    async start(controller) {
      const send = async () => {
        if (closed) return;
        const activities = await prisma.activity.findMany({
          where: { surveyId },
          orderBy: { name: "asc" },
          select: {
            id: true,
            name: true,
            maxCapacity: true,
            currentCount: true,
          },
        });

        const payload = JSON.stringify({
          activities: activities.map((a) => ({
            ...a,
            remaining: Math.max(0, a.maxCapacity - a.currentCount),
            isFull: a.currentCount >= a.maxCapacity,
          })),
          at: new Date().toISOString(),
        });

        controller.enqueue(encoder.encode(`data: ${payload}\n\n`));
      };

      await send();
      const interval = setInterval(send, 2000);

      const cleanup = () => {
        closed = true;
        clearInterval(interval);
        try {
          controller.close();
        } catch {
          /* already closed */
        }
      };

      _request.signal.addEventListener("abort", cleanup);
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
