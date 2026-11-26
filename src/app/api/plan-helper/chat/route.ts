// 챗봇 대화 (스트리밍)
// POST JSON { messages, context } → 응답: NDJSON 줄 단위 이벤트
//   {"type":"text","text":"…"}  응답 조각
//   {"type":"done"}             끝
//   {"type":"error","error":"…"} 실패 (한국어 메시지)
import { NextResponse } from "next/server";
import { getProvider, AiError } from "@/lib/plan-helper/ai";
import { streamAssistant, type AssistantContext } from "@/lib/plan-helper/ai/tasks";
import { tooMany, TOO_MANY } from "@/lib/plan-helper/server/http";
import type { AiTurn } from "@/lib/plan-helper/ai/types";

export const runtime = "nodejs";
export const maxDuration = 300;

const MAX_TURNS = 30;
const MAX_CHARS = 60_000;

type Body = { messages?: AiTurn[]; context?: AssistantContext };

export async function POST(req: Request) {
  if (tooMany(req, 30)) return TOO_MANY();
  const body = (await req.json().catch(() => ({}))) as Body;
  const messages = (body.messages ?? [])
    .filter((m) => (m.role === "user" || m.role === "assistant") && typeof m.text === "string" && m.text.trim())
    .slice(-MAX_TURNS);
  if (!messages.length || messages[messages.length - 1].role !== "user") {
    return NextResponse.json({ error: "보낼 메시지가 없어요." }, { status: 400 });
  }
  if (JSON.stringify(messages).length > MAX_CHARS) {
    return NextResponse.json({ error: "대화가 너무 길어요. '대화 비우기' 후 다시 시도해 주세요." }, { status: 413 });
  }
  const context: AssistantContext = {
    notice: body.context?.notice ?? null,
    docTitle: body.context?.docTitle ?? "",
    profile: body.context?.profile ?? null,
    outline: (body.context?.outline ?? "").slice(0, 30_000),
    field: body.context?.field ?? null,
  };

  let provider;
  try {
    provider = getProvider();
  } catch (error) {
    const msg = error instanceof AiError ? error.message : "AI 설정을 확인해 주세요.";
    return NextResponse.json({ error: msg }, { status: 503 });
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (obj: unknown) => controller.enqueue(encoder.encode(JSON.stringify(obj) + "\n"));
      try {
        for await (const chunk of streamAssistant(provider, context, messages, req.signal)) send({ type: "text", text: chunk });
        send({ type: "done" });
      } catch (error) {
        send({ type: "error", error: error instanceof AiError ? error.message : "AI 응답에 실패했어요. 잠시 뒤 다시 시도해 주세요." });
        if (!(error instanceof AiError)) console.error("[plan-helper] chat", error);
      } finally {
        controller.close();
      }
    },
  });
  return new Response(stream, {
    headers: { "Content-Type": "application/x-ndjson; charset=utf-8", "Cache-Control": "no-store", "X-AI-Provider": provider.name },
  });
}
