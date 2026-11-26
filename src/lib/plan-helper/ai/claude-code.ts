// 로컬 개발 전용 provider: 이 컴퓨터에 로그인된 Claude Code CLI를 헤드리스(`claude -p`)로 부릅니다.
//
// ⚠ 운영 서비스에 쓰지 마세요. 개인 구독 로그인으로 서비스 사용자 요청을 처리하는 것은 이용 약관에 맞지 않고,
//   Vercel 같은 서버에는 claude CLI도 로그인도 없습니다. 배포 환경에서는 AI_PROVIDER=anthropic을 쓰세요.
//   (VERCEL 환경이거나 NODE_ENV=production이면 이 provider는 켜지지 않습니다.)
//
// 동작: stdin으로 stream-json 메시지(텍스트·이미지 블록)를 넣고, stdout의 stream-json 이벤트에서
//       text_delta를 읽어 흘려보냅니다. 도구·MCP·설정 파일은 모두 끄고, 임시 폴더에서 실행해
//       프로젝트 CLAUDE.md 같은 맥락이 섞이지 않게 합니다.
import { spawn } from "node:child_process";
import { tmpdir } from "node:os";
import { createInterface } from "node:readline";
import { planHelperModel } from "./anthropic";
import { AiError, type AiImage, type AiProvider, type AiTurn, type Effort, type JsonSchema } from "./types";

const CLI = () => process.env.CLAUDE_CLI_PATH || "claude";
const TIMEOUT_MS = Number(process.env.CLAUDE_CLI_TIMEOUT_MS) || 240_000;

type ContentBlock =
  | { type: "text"; text: string }
  | { type: "image"; source: { type: "base64"; media_type: string; data: string } };

type CliEvent = {
  type: string;
  subtype?: string;
  event?: { type: string; delta?: { type: string; text?: string } };
  result?: string;
  structured_output?: unknown;
  is_error?: boolean;
};

export function assertLocalOnly() {
  if (process.env.VERCEL || (process.env.NODE_ENV === "production" && process.env.PLAN_HELPER_ALLOW_CLI !== "1")) {
    throw new AiError("AI_PROVIDER=claude-code는 로컬 개발 전용이에요. 배포 환경에서는 AI_PROVIDER=anthropic을 쓰세요.", 503);
  }
}

/** 대화 기록을 CLI 한 번 호출용 프롬프트 하나로 합칩니다 (세션을 저장하지 않으므로 매번 전체 기록 전달) */
function transcript(messages: AiTurn[]): string {
  if (messages.length === 1) return messages[0].text;
  const history = messages
    .slice(0, -1)
    .map((m) => `<${m.role === "user" ? "사용자" : "도우미"}>\n${m.text}\n</${m.role === "user" ? "사용자" : "도우미"}>`)
    .join("\n");
  return `<이전_대화>\n${history}\n</이전_대화>\n\n${messages[messages.length - 1].text}`;
}

