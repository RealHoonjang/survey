import { verifyAdminToken } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function assertAdminToken(
  surveyId: string,
  token: string | null,
): Promise<boolean> {
  if (!token) return false;
  const survey = await prisma.survey.findUnique({
    where: { id: surveyId },
    select: { adminTokenHash: true },
  });
  if (!survey) return false;
  return verifyAdminToken(token, survey.adminTokenHash);
}

export function getAdminTokenFromRequest(request: Request): string | null {
  return (
    request.headers.get("x-admin-token") ??
    new URL(request.url).searchParams.get("token")
  );
}
