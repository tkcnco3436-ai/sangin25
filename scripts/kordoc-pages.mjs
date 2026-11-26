// 개발용: PDF 페이지를 이미지로 뽑습니다 (캡처 경로 점검용).
// 사용법: node scripts/kordoc-pages.mjs <pdf> <출력폴더> [페이지(예: 1-3)]
import { parse } from "kordoc";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";

const [, , file, outDir, pages = "1-2"] = process.argv;
if (!file || !outDir) {
  console.error("사용법: node scripts/kordoc-pages.mjs <pdf> <출력폴더> [페이지]");
  process.exit(1);
}
mkdirSync(outDir, { recursive: true });
const res = await parse(readFileSync(file), { pages, ocr: false, pageImages: "png" });
if (!res.success) {
  console.error(res.error);
  process.exit(1);
}
for (const img of res.pageImages ?? []) {
  const p = join(outDir, `page-${String(img.page ?? img.pageNumber).padStart(3, "0")}.png`);
  writeFileSync(p, img.data);
  console.log(p, img.width, img.height, img.data.length);
}
