// 업로드 파일 형식·크기 규칙 (브라우저와 서버가 같이 씀)
import type { SourceFormat } from "./types";

export const ACCEPT_EXT = [".hwp", ".hwpx", ".pdf", ".docx"] as const;
export const ACCEPT_ATTR = ".hwp,.hwpx,.pdf,.docx,.doc";

/** 업로드 한도(MB). 서버는 PLAN_HELPER_MAX_UPLOAD_MB, 브라우저는 NEXT_PUBLIC_PLAN_HELPER_MAX_UPLOAD_MB로 바꿀 수 있음 */
export function maxUploadMb(): number {
  const raw = process.env.PLAN_HELPER_MAX_UPLOAD_MB ?? process.env.NEXT_PUBLIC_PLAN_HELPER_MAX_UPLOAD_MB;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : 20;
}

export function detectFormat(fileName: string): SourceFormat | "doc" | null {
  const ext = fileName.toLowerCase().match(/\.([a-z0-9]+)$/)?.[1];
  if (ext === "hwp" || ext === "hwpx" || ext === "pdf" || ext === "docx") return ext;
  if (ext === "doc") return "doc";
  return null;
}

/** 올리기 전 검사. 문제가 있으면 사용자에게 보여 줄 문장을, 없으면 null */
export function checkFile(file: { name: string; size: number }): string | null {
  const fmt = detectFormat(file.name);
  if (fmt === "doc") return "예전 Word 형식(.doc)은 바로 읽을 수 없어요. Word에서 '다른 이름으로 저장 → .docx'로 바꾼 뒤 올려 주세요.";
  if (!fmt) return "HWP, HWPX, PDF, DOCX 파일만 올릴 수 있어요.";
  const limit = maxUploadMb();
  if (file.size > limit * 1024 * 1024) return `파일이 너무 커요. ${limit}MB 이하로 올려 주세요. (지금 ${(file.size / 1024 / 1024).toFixed(1)}MB)`;
  if (file.size === 0) return "빈 파일이에요. 원본 파일을 다시 확인해 주세요.";
  return null;
}
