// 개발용: 한글 양식 하나로 형식별 시험 파일을 만듭니다 (HWPX 변환본, 글자 PDF, 스캔본 흉내 PDF).
// 사용법: node scripts/make-variants.mjs <양식.hwp> <출력폴더> <크롬실행파일> [쪽범위]
// 크롬: Chrome/Edge 또는 `npx @puppeteer/browsers install chrome-headless-shell@stable`로 받은 실행 파일
import { hwpToHwpx, renderDocument } from "kordoc";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { basename, join, resolve } from "node:path";
import { execFileSync } from "node:child_process";
import { pathToFileURL } from "node:url";

const [, , src, outDir, chrome, pages = "1-3"] = process.argv;
if (!src || !outDir || !chrome) {
  console.error("사용법: node scripts/make-variants.mjs <양식.hwp> <출력폴더> <크롬실행파일> [쪽범위]");
  process.exit(1);
}
mkdirSync(outDir, { recursive: true });
const name = basename(src).replace(/\.[^.]+$/, "");
const buf = readFileSync(src);

// 1) HWPX 변환본
const hwpx = await hwpToHwpx(buf);
writeFileSync(join(outDir, `${name}.hwpx`), Buffer.from(hwpx));
console.log("HWPX:", join(outDir, `${name}.hwpx`));

// 2) 글자가 살아 있는 PDF (kordoc 레이아웃 보존 HTML → Chromium 인쇄)
const printPdf = (htmlFile, pdfFile) =>
  execFileSync(chrome, ["--headless", "--disable-gpu", "--no-pdf-header-footer", `--print-to-pdf=${resolve(pdfFile)}`, pathToFileURL(resolve(htmlFile)).href], { stdio: "ignore" });
const layout = await renderDocument(buf, { format: "html", pages });
const layoutHtml = join(outDir, `${name}.layout.html`);
writeFileSync(layoutHtml, layout.assets[0].data);
printPdf(layoutHtml, join(outDir, `${name}.pdf`));
console.log("PDF:", join(outDir, `${name}.pdf`));

// 3) 스캔본 흉내: 쪽 PNG만 붙인 PDF (글자 층 없음)
const png = await renderDocument(buf, { format: "png", pages, maxWidthPx: 1240 });
const imgs = png.assets.map((a, i) => {
  const p = join(outDir, `${name}.scan.p${i + 1}.png`);
  writeFileSync(p, a.data);
  return pathToFileURL(resolve(p)).href;
});
const html = `<!doctype html><meta charset="utf-8"><style>@page{size:A4;margin:0}body{margin:0}img{width:210mm;height:297mm;display:block;break-after:page}</style>${imgs.map((u) => `<img src="${u}">`).join("")}`;
const htmlPath = join(outDir, `${name}.scan.html`);
writeFileSync(htmlPath, html);
printPdf(htmlPath, join(outDir, `${name}-scan.pdf`));
console.log("스캔본 PDF:", join(outDir, `${name}-scan.pdf`));
