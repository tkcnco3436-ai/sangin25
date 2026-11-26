// 공고문 파일 → 요약·평가 기준 (NoticeBrief)
// POST multipart/form-data { file }
import { NextResponse } from "next/server";
import { getProvider } from "@/lib/plan-helper/ai";
import { summarizeNotice } from "@/lib/plan-helper/ai/tasks";
import { parseNoticeText } from "@/lib/plan-helper/server/parse";
import { errorResponse, readUpload, tooMany, TOO_MANY } from "@/lib/plan-helper/server/http";
import type { NoticeBrief } from "@/lib/plan-helper/types";

export const runtime = "nodejs";
export const maxDuration = 120;

export async function POST(req: Request) {
  if (tooMany(req, 10)) return TOO_MANY();
  try {
    const { buf, fileName, format } = await readUpload(req);
    const text = await parseNoticeText(buf, format);
    if (text.replace(/\s/g, "").length < 50) {
      return NextResponse.json({ error: "공고문에서 글자를 거의 읽지 못했어요. 스캔본이면 글자가 있는 PDF나 HWP 원본을 올려 주세요." }, { status: 422 });
    }
    const ai = await summarizeNotice(getProvider(), text, req.signal);
    const brief: NoticeBrief = { fileName, ...ai, excerpt: text.slice(0, 20000) };
    return NextResponse.json({ notice: brief });
  } catch (error) {
    return errorResponse(error);
  }
}
