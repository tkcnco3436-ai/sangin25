// 서버 전용 "캡처" 경로: 파서로 구조가 안 나오는 양식(스캔 PDF 등)을 페이지 이미지로 만들어
// Claude 비전에 보내고, 돌아온 구조(JSON)를 계획서 중간 표현으로 바꿉니다.
//   PDF      → kordoc pageImages (pdfium/pdf.js 래스터)
//   HWP/HWPX → kordoc renderDocument (레이아웃 보존 렌더러)
//   DOCX     → 미지원 (Word에서 PDF로 저장해 올리도록 안내)
import { parse, renderDocument } from "kordoc";
import sharp from "sharp";
import { capturedToIrBlocks, buildPlanDocument, type CapturedBlock } from "../build-document";
import { extractStructure } from "../ai/tasks";
import type { AiImage, AiProvider } from "../ai/types";
import type { PlanDocument, SourceFormat } from "../types";
import { ParseError } from "./parse";

export const MAX_CAPTURE_PAGES = 6;

/** "1-3,5" → [1,2,3,5] (최대 MAX_CAPTURE_PAGES쪽) */
export function parsePageRange(input: string, pageCount?: number): number[] {
  const pages = new Set<number>();
  for (const part of input.split(",").map((s) => s.trim()).filter(Boolean)) {
    const m = part.match(/^(\d+)(?:\s*-\s*(\d+))?$/);
    if (!m) throw new ParseError(`쪽 번호를 이해하지 못했어요: "${part}" (예: 1-3, 5)`);
    const a = Number(m[1]);
    const b = m[2] ? Number(m[2]) : a;
    for (let p = Math.min(a, b); p <= Math.max(a, b); p++) if (p >= 1 && (!pageCount || p <= pageCount)) pages.add(p);
  }
  const list = [...pages].sort((x, y) => x - y);
  if (!list.length) throw new ParseError("캡처할 쪽이 없어요. 쪽 번호를 확인해 주세요.");
  if (list.length > MAX_CAPTURE_PAGES) throw new ParseError(`캡처는 한 번에 ${MAX_CAPTURE_PAGES}쪽까지만 할 수 있어요.`);
  return list;
}

/** Claude 비전 권장 크기(긴 변 1568px)로 줄이고 JPEG로 압축 */
async function toVisionImage(data: Uint8Array | Buffer): Promise<AiImage> {
  const jpeg = await sharp(Buffer.from(data)).flatten({ background: "#ffffff" }).resize({ width: 1568, height: 1568, fit: "inside", withoutEnlargement: true }).jpeg({ quality: 82 }).toBuffer();
  return { mediaType: "image/jpeg", base64: jpeg.toString("base64") };
}

export async function renderPages(buf: Buffer, format: SourceFormat, pages: number[]): Promise<{ page: number; image: AiImage; text?: string }[]> {
  const sel = pages.join(",");
  if (format === "docx") throw new ParseError("DOCX는 캡처 재구성을 아직 지원하지 않아요. Word에서 PDF로 저장해 올려 주세요.");
  if (format === "pdf") {
    const res = await parse(buf, { pages: sel, ocr: false, pageImages: "png" });
    if (!res.success) throw new ParseError("PDF 쪽 이미지를 만들지 못했어요.");
    const texts = new Map((res.pages ?? []).map((p) => [p.pageNumber, p.markdown]));
    return Promise.all(
      (res.pageImages ?? []).map(async (img) => ({ page: img.pageNumber, image: await toVisionImage(img.data), text: texts.get(img.pageNumber) || undefined })),
    );
  }
  const res = await renderDocument(buf, { format: "png", pages: sel, maxWidthPx: 1568 });
  return Promise.all(res.assets.map(async (a) => ({ page: a.page ?? 0, image: await toVisionImage(a.data as Buffer) })));
}

/** 동시에 n개씩만 AI에 보냄 (요금·속도 제한 보호) */
async function mapLimit<T, R>(items: T[], n: number, fn: (x: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let i = 0;
  await Promise.all(
    Array.from({ length: Math.min(n, items.length) }, async () => {
      while (i < items.length) {
        const k = i++;
        out[k] = await fn(items[k]);
      }
    }),
  );
  return out;
}

export async function captureForm(
  provider: AiProvider,
  buf: Buffer,
  fileName: string,
  format: SourceFormat,
  pages: number[],
  signal?: AbortSignal,
): Promise<PlanDocument> {
  const rendered = await renderPages(buf, format, pages);
  if (!rendered.length) throw new ParseError("고른 쪽을 이미지로 만들지 못했어요.");
  const results = await mapLimit(rendered, 3, async (r) => {
    const res = await extractStructure(provider, r.image, { pageNumber: r.page, textHint: r.text, signal });
    return { pageNumber: r.page, blocks: (res.blocks ?? []) as CapturedBlock[] };
  });
  const doc = buildPlanDocument({
    blocks: capturedToIrBlocks(results),
    fileName,
    sourceFormat: format,
    parser: "capture",
    pageCount: rendered.length,
  });
  doc.warnings.push(`캡처(Claude 비전)로 ${rendered.length}쪽을 재구성했어요. 글자·칸이 원본과 다를 수 있으니 확인해 주세요.`);
  return doc;
}
