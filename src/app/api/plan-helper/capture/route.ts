// 캡처 경로: 양식 파일 + 쪽 범위 → 페이지 이미지 → Claude 비전 → 계획서 중간 표현
// POST multipart/form-data { file, pages: "1-3" }
import { NextResponse } from "next/server";
import { getProvider } from "@/lib/plan-helper/ai";
import { captureForm, parsePageRange } from "@/lib/plan-helper/server/capture";
import { errorResponse, readUpload, tooMany, TOO_MANY } from "@/lib/plan-helper/server/http";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function POST(req: Request) {
  if (tooMany(req, 4)) return TOO_MANY();
  try {
    const { buf, fileName, format, form } = await readUpload(req);
    const pages = parsePageRange(String(form.get("pages") ?? "1-3"));
    const doc = await captureForm(getProvider(), buf, fileName, format, pages, req.signal);
    return NextResponse.json({ doc, needsCapture: false });
  } catch (error) {
    return errorResponse(error);
  }
}
