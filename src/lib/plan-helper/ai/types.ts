// AI 연결 추상화. 두 구현이 같은 인터페이스를 따릅니다.
//  - claude-code: 이 컴퓨터에 로그인된 Claude Code CLI(`claude -p`)를 부름. 로컬 개발·테스트 전용.
//  - anthropic : Anthropic Messages API (ANTHROPIC_API_KEY). 배포(운영) 환경용.
// 화면·API 라우트는 provider 종류를 모르고 tasks.ts의 함수만 부릅니다.

export type ProviderName = "claude-code" | "anthropic";

export type AiImage = { mediaType: "image/png" | "image/jpeg" | "image/webp"; base64: string };

export type AiTurn = { role: "user" | "assistant"; text: string };

export type JsonSchema = Record<string, unknown>;

/** 작업 성격별 사고 깊이 (Anthropic effort) */
export type Effort = "low" | "medium" | "high";

export interface AiProvider {
  readonly name: ProviderName;
  /** 대화 응답을 텍스트 조각으로 흘려보냄 (스트리밍) */
  streamChat(req: { system: string; messages: AiTurn[]; effort?: Effort; signal?: AbortSignal }): AsyncIterable<string>;
  /** 한 번 묻고 JSON Schema에 맞는 객체를 받음 (문서 구조 추출·필드 매칭·공고 요약) */
  completeJson<T>(req: {
    system: string;
    prompt: string;
    images?: AiImage[];
    schema: JsonSchema;
    effort?: Effort;
    maxTokens?: number;
    signal?: AbortSignal;
  }): Promise<T>;
}

/** 사용자에게 보여 줄 수 있는 AI 오류 (메시지는 한국어, 키·내부 정보 없음) */
export class AiError extends Error {
  constructor(
    message: string,
    readonly status: number = 502,
  ) {
    super(message);
  }
}
