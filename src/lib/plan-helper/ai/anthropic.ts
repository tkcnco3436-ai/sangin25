// 배포용 provider: Anthropic Messages API.
// - 키는 서버 환경변수 ANTHROPIC_API_KEY에서만 읽고, 브라우저로 절대 보내지 않습니다.
// - 모델은 PLAN_HELPER_MODEL (기본 claude-opus-5-5). 거절(refusal) 시 서버 측 대체 모델로 이어 받는 fallbacks 사용.
import Anthropic from "@anthropic-ai/sdk";
import { AiError, type AiProvider, type AiTurn, type Effort, type JsonSchema, type AiImage } from "./types";

const FALLBACK_BETA = "server-side-fallback-2026-07-01";

export function planHelperModel() {
  return process.env.PLAN_HELPER_MODEL || "claude-opus-5-5";
}

function toApiError(error: unknown): AiError {
  if (error instanceof AiError) return error;
  if (error instanceof Anthropic.RateLimitError) return new AiError("AI 사용량이 많아요. 잠시 뒤 다시 시도해 주세요.", 429);
  if (error instanceof Anthropic.AuthenticationError) {
    console.error("[plan-helper] Anthropic 인증 실패: ANTHROPIC_API_KEY 확인 필요");
    return new AiError("AI 기능 설정에 문제가 있어요. 관리자에게 문의해 주세요.", 503);
  }
  if (error instanceof Anthropic.APIError) {
    console.error(`[plan-helper] Anthropic API 오류 ${error.status}:`, error.message);
    return new AiError("AI 응답에 실패했어요. 잠시 뒤 다시 시도해 주세요.", 502);
  }
  if (error instanceof Error && error.name === "AbortError") return new AiError("요청이 취소됐어요.", 499);
  console.error("[plan-helper] 알 수 없는 AI 오류", error);
  return new AiError("AI 응답에 실패했어요. 잠시 뒤 다시 시도해 주세요.", 502);
}

type Content = Anthropic.Beta.BetaContentBlockParam[];

function userContent(prompt: string, images?: AiImage[]): Content {
  const blocks: Content = [];
  for (const img of images ?? []) {
    blocks.push({ type: "image", source: { type: "base64", media_type: img.mediaType, data: img.base64 } });
  }
  blocks.push({ type: "text", text: prompt });
  return blocks;
}

export class AnthropicProvider implements AiProvider {
  readonly name = "anthropic" as const;
  private client: Anthropic;

  constructor() {
    if (!process.env.ANTHROPIC_API_KEY) {
      throw new AiError("AI 기능이 아직 설정되지 않았어요. (ANTHROPIC_API_KEY 없음)", 503);
    }
    // 타임아웃: 긴 문서 구조 추출도 버티도록 3분, 재시도 2회 (SDK 기본)
    this.client = new Anthropic({ timeout: 180_000 });
  }

  async *streamChat({ system, messages, effort = "medium", signal }: { system: string; messages: AiTurn[]; effort?: Effort; signal?: AbortSignal }) {
    try {
      const stream = this.client.beta.messages.stream(
        {
          model: planHelperModel(),
          max_tokens: 16000,
          betas: [FALLBACK_BETA],
          fallbacks: "default",
          output_config: { effort },
          // 시스템 맥락(공고 요약·계획서 목록)은 대화 내내 같으므로 캐시
          system: [{ type: "text", text: system, cache_control: { type: "ephemeral" } }],
          messages: messages.map((m) => ({ role: m.role, content: m.text })),
        },
        { signal },
      );
      for await (const event of stream) {
        if (event.type === "content_block_delta" && event.delta.type === "text_delta") yield event.delta.text;
      }
      const final = await stream.finalMessage();
      if (final.stop_reason === "refusal") {
        yield "\n\n(이 요청에는 AI가 답하지 못했어요. 질문을 조금 바꿔 다시 시도해 주세요.)";
      }
    } catch (error) {
      throw toApiError(error);
    }
  }

  async completeJson<T>({
    system,
    prompt,
    images,
    schema,
    effort = "medium",
    maxTokens = 32000,
    signal,
  }: {
    system: string;
    prompt: string;
    images?: AiImage[];
    schema: JsonSchema;
    effort?: Effort;
    maxTokens?: number;
    signal?: AbortSignal;
  }): Promise<T> {
    try {
      // 큰 max_tokens는 HTTP 타임아웃을 피하려고 스트리밍 + finalMessage()로 받음
      const stream = this.client.beta.messages.stream(
        {
          model: planHelperModel(),
          max_tokens: maxTokens,
          betas: [FALLBACK_BETA],
          fallbacks: "default",
          output_config: { effort, format: { type: "json_schema", schema } },
          system,
          messages: [{ role: "user", content: userContent(prompt, images) }],
        },
        { signal },
      );
      const final = await stream.finalMessage();
      if (final.stop_reason === "refusal") throw new AiError("이 문서는 AI가 처리하지 못했어요.", 422);
      if (final.stop_reason === "max_tokens") throw new AiError("문서가 너무 길어 AI 응답이 잘렸어요. 쪽을 나눠 다시 시도해 주세요.", 413);
      const text = final.content.flatMap((b) => (b.type === "text" ? [b.text] : [])).join("");
      return JSON.parse(text) as T;
    } catch (error) {
      if (error instanceof SyntaxError) throw new AiError("AI 응답 형식이 올바르지 않아요. 다시 시도해 주세요.", 502);
      throw toApiError(error);
    }
  }
}
