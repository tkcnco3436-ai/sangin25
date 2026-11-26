// AI provider 모의 호출 테스트 — 실제 API 키·claude CLI 없이 두 provider가 같은 인터페이스로 동작하는지 확인
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { EventEmitter } from "node:events";
import { Readable } from "node:stream";

const h = vi.hoisted(() => ({ streamMock: vi.fn(), spawnMock: vi.fn() }));

vi.mock("@anthropic-ai/sdk", () => {
  class APIError extends Error {
    status = 500;
  }
  class RateLimitError extends APIError {}
  class AuthenticationError extends APIError {}
  class Anthropic {
    static APIError = APIError;
    static RateLimitError = RateLimitError;
    static AuthenticationError = AuthenticationError;
    beta = { messages: { stream: (...a: unknown[]) => h.streamMock(...a) } };
  }
  return { default: Anthropic };
});
vi.mock("node:child_process", () => ({ spawn: (...a: unknown[]) => h.spawnMock(...a) }));

import { AnthropicProvider } from "./anthropic";
import { ClaudeCodeProvider } from "./claude-code";
import { providerName, getProvider } from "./index";
import { AiError } from "./types";

function fakeStream(events: unknown[], final: unknown) {
  return {
    async *[Symbol.asyncIterator]() {
      for (const e of events) yield e;
    },
    finalMessage: async () => final,
  };
}

function fakeChild(lines: object[]) {
  const child = new EventEmitter() as EventEmitter & Record<string, unknown>;
  child.stdout = Readable.from(lines.map((l) => JSON.stringify(l) + "\n"));
  child.stderr = new EventEmitter();
  const written: string[] = [];
  child.stdin = { write: (s: string) => written.push(s), end: () => {} };
  child.kill = vi.fn();
  child.exitCode = 0;
  return { child, written };
}

const env = { ...process.env };
beforeEach(() => {
  h.streamMock.mockReset();
  h.spawnMock.mockReset();
});
afterEach(() => {
  process.env = { ...env };
});

describe("providerName", () => {
  it("AI_PROVIDER 값을 따른다", () => {
    process.env.AI_PROVIDER = "anthropic";
    expect(providerName()).toBe("anthropic");
    process.env.AI_PROVIDER = "claude-code";
    expect(providerName()).toBe("claude-code");
  });
  it("값이 없으면 개발 서버는 claude-code, 그 밖은 anthropic", () => {
    delete process.env.AI_PROVIDER;
    vi.stubEnv("NODE_ENV", "development");
    expect(providerName()).toBe("claude-code");
    vi.stubEnv("NODE_ENV", "production");
    expect(providerName()).toBe("anthropic");
    vi.unstubAllEnvs();
  });
  it("잘못된 값은 오류", () => {
    process.env.AI_PROVIDER = "openai";
    expect(() => providerName()).toThrow(AiError);
  });
});

