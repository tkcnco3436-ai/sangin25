// API 라우트 공통: 오류 응답, 업로드 파일 꺼내기, 간단한 요청 제한
import { NextResponse } from "next/server";
import { AiError } from "../ai/types";
import { checkFile, detectFormat } from "../files";
import type { SourceFormat } from "../types";
import { ParseError } from "./parse";

export function errorResponse(error: unknown) {
  if (error instanceof AiError) return NextResponse.json({ error: error.message }, { status: error.status });
  if (error instanceof ParseError) return NextResponse.json({ error: error.message }, { status: 422 });
  console.error("[plan-helper]", error);
  return NextResponse.json({ error: "처리 중 문제가 생겼어요. 잠시 뒤 다시 시도해 주세요." }, { status: 500 });
}

export async function readUpload(req: Request): Promise<{ buf: Buffer; fileName: string; format: SourceFormat; form: FormData }> {
  const form = await req.formData().catch(() => null);
  const file = form?.get("file");
  if (!form || !(file instanceof File)) throw new ParseError("파일이 없어요. 다시 올려 주세요.");
  const problem = checkFile({ name: file.name, size: file.size });
  if (problem) throw new ParseError(problem);
  const format = detectFormat(file.name) as SourceFormat;
  return { buf: Buffer.from(await file.arrayBuffer()), fileName: file.name, format, form };
}

// 서버 인스턴스별 간단한 요청 제한. 운영에서는 로그인 사용자 단위 + 저장소(예: Upstash) 기반으로 바꿉니다.
const hits = new Map<string, number[]>();
export function tooMany(req: Request, limitPerMinute: number) {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0].trim() ?? "local";
  const now = Date.now();
  const recent = (hits.get(ip) ?? []).filter((t) => now - t < 60_000);
  recent.push(now);
  hits.set(ip, recent);
  return recent.length > limitPerMinute;
}

export const TOO_MANY = () => NextResponse.json({ error: "요청이 많아요. 1분 뒤에 다시 시도해 주세요." }, { status: 429 });
