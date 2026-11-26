// 서버 전용: 업로드된 파일을 kordoc으로 읽어 계획서 중간 표현 / 공고문 텍스트로 바꿉니다.
// kordoc 하나로 HWP·HWPX·PDF·DOCX를 모두 읽습니다 (형식별 파서를 따로 두지 않은 이유는 docs 참고).
import { parse, type IRBlock } from "kordoc";
import { buildPlanDocument } from "../build-document";
import type { PlanDocument, SourceFormat } from "../types";

export class ParseError extends Error {}

async function kordocParse(buf: Buffer, format: SourceFormat) {
  const result = await parse(buf, {
    keepTrailingEmptyCols: true, // 양식의 오른쪽 빈 입력란을 지우지 않음
    layoutTables: "keep", // 원본 표 구조 그대로 (테두리 없는 틀 표도 표로)
    ocr: false, // 스캔본은 OCR 대신 캡처(Claude 비전) 경로로 보냄
  });
  if (!result.success) {
    throw new ParseError(
      format === "hwp" || format === "hwpx"
        ? "한글 파일을 읽지 못했어요. 암호가 걸려 있거나 배포용 문서일 수 있어요. 한글에서 다시 저장해 올려 주세요."
        : "파일을 읽지 못했어요. 파일이 손상됐거나 암호가 걸려 있는지 확인해 주세요.",
    );
  }
  return result;
}

const IMAGE_MAX_BYTES = 400 * 1024;
const IMAGE_MAX_COUNT = 4;

/** 양식 안 그림을 data URL로 (브라우저 저장 용량을 지키려고 크기·개수 제한) */
function imageSrcFactory() {
  let used = 0;
  return (b: IRBlock): string | undefined => {
    const img = b.imageData;
    if (!img || !/^image\/(png|jpeg|gif|webp)$/.test(img.mimeType)) return undefined;
    if (img.data.byteLength > IMAGE_MAX_BYTES || used >= IMAGE_MAX_COUNT) return undefined;
    used++;
    return `data:${img.mimeType};base64,${Buffer.from(img.data).toString("base64")}`;
  };
}

export type FormParseResult = {
  doc: PlanDocument;
  /** 파서로 구조가 거의 안 나왔음 → 페이지 이미지 캡처 경로 권장 */
  needsCapture: boolean;
  reason?: string;
};

export async function parseForm(buf: Buffer, fileName: string, format: SourceFormat): Promise<FormParseResult> {
  const result = await kordocParse(buf, format);
  const warnings = (result.warnings ?? []).map((w) => (typeof w === "string" ? w : (w as { message?: string }).message ?? String(w)));
  const doc = buildPlanDocument({
    blocks: result.blocks as IRBlock[],
    fileName,
    sourceFormat: format,
    pageCount: result.metadata?.pageCount,
    title: undefined,
    warnings: [],
    imageSrc: imageSrcFactory(),
  });
  const textLength = (result.markdown ?? "").replace(/\s+/g, "").length;
  const tables = (result.blocks as IRBlock[]).filter((b) => b.type === "table").length;
  let needsCapture = false;
  let reason: string | undefined;
  if (textLength < 80) {
    needsCapture = true;
    reason = "글자를 거의 읽지 못했어요(스캔본으로 보여요).";
  } else if (format === "pdf" && (tables === 0 || doc.fieldOrder.length < 3)) {
    needsCapture = true;
    reason = "PDF에서 표 구조를 충분히 찾지 못했어요.";
  }
  if (warnings.some((w) => /NEEDS_OCR/i.test(w))) {
    needsCapture = true;
    reason = reason ?? "글자 층이 없는 쪽이 있어요(스캔본).";
  }
  if (needsCapture && reason) doc.warnings.push(reason);
  return { doc, needsCapture, reason };
}

/** 공고문: AI 요약에 넘길 Markdown 텍스트 */
export async function parseNoticeText(buf: Buffer, format: SourceFormat): Promise<string> {
  const result = await kordocParse(buf, format);
  return (result.markdown ?? "").trim();
}