describe("AnthropicProvider (모의 호출)", () => {
  it("키가 없으면 503 AiError", () => {
    delete process.env.ANTHROPIC_API_KEY;
    expect(() => new AnthropicProvider()).toThrow(AiError);
  });

  it("스트리밍 텍스트를 흘려보내고, 모델·fallbacks·시스템 캐시를 설정한다", async () => {
    process.env.ANTHROPIC_API_KEY = "test-key";
    h.streamMock.mockReturnValue(
      fakeStream(
        [
          { type: "content_block_delta", delta: { type: "text_delta", text: "안녕" } },
          { type: "content_block_delta", delta: { type: "text_delta", text: "하세요" } },
        ],
        { stop_reason: "end_turn", content: [] },
      ),
    );
    const p = new AnthropicProvider();
    let out = "";
    for await (const t of p.streamChat({ system: "SYS", messages: [{ role: "user", text: "hi" }] })) out += t;
    expect(out).toBe("안녕하세요");
    const params = h.streamMock.mock.calls[0][0];
    expect(params.model).toBe("claude-opus-5-5");
    expect(params.fallbacks).toBe("default");
    expect(params.betas).toContain("server-side-fallback-2026-07-01");
    expect(params.system[0]).toMatchObject({ text: "SYS", cache_control: { type: "ephemeral" } });
    expect(params.messages).toEqual([{ role: "user", content: "hi" }]);
  });

  it("completeJson은 JSON Schema 출력 형식과 이미지 블록을 보낸다", async () => {
    process.env.ANTHROPIC_API_KEY = "test-key";
    h.streamMock.mockReturnValue(fakeStream([], { stop_reason: "end_turn", content: [{ type: "text", text: '{"ok":true}' }] }));
    const p = new AnthropicProvider();
    const res = await p.completeJson<{ ok: boolean }>({
      system: "S",
      prompt: "P",
      images: [{ mediaType: "image/jpeg", base64: "AAAA" }],
      schema: { type: "object" },
    });
    expect(res).toEqual({ ok: true });
    const params = h.streamMock.mock.calls[0][0];
    expect(params.output_config.format).toEqual({ type: "json_schema", schema: { type: "object" } });
    expect(params.messages[0].content[0]).toMatchObject({ type: "image", source: { type: "base64", media_type: "image/jpeg" } });
  });

  it("거절(refusal)은 사용자용 오류로 바꾼다", async () => {
    process.env.ANTHROPIC_API_KEY = "test-key";
    h.streamMock.mockReturnValue(fakeStream([], { stop_reason: "refusal", content: [] }));
    await expect(new AnthropicProvider().completeJson({ system: "S", prompt: "P", schema: {} })).rejects.toBeInstanceOf(AiError);
  });
});

describe("ClaudeCodeProvider (모의 CLI)", () => {
  beforeEach(() => {
    delete process.env.VERCEL;
    vi.stubEnv("NODE_ENV", "development");
  });
  afterEach(() => vi.unstubAllEnvs());

  it("stream-json 이벤트의 text_delta를 흘려보내고, 도구·설정을 끈 채 실행한다", async () => {
    const { child, written } = fakeChild([
      { type: "system", subtype: "init" },
      { type: "stream_event", event: { type: "content_block_delta", delta: { type: "text_delta", text: "초안" } } },
      { type: "stream_event", event: { type: "content_block_delta", delta: { type: "text_delta", text: "입니다" } } },
      { type: "result", subtype: "success", is_error: false, result: "초안입니다" },
    ]);
    h.spawnMock.mockReturnValue(child);
    let out = "";
    for await (const t of new ClaudeCodeProvider().streamChat({ system: "SYS", messages: [{ role: "user", text: "써 줘" }] })) out += t;
    expect(out).toBe("초안입니다");
    const [, args] = h.spawnMock.mock.calls[0];
    expect(args).toEqual(expect.arrayContaining(["-p", "--tools", "", "--strict-mcp-config", "--no-session-persistence", "--system-prompt", "SYS"]));
    expect(JSON.parse(written[0]).message.content[0]).toEqual({ type: "text", text: "써 줘" });
  });

  it("completeJson은 structured_output을 돌려준다", async () => {
    const { child } = fakeChild([{ type: "result", is_error: false, structured_output: { matches: [] } }]);
    h.spawnMock.mockReturnValue(child);
    const res = await new ClaudeCodeProvider().completeJson({ system: "S", prompt: "P", schema: { type: "object" } });
    expect(res).toEqual({ matches: [] });
    expect(h.spawnMock.mock.calls[0][1]).toContain("--json-schema");
  });

  it("Vercel·운영 환경에서는 켜지지 않는다", () => {
    process.env.VERCEL = "1";
    expect(() => new ClaudeCodeProvider()).toThrow(/로컬 개발 전용/);
  });

  it("getProvider는 설정에 맞는 구현을 돌려준다", () => {
    process.env.AI_PROVIDER = "claude-code";
    expect(getProvider().name).toBe("claude-code");
  });
});
