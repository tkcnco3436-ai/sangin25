// provider 선택: AI_PROVIDER 환경변수
//   claude-code  로컬 개발 기본값 (API 키 불필요, 로그인된 claude CLI 사용)
//   anthropic    배포 기본값 (ANTHROPIC_API_KEY 필요)
// AI_PROVIDER가 없으면 개발 서버(next dev)는 claude-code, 그 밖에는 anthropic.
import { AnthropicProvider } from "./anthropic";
import { ClaudeCodeProvider } from "./claude-code";
import { AiError, type AiProvider, type ProviderName } from "./types";

export function providerName(): ProviderName {
  const raw = (process.env.AI_PROVIDER ?? "").trim().toLowerCase();
  if (raw === "claude-code" || raw === "anthropic") return raw;
  if (raw) throw new AiError(`알 수 없는 AI_PROVIDER 값이에요: ${raw} (claude-code 또는 anthropic)`, 500);
  return process.env.NODE_ENV === "development" ? "claude-code" : "anthropic";
}

export function getProvider(): AiProvider {
  return providerName() === "claude-code" ? new ClaudeCodeProvider() : new AnthropicProvider();
}

export { AiError } from "./types";
export type { AiProvider, AiImage, AiTurn } from "./types";
