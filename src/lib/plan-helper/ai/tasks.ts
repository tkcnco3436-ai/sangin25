// 계획서 도우미가 AI에 맡기는 일 4가지. provider(claude-code / anthropic)와 무관하게 같은 함수로 부릅니다.
//  1) streamAssistant   — 챗봇 대화 (스트리밍)
//  2) summarizeNotice   — 공고문 요약·평가 기준 추출
//  3) matchFields       — 계획서 영역 ↔ 기업정보 매칭 보조 (규칙으로 못 찾은 것만)
//  4) extractStructure  — 캡처 경로: 페이지 이미지 → 계획서 구조(JSON)
import type { AiImage, AiProvider, AiTurn } from "./types";
import type { CompanyProfile, NoticeBrief, PlanField } from "../types";
import { PROFILE_LABELS, type ProfileKey } from "../profile";

// ───────────── 1) 챗봇 ─────────────

export type AssistantContext = {
  notice: NoticeBrief | null;
  docTitle: string;
  profile: CompanyProfile | null;
  /** 계획서 전체 영역 목록 + 현재 값 요약 */
  outline: string;
  /** 선택한 영역 */
  field: (PlanField & { value: string }) | null;
};

export function assistantSystemPrompt(ctx: AssistantContext): string {
  const parts: string[] = [];
  parts.push(`너는 한국 소상공인·중소기업의 정부 지원사업 계획서 작성을 돕는 컨설턴트다. 사용자는 사장님이다.
- 공고문의 평가 기준과 지원 목적에 맞춰, 심사위원이 빨리 읽고 높게 평가할 문장을 함께 만든다.
- 사실은 사용자가 준 정보와 기업정보에서만 가져온다. 없는 수치·실적·인증·고유명사를 지어내지 않는다. 필요한 정보가 없으면 [대괄호 자리표시]로 두고 무엇을 채워야 하는지 짧게 묻는다.
- 공문서 계획서 문체(개조식, "~함", "~임", ○ · - 기호)를 기본으로 하되 사용자가 원하면 바꾼다.
- 답은 짧고 분명하게. 군더더기 인사말·이모지·과장 표현("혁신적인", "최고의")은 쓰지 않는다.
- 선택된 영역에 넣을 문안을 제안할 때는 그 문안만 <제안> 와 </제안> 사이에 넣는다. 한 답에 <제안>은 하나만. 설명은 태그 밖에 짧게.
- 선택된 영역이 없으면 어느 영역을 고르면 좋을지 안내하거나 전체 방향을 조언한다.`);
  if (ctx.notice) {
    parts.push(`<공고문 요약 파일="${ctx.notice.fileName}">
제목: ${ctx.notice.title}
요약: ${ctx.notice.summary}
핵심 사항:
${ctx.notice.keyPoints.map((k) => `- ${k}`).join("\n")}
평가 기준:
${ctx.notice.criteria.map((k) => `- ${k}`).join("\n")}
</공고문 요약>`);
    if (ctx.notice.excerpt) parts.push(`<공고문 원문 일부>\n${ctx.notice.excerpt.slice(0, 12000)}\n</공고문 원문 일부>`);
  } else {
    parts.push("(공고문이 아직 없다. 일반적인 지원사업 평가 관점으로 돕되, 공고문을 올리면 더 정확해진다고 한 번만 알려 준다.)");
  }
  if (ctx.profile) {
    const lines = (Object.keys(ctx.profile) as ProfileKey[])
      .filter((k) => (ctx.profile?.[k] ?? "").toString().trim())
      .map((k) => `- ${PROFILE_LABELS[k] ?? k}: ${ctx.profile?.[k]}`);
    parts.push(`<기업정보>\n${lines.join("\n")}\n</기업정보>`);
  }
  parts.push(`<계획서 제목="${ctx.docTitle}">\n${ctx.outline}\n</계획서>`);
  return parts.join("\n\n");
}

export function selectedFieldNote(field: AssistantContext["field"]): string {
  if (!field) return "";
  return `<선택한_영역 id="${field.id}" 유형="${field.kind}">
항목: ${field.section ? field.section + " > " : ""}${field.label}
${field.guide ? `양식 안내: ${field.guide}\n` : ""}현재 내용: ${field.value.trim() ? field.value : "(비어 있음)"}
</선택한_영역>`;
}

export async function* streamAssistant(provider: AiProvider, ctx: AssistantContext, messages: AiTurn[], signal?: AbortSignal) {
  const system = assistantSystemPrompt(ctx);
  // 선택 영역은 마지막 사용자 메시지 앞에 붙여 매 턴 최신 내용을 보게 함 (시스템 프롬프트는 캐시되도록 고정)
  const turns = messages.map((m, i) =>
    i === messages.length - 1 && m.role === "user" && ctx.field ? { ...m, text: `${selectedFieldNote(ctx.field)}\n\n${m.text}` } : m,
  );
  yield* provider.streamChat({ system, messages: turns, effort: "medium", signal });
}

/** 응답에서 <제안>…</제안> 문안 꺼내기 */
export function extractSuggestion(text: string): string | undefined {
  const m = text.match(/<제안>\s*([\s\S]*?)\s*<\/제안>/);
  return m ? m[1].trim() : undefined;
}

// ───────────── 2) 공고문 요약 ─────────────

const NOTICE_SCHEMA = {
  type: "object",
  properties: {
    title: { type: "string" },
    summary: { type: "string" },
    keyPoints: { type: "array", items: { type: "string" } },
    criteria: { type: "array", items: { type: "string" } },
  },
  required: ["title", "summary", "keyPoints", "criteria"],
  additionalProperties: false,
};

