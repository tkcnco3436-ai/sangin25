// 미리 채움 AI 보조: 규칙으로 못 찾은 빈칸과 기업정보 항목을 AI가 짝지음
// POST JSON { fields: PlanField[] } → { matches: { fieldId, profileKey }[] }
// 기업정보 값 자체는 보내지 않고 "항목 이름"만 보냅니다 (값 채우기는 브라우저에서).
import { NextResponse } from "next/server";
import { getProvider } from "@/lib/plan-helper/ai";
import { matchFields } from "@/lib/plan-helper/ai/tasks";
import { errorResponse, tooMany, TOO_MANY } from "@/lib/plan-helper/server/http";
import type { PlanField } from "@/lib/plan-helper/types";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(req: Request) {
  if (tooMany(req, 10)) return TOO_MANY();
  try {
    const body = (await req.json().catch(() => ({}))) as { fields?: PlanField[] };
    const fields = (body.fields ?? [])
      .filter((f) => f && typeof f.id === "string" && typeof f.label === "string")
      .slice(0, 150)
      .map((f) => ({ id: f.id, label: f.label.slice(0, 80), kind: f.kind, section: f.section?.slice(0, 60) }));
    if (!fields.length) return NextResponse.json({ matches: [] });
    const matches = await matchFields(getProvider(), fields, req.signal);
    return NextResponse.json({ matches });
  } catch (error) {
    return errorResponse(error);
  }
}
