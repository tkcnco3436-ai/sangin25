// kordoc 블록(IRBlock[]) → 계획서 중간 표현(PlanDocument).
// 1) 표의 병합 칸 정리  2) 제목/안내/글상자/일반 표 구분  3) 빈칸을 작성 영역(필드)으로 등록
// 서버·브라우저·테스트 어디서나 돌아가는 순수 함수입니다.
import type { IRBlock, IRCell } from "kordoc";
import type {
  FieldKind,
  ParserKind,
  PlanBlock,
  PlanCell,
  PlanDocument,
  PlanField,
  PlanSection,
  SourceFormat,
  TableVariant,
} from "./types";

/** 한글 문서가 개인 영역 글자(U+F02B1…)로 저장한 원문자 번호를 ①②…로 바꿉니다. */
export function normalizeText(s: string): string {
  return s
    .replace(/[\u{F02B1}-\u{F02C4}]/gu, (ch) => String.fromCodePoint(0x2460 + (ch.codePointAt(0)! - 0xf02b1)))
    .replace(/\\\$/g, "$")
    .replace(/\r/g, "");
}

const clean = (s: string | undefined) => normalizeText(s ?? "").trim();
const oneLine = (s: string) => s.replace(/\s+/g, " ").trim();

// 긴 글이 들어갈 라벨 (목표·방법·계획 등)
const LONG_LABEL = /(목표|방법|내용|계획|효과|전략|구성|현황|소개|필요성|개요|역량|배경|추진|성과|활용|차별|시장|문제|해결|기대)/;
// 체크 칸 머리 (해당 있음/없음, 예/아니오, ○/×)
const CHECK_HEADER = /^(해당\s*있음|해당\s*없음|예|아니오|있음|없음|○|×|O|X|적합|부적합)$/i;
// 항목 제목 띠: "1. 기술개발 목표"
const NUMBERED_TITLE = /^\d{1,2}\.\s*\S/;
// 문단 제목: ① 과제 개요 / Ⅰ. … / 1. … (짧은 줄)
const HEADING_PARA = /^([①-⑳]|[ⅠⅡⅢⅣⅤⅥⅦⅧⅨⅩ]\.?|\d{1,2}\.)\s*\S/;
// 소제목: (1) 선행연구개발 이력 * 최대 1페이지
const SUB_HEADING = /^\(\d{1,2}\)\s*\S/;
// 작성 안내 꼬리: "* 최대 1페이지"
const GUIDE_TAIL = /\s*(\*\s*.+)$/;

/** "( ) 부스", "원", "Kw"처럼 단위·괄호만 적힌 입력 칸 */
export function isTemplateText(s: string): boolean {
  const t = s.replace(/\s+/g, "");
  return t.length <= 8 && /^(\(\))?(원|부스|kw|개소|회선|명|개|건|%|천원|만원|백만원|시간|년|월|일|년월일)$/i.test(t);
}

type Grid = { anchors: { r: number; c: number; cell: IRCell }[][]; rows: number; cols: number };

/** kordoc 표는 병합으로 덮인 자리도 빈 칸으로 채워 줍니다. 덮인 자리를 빼고 시작 칸만 남깁니다. */
export function anchorGrid(cells: IRCell[][], rows: number, cols: number): Grid {
  const covered: boolean[][] = Array.from({ length: rows }, () => Array(cols).fill(false));
  const anchors: Grid["anchors"] = [];
  for (let r = 0; r < rows; r++) {
    const rowAnchors: Grid["anchors"][number] = [];
    for (let c = 0; c < cols; c++) {
      const cell = cells[r]?.[c];
      if (!cell || covered[r][c]) continue;
      const rs = Math.max(1, Math.min(cell.rowSpan || 1, rows - r));
      const cs = Math.max(1, Math.min(cell.colSpan || 1, cols - c));
      for (let i = r; i < r + rs; i++) for (let j = c; j < c + cs; j++) covered[i][j] = true;
      rowAnchors.push({ r, c, cell: { ...cell, rowSpan: rs, colSpan: cs } });
    }
    anchors.push(rowAnchors);
  }
  return { anchors, rows, cols };
}

type BuildInput = {
  blocks: IRBlock[];
  fileName: string;
  sourceFormat: SourceFormat;
  parser?: ParserKind;
  pageCount?: number;
  title?: string;
  warnings?: string[];
  /** 그림 블록 → data URL (서버에서 크기·형식 제한을 걸어 넘겨 줌). 없으면 그림은 건너뜀 */
  imageSrc?: (b: IRBlock) => string | undefined;
};