function runCli(opts: { system: string; content: ContentBlock[]; effort: Effort; schema?: JsonSchema; signal?: AbortSignal; stream: boolean }) {
  assertLocalOnly();
  const args = [
    "-p",
    "--input-format", "stream-json",
    "--output-format", "stream-json",
    "--verbose",
    "--system-prompt", opts.system,
    "--tools", "",
    "--strict-mcp-config",
    "--setting-sources", "",
    "--no-session-persistence",
    "--disable-slash-commands",
    "--model", planHelperModel(),
    "--effort", opts.effort,
  ];
  if (opts.stream) args.push("--include-partial-messages");
  if (opts.schema) args.push("--json-schema", JSON.stringify(opts.schema));

  const child = spawn(CLI(), args, { cwd: tmpdir(), stdio: ["pipe", "pipe", "pipe"], windowsHide: true });
  const timer = setTimeout(() => child.kill(), TIMEOUT_MS);
  const onAbort = () => child.kill();
  opts.signal?.addEventListener("abort", onAbort);
  let stderr = "";
  child.stderr.on("data", (d) => (stderr += d.toString()));
  const spawnError = new Promise<never>((_, reject) =>
    child.on("error", (e) =>
      reject(
        new AiError(
          (e as NodeJS.ErrnoException).code === "ENOENT"
            ? "claude CLI를 찾지 못했어요. Claude Code를 설치·로그인하거나 CLAUDE_CLI_PATH를 지정하세요."
            : `claude CLI 실행 실패: ${e.message}`,
          503,
        ),
      ),
    ),
  );
  child.stdin.write(JSON.stringify({ type: "user", message: { role: "user", content: opts.content } }) + "\n");
  child.stdin.end();

  async function* events(): AsyncGenerator<CliEvent> {
    const rl = createInterface({ input: child.stdout });
    try {
      for await (const line of rl) {
        if (!line.trim()) continue;
        try {
          yield JSON.parse(line) as CliEvent;
        } catch {
          /* 진행 로그 등 JSON이 아닌 줄은 무시 */
        }
      }
    } finally {
      clearTimeout(timer);
      opts.signal?.removeEventListener("abort", onAbort);
      if (child.exitCode === null) child.kill();
    }
  }
  return { events, spawnError, stderr: () => stderr };
}

function contentFor(prompt: string, images?: AiImage[]): ContentBlock[] {
  const blocks: ContentBlock[] = (images ?? []).map((img) => ({
    type: "image",
    source: { type: "base64", media_type: img.mediaType, data: img.base64 },
  }));
  blocks.push({ type: "text", text: prompt });
  return blocks;
}

export class ClaudeCodeProvider implements AiProvider {
  readonly name = "claude-code" as const;

  constructor() {
    assertLocalOnly();
  }

  async *streamChat({ system, messages, effort = "medium", signal }: { system: string; messages: AiTurn[]; effort?: Effort; signal?: AbortSignal }) {
    const run = runCli({ system, content: contentFor(transcript(messages)), effort, signal, stream: true });
    let streamed = false;
    const iter = run.events()[Symbol.asyncIterator]();
    while (true) {
      const next = await Promise.race([iter.next(), run.spawnError]);
      if (next.done) break;
      const ev = next.value;
      if (ev.type === "stream_event" && ev.event?.type === "content_block_delta" && ev.event.delta?.type === "text_delta" && ev.event.delta.text) {
        streamed = true;
        yield ev.event.delta.text;
      } else if (ev.type === "result") {
        if (ev.is_error) throw new AiError("로컬 Claude 응답에 실패했어요. 터미널에서 `claude` 로그인 상태를 확인하세요.", 502);
        if (!streamed && ev.result) yield ev.result;
        break;
      }
    }
    if (!streamed && run.stderr()) console.error("[plan-helper] claude CLI stderr:", run.stderr().slice(0, 500));
  }

  async completeJson<T>({
    system,
    prompt,
    images,
    schema,
    effort = "medium",
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
    const run = runCli({ system, content: contentFor(prompt, images), effort, schema, signal, stream: false });
    const iter = run.events()[Symbol.asyncIterator]();
    while (true) {
      const next = await Promise.race([iter.next(), run.spawnError]);
      if (next.done) break;
      const ev = next.value;
      if (ev.type !== "result") continue;
      if (ev.is_error) throw new AiError("로컬 Claude 응답에 실패했어요. 터미널에서 `claude` 로그인 상태를 확인하세요.", 502);
      if (ev.structured_output) return ev.structured_output as T;
      // 스키마 도구를 안 쓰고 글로 답한 경우: 본문에서 JSON만 꺼냄
      const m = (ev.result ?? "").match(/\{[\s\S]*\}/);
      if (m) {
        try {
          return JSON.parse(m[0]) as T;
        } catch {
          /* 아래 오류로 */
        }
      }
      break;
    }
    if (run.stderr()) console.error("[plan-helper] claude CLI stderr:", run.stderr().slice(0, 500));
    throw new AiError("로컬 Claude가 올바른 JSON을 돌려주지 않았어요. 다시 시도해 주세요.", 502);
  }
}
