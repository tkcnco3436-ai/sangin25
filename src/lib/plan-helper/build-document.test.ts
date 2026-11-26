import { describe, expect, it } from "vitest";
import type { IRBlock, IRCell } from "kordoc";
import { anchorGrid, buildPlanDocument, capturedToIrBlocks, isTemplateText, normalizeText } from "./build-document";

const c = (text: string, colSpan = 1, rowSpan = 1): IRCell => ({ text, colSpan, rowSpan });
const table = (cells: IRCell[][], pageNumber = 1): IRBlock => ({
  type: "table",
  pageNumber,
  table: { rows: cells.length, cols: cells[0].length, cells, hasHeader: cells.length > 1 },
});
const para = (text: string, pageNumber = 1, fontSize?: number): IRBlock => ({ type: "paragraph", text, pageNumber, style: fontSize ? { fontSize } : undefined });

describe("normalizeText", () => {
  it("한글 문서의 개인 영역 원문자를 ①②로 바꾼다", () => {
    expect(normalizeText("\u{F02B1} 과제 개요")).toBe("① 과제 개요");
    expect(normalizeText("\u{F02B2} 자가진단")).toBe("② 자가진단");
  });
});

describe("anchorGrid", () => {
  it("병합으로 덮인 자리를 빼고 시작 칸만 남긴다", () => {
    const g = anchorGrid([[c("과제명"), c("", 3), c(""), c("")], [c("a"), c("b"), c("c"), c("d")]], 2, 4);
    expect(g.anchors[0].map((a) => a.c)).toEqual([0, 1]);
    expect(g.anchors[0][1].cell.colSpan).toBe(3);
    expect(g.anchors[1]).toHaveLength(4);
  });
  it("세로 병합도 다음 행에서 건너뛴다", () => {
    const g = anchorGrid([[c("담당자", 1, 2), c("성명"), c("")], [c(""), c("전화"), c("")]], 2, 3);
    expect(g.anchors[1].map((a) => a.c)).toEqual([1, 2]);
  });
});

describe("buildPlanDocument", () => {
  const doc = buildPlanDocument({
    fileName: "양식.hwp",
    sourceFormat: "hwp",
    blocks: [
      table([[c("중소기업 기술개발 지원사업 연구개발계획서")]]),
      para("\u{F02B1} 과제 개요", 1, 160),
      table([[c("과제명"), c("")], [c("개발 목표"), c("")]]),
      para("\u{F02B2} 자가진단", 2, 160),
      table([[c("확인사항", 2), c(""), c("해당 있음"), c("해당 없음")], [c("1. 참여제한 중인가요?", 2), c(""), c(""), c("")]], 2),
      table([[c("1. 기술개발 목표"), c("")]], 3),
      para("* 최대 1페이지", 3),
      table([[c("")]], 3),
      para("(2) 연구원 현황(주관기관)", 3),
      table([[c("성명"), c("소속·직위")], [c(""), c("")], [c(""), c("")]], 3),
    ],
  });
  const fields = doc.fieldOrder.map((id) => doc.fields[id]);

  it("첫 1×1 글 상자를 문서 제목으로 쓴다", () => {
    expect(doc.title).toBe("중소기업 기술개발 지원사업 연구개발계획서");
  });
  it("라벨/값 표에서 짧은 글·긴 글 영역을 만든다", () => {
    expect(fields[0]).toMatchObject({ label: "과제명", kind: "short", section: "① 과제 개요" });
    expect(fields[1]).toMatchObject({ label: "개발 목표", kind: "long" });
  });
  it("해당 있음/없음 열은 체크 영역이 된다", () => {
    const checks = fields.filter((f) => f.kind === "check");
    expect(checks).toHaveLength(2);
    expect(checks[0].label).toContain("해당 있음");
  });
  it("항목 제목 띠는 새 섹션이 되고, 뒤따르는 빈 글상자는 그 제목 + 작성 안내를 받는다", () => {
    const box = fields.find((f) => f.section === "1. 기술개발 목표");
    expect(box).toMatchObject({ label: "기술개발 목표", kind: "long", guide: "최대 1페이지" });
  });
  it("머리 행이 있는 격자 표는 '표이름 · 머리글 (n행)' 셀 영역이 된다", () => {
    const cells = fields.filter((f) => f.kind === "cell");
    expect(cells.map((f) => f.label)).toEqual([
      "연구원 현황(주관기관) · 성명 (1행)",
      "연구원 현황(주관기관) · 소속·직위 (1행)",
      "연구원 현황(주관기관) · 성명 (2행)",
      "연구원 현황(주관기관) · 소속·직위 (2행)",
    ]);
  });
  it("원본 쪽이 바뀌면 쪽 나눔을 넣는다", () => {
    const breaks = doc.sections.flatMap((s) => s.blocks).filter((b) => b.type === "pageBreak");
    expect(breaks.length).toBe(2);
  });
  it("필드 id는 문서 순서대로 고정된다", () => {
    expect(doc.fieldOrder[0]).toBe("f001");
    expect(new Set(doc.fieldOrder).size).toBe(doc.fieldOrder.length);
  });
  it("라벨 칸을 표시한다", () => {
    const t = doc.sections.flatMap((s) => s.blocks).find((b) => b.type === "table" && b.variant === "grid");
    expect(t && t.type === "table" && t.rows[0][0].label).toBe(true);
  });
});

describe("양식 문구 칸", () => {
  it("'( ) 부스', '원' 같은 칸은 문구를 남긴 작성 영역이 된다", () => {
    expect(isTemplateText("(        ) 부스")).toBe(true);
    expect(isTemplateText("원")).toBe(true);
    expect(isTemplateText("독립부스")).toBe(false);
    const doc = buildPlanDocument({
      fileName: "신청서.docx",
      sourceFormat: "docx",
      blocks: [table([[c("구분"), c("신청내용"), c("신청금액")], [c("조립부스"), c("(   ) 부스"), c("원")]])],
    });
    const fs = doc.fieldOrder.map((id) => doc.fields[id]);
    expect(fs.map((f) => [f.label, f.template])).toEqual([
      ["조립부스 · 신청내용", "(   ) 부스"],
      ["조립부스 · 신청금액", "원"],
    ]);
  });
});

describe("capturedToIrBlocks", () => {
  it("시작 칸만 있는 캡처 표를 덮인 자리까지 채운 격자로 바꾼다", () => {
    const [b] = capturedToIrBlocks([
      {
        pageNumber: 1,
        blocks: [
          {
            type: "table",
            rows: [
              [{ text: "담당자", colSpan: 1, rowSpan: 2 }, { text: "성명", colSpan: 1, rowSpan: 1 }, { text: "", colSpan: 1, rowSpan: 1 }],
              [{ text: "전화", colSpan: 1, rowSpan: 1 }, { text: "", colSpan: 1, rowSpan: 1 }],
            ],
          },
        ],
      },
    ]);
    expect(b.table?.cols).toBe(3);
    expect(b.table?.cells[1][1].text).toBe("전화");
    const doc = buildPlanDocument({ blocks: [b], fileName: "x.pdf", sourceFormat: "pdf", parser: "capture" });
    expect(doc.fieldOrder.map((id) => doc.fields[id].label)).toEqual(["성명", "전화"]);
    expect(doc.parser).toBe("capture");
  });
});