export function buildPlanDocument(input: BuildInput): PlanDocument {
  const fields: Record<string, PlanField> = {};
  const fieldOrder: string[] = [];
  const sections: PlanSection[] = [];
  let section: PlanSection = { id: "s1", title: "", blocks: [] };
  sections.push(section);

  let lastPage: number | undefined;
  let contextLabel = ""; // 다음 글상자의 라벨 후보 (가장 가까운 소제목/제목)
  let pendingGuide: string[] = []; // 다음 작성 영역에 붙일 ※ 안내
  let docTitle = input.title ?? "";
  const labelMarks = new Set<string>(); // 라벨 칸 좌표 "행:열" (표 하나 처리하는 동안만 씀)

  const newSection = (title: string) => {
    section = { id: `s${sections.length + 1}`, title, blocks: [] };
    sections.push(section);
  };

  const addField = (label: string, kind: FieldKind, extraGuide?: string): string => {
    const id = `f${String(fieldOrder.length + 1).padStart(3, "0")}`;
    const guide = [...pendingGuide, extraGuide].filter(Boolean).join("\n") || undefined;
    fields[id] = { id, label: oneLine(label).slice(0, 80) || "작성 영역", kind, section: section.title || undefined, guide };
    fieldOrder.push(id);
    pendingGuide = [];
    return id;
  };

  for (const b of input.blocks) {
    // 원본 쪽 번호가 바뀌면 A4 쪽 나눔
    if (b.pageNumber && lastPage && b.pageNumber > lastPage) section.blocks.push({ type: "pageBreak" });
    if (b.pageNumber) lastPage = b.pageNumber;

    if (b.type === "table" && b.table) {
      handleTable(b);
      continue;
    }
    if (b.type === "image") {
      if (input.imageSrc) {
        const src = input.imageSrc(b);
        section.blocks.push({ type: "image", src, alt: src ? "양식 그림" : "[그림 — 원본 파일에서 확인]" });
      }
      continue;
    }
    if (b.type === "separator") continue;

    const text = clean(b.text);
    if (b.type === "list" && b.children?.length) {
      for (const child of b.children) {
        const t = clean(child.text);
        if (t) section.blocks.push({ type: "paragraph", text: `· ${t}` });
      }
      continue;
    }
    if (!text) continue;

    const fontPt = b.style?.fontSize ? b.style.fontSize / 10 : undefined;
    const short = text.length <= 40;

    if (b.type === "heading" || (short && HEADING_PARA.test(text) && !text.startsWith("※"))) {
      const level = b.type === "heading" ? Math.min(b.level ?? 2, 3) : 2;
      newSection(text);
      section.blocks.push({ type: "heading", level, text, fontPt });
      contextLabel = text.replace(/^[①-⑳]\s*/, "");
      continue;
    }
    if (SUB_HEADING.test(text) && text.length <= 90) {
      const m = text.match(GUIDE_TAIL);
      const title = m ? text.slice(0, m.index).trim() : text;
      section.blocks.push({ type: "heading", level: 3, text, fontPt });
      contextLabel = title.replace(/^\(\d{1,2}\)\s*/, "");
      if (m) pendingGuide.push(m[1].replace(/^\*\s*/, "").trim());
      continue;
    }
    if (text.startsWith("*") && text.length <= 60) {
      // "* 최대 1페이지" 같은 짧은 작성 안내 → 다음 영역 가이드
      pendingGuide.push(text.replace(/^\*\s*/, ""));
      section.blocks.push({ type: "paragraph", text, note: true, fontPt });
      continue;
    }
    if (text.startsWith("※")) {
      section.blocks.push({ type: "paragraph", text, note: true, fontPt, bold: b.style?.bold });
      continue;
    }
    section.blocks.push({ type: "paragraph", text, fontPt, bold: b.style?.bold });
  }

  function handleTable(b: IRBlock) {
    const t = b.table!;
    const grid = anchorGrid(t.cells, t.rows, t.cols);
    const flat = grid.anchors.flat();
    const texts = flat.map((a) => clean(a.cell.text));
    const nonEmpty = texts.filter(Boolean);

    let variant: TableVariant = "grid";
    if (grid.rows === 1 && grid.cols === 1 || flat.length === 1) {
      const only = texts[0] ?? "";
      if (!only) variant = "box";
      else if (only.startsWith("※")) variant = "guide";
      else if (!docTitle && only.length <= 60) variant = "title";
      else if (only.length <= 60 && !only.includes("\n")) variant = "title";
      else variant = "box";
    } else if (grid.rows === 1 && nonEmpty.length === 1 && NUMBERED_TITLE.test(texts[0] ?? "")) {
      variant = "titleBar";
    }

    if (variant === "title") {
      if (!docTitle) docTitle = oneLine(texts[0]);
      section.blocks.push({ type: "table", variant, cols: 1, rows: [[{ text: texts[0], colSpan: 1, rowSpan: 1, align: "center", bold: true }]] });
      return;
    }
    if (variant === "titleBar") {
      newSection(oneLine(texts[0]));
      contextLabel = oneLine(texts[0]).replace(/^\d{1,2}\.\s*/, "");
      section.blocks.push({
        type: "table",
        variant,
        cols: grid.cols,
        rows: [grid.anchors[0].map((a, i) => ({ text: i === 0 ? texts[0] : "", colSpan: a.cell.colSpan, rowSpan: 1, bold: i === 0 }))],
      });
      return;
    }
    if (variant === "guide") {
      pendingGuide.push(texts[0]);
      section.blocks.push({ type: "table", variant, cols: 1, rows: [[{ text: texts[0], colSpan: 1, rowSpan: 1 }]] });
      return;
    }
    if (variant === "box") {
      const existing = texts[0] ?? "";
      const fieldId = addField(contextLabel || section.title || "작성 영역", "long");
      section.blocks.push({ type: "table", variant, cols: 1, rows: [[{ text: existing, colSpan: 1, rowSpan: 1, fieldId }]] });
      return;
    }

    // 일반 표: 머리 행 판단 → 칸마다 라벨/필드 지정
    const firstRow = grid.anchors[0] ?? [];
    const headerRow =
      grid.rows > 1 &&
      firstRow.length > 1 &&
      firstRow.every((a) => clean(a.cell.text)) &&
      firstRow.every((a) => clean(a.cell.text).length <= 30);
    // 열 머리글 (병합 반영: 열 위치 → 머리글)
    const colHeader: string[] = Array(grid.cols).fill("");
    if (headerRow) {
      for (const a of firstRow) for (let j = a.c; j < a.c + a.cell.colSpan; j++) colHeader[j] = clean(a.cell.text);
    }
    // 체크 열: 어느 행에서든 머리글이 "해당 있음/없음" 같은 칸
    const checkCols = new Set<number>();
    for (const row of grid.anchors)
      for (const a of row) if (CHECK_HEADER.test(clean(a.cell.text))) for (let j = a.c; j < a.c + a.cell.colSpan; j++) checkCols.add(j);

    const tableTitle = contextLabel;
    const rows: PlanCell[][] = grid.anchors.map((row, ri) => {
      return row.map((a, ci) => {
        const text = clean(a.cell.text);
        const cell: PlanCell = { text, colSpan: a.cell.colSpan, rowSpan: a.cell.rowSpan };
        if (a.cell.isHeader || (headerRow && ri === 0)) cell.header = true;
        const template = text && !cell.header && isTemplateText(text);
        if (text && !template) {
          if (text.length <= 24 && !cell.header) cell.align = "center";
          if (cell.header) cell.align = "center";
          return cell;
        }
        // 빈칸(또는 "( ) 부스", "원" 같은 단위만 있는 입력 칸) → 라벨 찾기: 같은 행 왼쪽의 글 있는 칸, 없으면 열 머리글
        let rowLabel = "";
        const isCheck = checkCols.has(a.c) && ri > 0;
        for (let k = ci - 1; k >= 0; k--) {
          const lt = clean(row[k].cell.text);
          if (lt && !isTemplateText(lt)) {
            rowLabel = lt;
            // 짧은 항목 이름 칸만 라벨 배경 (체크리스트 문항 칸은 원본처럼 흰 바탕)
            if (lt.length <= 30 && !isCheck) markLabel(row[k]);
            break;
          }
        }
        const header = colHeader[a.c] ?? "";
        let label = "";
        let kind: FieldKind = "cell";
        if (isCheck) {
          label = `${oneLine(rowLabel).slice(0, 40)} — ${colHeader[a.c] || findCheckHeader(a.c)}`;
          kind = "check";
        } else if (headerRow && header && ri > 0) {
          label = rowLabel && rowLabel.length <= 30 ? `${rowLabel} · ${header}` : `${tableTitle ? tableTitle + " · " : ""}${header} (${ri}행)`;
          kind = "cell";
        } else if (rowLabel && rowLabel.length <= 30) {
          label = rowLabel;
          kind = grid.cols <= 4 && LONG_LABEL.test(rowLabel) ? "long" : "short";
        } else {
          return cell; // 라벨을 못 찾은 빈칸은 장식 칸으로 둠
        }
        cell.fieldId = addField(label, kind);
        if (template) fields[cell.fieldId].template = text; // 칸에 원래 있던 "( ) 부스" 같은 양식 문구
        return cell;
      });
    });

    function markLabel(a: { r: number; c: number }) {
      labelMarks.add(`${a.r}:${a.c}`);
    }
    function findCheckHeader(col: number) {
      for (const row of grid.anchors) for (const x of row) if (x.c <= col && col < x.c + x.cell.colSpan && CHECK_HEADER.test(clean(x.cell.text))) return clean(x.cell.text);
      return "체크";
    }

    // 라벨 표시: rows를 만든 뒤 표시해 둔 좌표에 label 플래그
    grid.anchors.forEach((row, ri) =>
      row.forEach((a, ci) => {
        if (labelMarks.has(`${a.r}:${a.c}`)) rows[ri][ci].label = true;
      }),
    );
    labelMarks.clear();
    section.blocks.push({ type: "table", variant: "grid", cols: grid.cols, rows });
  }

  const cleaned = sections.filter((s) => s.blocks.some((b) => b.type !== "pageBreak"));
  // 맨 앞/뒤의 쪽 나눔 제거
  for (const s of cleaned) while (s.blocks.length && s.blocks[0].type === "pageBreak" && s === cleaned[0]) s.blocks.shift();

  return {
    version: 1,
    id: `doc_${Date.now().toString(36)}`,
    title: docTitle || input.fileName.replace(/\.[^.]+$/, ""),
    fileName: input.fileName,
    sourceFormat: input.sourceFormat,
    parser: input.parser ?? "kordoc",
    pageCount: input.pageCount,
    sections: cleaned.length ? cleaned : sections,
    fields,
    fieldOrder,
    warnings: input.warnings ?? [],
  };
}

