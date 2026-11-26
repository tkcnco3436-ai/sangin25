// 계획서 양식 파일 → 계획서 중간 표현(PlanDocument)
// POST multipart/form-data { file }
import { NextResponse } from "next/server";
import { parseForm } from "@/lib/plan-helper/server/parse";
import { errorResponse, readUpload, tooMany, TOO_MANY } from "@/lib/plan-helper/server/http";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(req: Request) {
  if (tooMany(req, 20)) return TOO_MANY();
  try {
    const { buf, fileName, format } = await readUpload(req);
    const result = await parseForm(buf, fileName, format);
    return NextResponse.json(result);
  } catch (error) {
    return errorResponse(error);
  }
}