export async function summarizeNotice(provider: AiProvider, text: string, signal?: AbortSignal) {
  return provider.completeJson<{ title: string; summary: string; keyPoints: string[]; criteria: string[] }>({
    system: "너는 정부 지원사업 공고문을 읽고 신청자가 계획서를 쓸 때 필요한 핵심만 정리하는 분석가다. 공고문에 없는 내용은 쓰지 않는다.",
    prompt: `아래 공고문을 정리해 줘.
- title: 사업명
- summary: 사업 목적과 지원 내용 3~4문장
- keyPoints: 지원 대상·신청 자격·지원 규모·신청 기간·제출 서류·제외 대상 등 핵심 8개 이내, 각 한 줄
- criteria: 서면·발표 평가 항목과 배점(있으면 "항목(배점): 보는 내용"), 가점 항목. 없으면 공고문에서 강조한 선정 기준

<공고문>
${text.slice(0, 120_000)}
</공고문>`,
    schema: NOTICE_SCHEMA,
    effort: "low",
    signal,
  });
}

// ───────────── 3) 필드 매칭 보조 ─────────────

const MATCH_SCHEMA = {
  type: "object",
  properties: {
    matches: {
      type: "array",
      items: {
        type: "object",
        properties: { fieldId: { type: "string" }, profileKey: { type: "string" } },
        required: ["fieldId", "profileKey"],
        additionalProperties: false,
      },
    },
  },
  required: ["matches"],
  additionalProperties: false,
};

export async function matchFields(provider: AiProvider, fields: PlanField[], signal?: AbortSignal) {
  const keys = Object.entries(PROFILE_LABELS)
    .map(([k, v]) => `${k}: ${v}`)
    .join("\n");
  const list = fields.map((f) => `${f.id}\t${f.section ? f.section + " > " : ""}${f.label}`).join("\n");
  const res = await provider.completeJson<{ matches: { fieldId: string; profileKey: string }[] }>({
    system: "너는 신청서 양식의 빈칸이 어떤 기업정보 항목인지 짝짓는다. 확실한 것만 짝짓고 애매하면 뺀다.",
    prompt: `기업정보 항목:\n${keys}\n\n양식 빈칸 목록(id, 항목):\n${list}\n\n기업정보 한 항목 값을 그대로 넣으면 되는 빈칸만 matches에 넣어 줘. 연구원 명단·일정표·예산표처럼 여러 줄 표의 칸은 빼.`,
    schema: MATCH_SCHEMA,
    effort: "low",
    signal,
  });
  return res.matches.filter((m) => m.profileKey in PROFILE_LABELS) as { fieldId: string; profileKey: ProfileKey }[];
}

// ───────────── 4) 캡처 경로: 페이지 이미지 → 구조 ─────────────

const CELL = {
  type: "object",
  properties: {
    text: { type: "string" },
    colSpan: { type: "integer" },
    rowSpan: { type: "integer" },
  },
  required: ["text", "colSpan", "rowSpan"],
  additionalProperties: false,
};

export const CAPTURE_SCHEMA = {
  type: "object",
  properties: {
    blocks: {
      type: "array",
      items: {
        type: "object",
        properties: {
          type: { type: "string", enum: ["heading", "paragraph", "table"] },
          text: { type: "string" },
          level: { type: "integer" },
          fontPt: { type: "number" },
          bold: { type: "boolean" },
          rows: { type: "array", items: { type: "array", items: CELL } },
        },
        required: ["type"],
        additionalProperties: false,
      },
    },
  },
  required: ["blocks"],
  additionalProperties: false,
};

export type CaptureBlock = {
  type: "heading" | "paragraph" | "table";
  text?: string;
  level?: number;
  fontPt?: number;
  bold?: boolean;
  rows?: { text: string; colSpan: number; rowSpan: number }[][];
};

export async function extractStructure(provider: AiProvider, page: AiImage, opts: { pageNumber: number; textHint?: string; signal?: AbortSignal }) {
  return provider.completeJson<{ blocks: CaptureBlock[] }>({
    system:
      "너는 한국 공공기관 신청서·계획서 양식 페이지 이미지를 보고 문서 구조를 그대로 옮기는 변환기다. 보이는 글자를 바꾸거나 요약하지 않는다.",
    prompt: `이 이미지는 계획서 양식의 ${opts.pageNumber}쪽이다. 위에서 아래 순서로 블록을 뽑아 줘.
- 제목·항목명은 heading(level 1~3), 일반 문장은 paragraph, 칸이 있는 표는 table.
- table.rows는 행마다 "시작 칸"만 나열한다(병합으로 덮인 자리는 넣지 않는다). 병합은 colSpan/rowSpan으로.
- 빈칸(작성할 곳)은 text를 ""로 둔다. 체크 칸(□)도 ""로.
- 테두리만 있는 큰 작성 상자는 1×1 table로, 글이 있으면 그 글을 넣는다.
- fontPt는 대략적인 글자 크기(pt), 굵은 글씨면 bold:true.
${opts.textHint ? `\n참고: 이 쪽에서 뽑은 원문 글자(철자 확인용):\n${opts.textHint.slice(0, 6000)}` : ""}`,
    images: [page],
    schema: CAPTURE_SCHEMA,
    effort: "medium",
    maxTokens: 32000,
    signal: opts.signal,
  });
}