/** 캡처(비전) 결과 한 블록 — ai/tasks.ts의 CAPTURE_SCHEMA와 같은 모양 */
export type CapturedBlock = {
  type: "heading" | "paragraph" | "table";
  text?: string;
  level?: number;
  fontPt?: number;
  bold?: boolean;
  rows?: { text: string; colSpan: number; rowSpan: number }[][];
};

/**
 * 캡처 결과(행마다 "시작 칸"만 나열)를 kordoc과 같은 모양(덮인 자리까지 채운 전체 격자)으로 바꿔
 * buildPlanDocument를 그대로 재사용합니다.
 */
export function capturedToIrBlocks(pages: { pageNumber: number; blocks: CapturedBlock[] }[]): IRBlock[] {
  const out: IRBlock[] = [];
  for (const { pageNumber, blocks } of pages) {
    for (const b of blocks) {
      const style = b.fontPt || b.bold ? { fontSize: b.fontPt ? Math.round(b.fontPt * 10) : undefined, bold: b.bold || undefined } : undefined;
      if (b.type === "table" && b.rows?.length) {
        const rowsIn = b.rows.filter((r) => r.length);
        const nRows = rowsIn.length;
        // 열 수: 첫 행 colSpan 합과 행별 배치 결과 중 큰 값
        const occupied: boolean[][] = Array.from({ length: nRows }, () => []);
        const placed: { r: number; c: number; cell: IRCell }[] = [];
        let nCols = 0;
        rowsIn.forEach((row, r) => {
          let c = 0;
          for (const raw of row) {
            while (occupied[r][c]) c++;
            const cs = Math.max(1, Math.floor(raw.colSpan || 1));
            const rs = Math.max(1, Math.min(Math.floor(raw.rowSpan || 1), nRows - r));
            for (let i = r; i < r + rs; i++) for (let j = c; j < c + cs; j++) occupied[i][j] = true;
            placed.push({ r, c, cell: { text: raw.text ?? "", colSpan: cs, rowSpan: rs } });
            c += cs;
            nCols = Math.max(nCols, c);
          }
        });
        const cells: IRCell[][] = Array.from({ length: nRows }, () => Array.from({ length: nCols }, () => ({ text: "", colSpan: 1, rowSpan: 1 })));
        for (const p of placed) cells[p.r][p.c] = p.cell;
        out.push({ type: "table", pageNumber, table: { rows: nRows, cols: nCols, cells, hasHeader: false } });
      } else if (b.text?.trim()) {
        out.push({ type: b.type === "heading" ? "heading" : "paragraph", level: b.type === "heading" ? b.level ?? 2 : undefined, text: b.text, pageNumber, style });
      }
    }
  }
  return out;
}

/** 문서 전체를 한 줄 목록으로 (챗봇·AI 매칭에 보낼 때) */
export function fieldListText(doc: PlanDocument): string {
  return doc.fieldOrder
    .map((id) => {
      const f = doc.fields[id];
      return `${id}\t${f.kind}\t${f.section ? f.section + " > " : ""}${f.label}`;
    })
    .join("\n");
}

export type { PlanBlock };
