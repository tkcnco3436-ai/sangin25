// 개발용: kordoc의 레이아웃 보존 렌더러로 원본 페이지를 SVG/PNG로 뽑습니다 (원본 vs 계획서 뷰 비교용).
// 사용법: node scripts/kordoc-render.mjs <파일> <출력폴더> [페이지(예: 1-3)] [svg|png]
import { renderDocument } from "kordoc";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { basename, join } from "node:path";

const [, , file, outDir, pages = "1-2", format = "svg"] = process.argv;
if (!file || !outDir) {
  console.error("사용법: node scripts/kordoc-render.mjs <파일> <출력폴더> [페이지] [svg|png]");
  process.exit(1);
}
mkdirSync(outDir, { recursive: true });
const res = await renderDocument(readFileSync(file), { format, pages, maxWidthPx: 1240 });
for (const a of res.assets) {
  const name = `${basename(file)}.p${a.page ?? 0}.${format}`;
  writeFileSync(join(outDir, name), a.data);
  console.log("저장:", join(outDir, name), a.width, a.height);
}
