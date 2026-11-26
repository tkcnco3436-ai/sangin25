// 현재 AI 연결 방식 확인 (화면 표시용). 키 값은 절대 돌려주지 않음.
import { NextResponse } from "next/server";
import { providerName } from "@/lib/plan-helper/ai";
import { planHelperModel } from "@/lib/plan-helper/ai/anthropic";
import { maxUploadMb } from "@/lib/plan-helper/files";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const provider = providerName();
    const ready = provider === "anthropic" ? !!process.env.ANTHROPIC_API_KEY : !process.env.VERCEL;
    return NextResponse.json({ provider, model: planHelperModel(), ready, maxUploadMb: maxUploadMb() });
  } catch (error) {
    return NextResponse.json({ provider: "unknown", ready: false, error: error instanceof Error ? error.message : "설정 오류" });
  }
}
