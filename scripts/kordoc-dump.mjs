// 개발용: 문서 하나를 kordoc으로 파싱해 블록 구조를 요약해 보여 줍니다.
// 사용법: node scripts/kordoc-dump.mjs <파일> [--json 출력경로]
import { parse } from "kordoc";
import { readFileSync, writeFileSync } from "node:fs";

const [, , file, flag, out] = process.argv;
if (!file) {
  console.error("사용법: node scripts/kordoc-dump.mjs <파일> [--json 출력경로]");
  process.exit(1);
}

const buf = readFileSync(file);
const result = await parse(buf, { keepTrailingEmptyCols: true, layoutTables: "keep", keepEmptyParagraphs: true });
if (!result.success) {
  console.error("파싱 실패:", result.error);
  process.exit(1);
}

const short = (s, n = 60) => (s ?? "").replace(/\s+/g, " ").slice(0, n);
function show(blocks, depth = 0) {
  for (const b of blocks) {
    const pad = "  ".repeat(depth);
    if (b.type === "table" && b.table) {
      const t = b.table;
      console.log(`${pad}[table ${t.rows}x${t.cols}]`);
      t.cells.forEach((row, r) => {
        const cells = row.map((c) => `${short(c.text, 18) || "∅"}${c.colSpan > 1 ? `<c${c.colSpan}>` : ""}${c.rowSpan > 1 ? `<r${c.rowSpan}>` : ""}`);
        console.log(`${pad}  r${r}: ${cells.join(" | ")}`);
      });
    } else {
      console.log(`${pad}[${b.type}${b.level ? b.level : ""}] ${short(b.text, 90)}`);
    }
  }
}
console.log("metadata:", JSON.stringify(result.metadata));
show(result.blocks);
if (flag === "--json" && out) {
  writeFileSync(out, JSON.stringify(result.blocks, (k, v) => (k === "imageData" ? undefined : v), 2));
  console.log("JSON 저장:", out);
}
