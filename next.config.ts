import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // 계획서 도우미의 문서 파서(kordoc·pdf.js)는 번들하지 않고 node_modules에서 그대로 불러옵니다 (동적 import·wasm 포함).
  serverExternalPackages: ["kordoc", "pdfjs-dist", "sharp"],
  // 공고 데이터(data/programs.json)를 서버에서 읽으므로 배포 결과물에 함께 포함시킵니다.
  outputFileTracingIncludes: {
    "/**": ["./data/programs.json"],
  },
};

export default nextConfig;
