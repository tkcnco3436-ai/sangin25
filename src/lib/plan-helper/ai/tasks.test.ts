import { describe, expect, it } from "vitest";
import { assistantSystemPrompt, extractSuggestion, selectedFieldNote, streamAssistant } from "./tasks";
import { parsePageRange } from "../server/capture";
import type { AiProvider } from "./types";

describe("extractSuggestion", () => {
  it("<제안> 태그 안 문안만 꺼낸다", () => {
    expect(extractSuggestion("설명\n<제안>\n○ 목표: 매출 20% 증가\n</제안>\n끝")).toBe("○ 목표: 매출 20% 증가");
    expect(extractSuggestion("제안 없음")).toBeUndefined();
  });
});

describe("assistantSystemPrompt", () => {
  const notice = { fileName: "공고.hwp", title: "디딤돌", summary: "요약", criteria: ["기술성(40점)"], keyPoints: ["업력 7년 이하"], excerpt: "원문" };
  it("공고 요약·평가 기준·기업정보·계획서 목록을 맥락에 넣는다", () => {
    const s = assistantSystemPrompt({
      notice,
      docTitle: "연구개발계획서",
      profile: { companyName: "[예시] 회사", ceoName: "", bizNo: "", foundedAt: "", bizType: "", industry: "", address: "", phone: "", email: "", employees: "", revenue: "", mainProducts: "" },
      outline: "- [f001] 과제명: (비어 있음)",
      field: null,
    });
    expect(s).toContain("기술성(40점)");
    expect(s).toContain("업력 7년 이하");
    expect(s).toContain("기업명(상호): [예시] 회사");
    expect(s).not.toContain("대표자 이름:"); // 빈 값은 넣지 않음
    expect(s).toContain("[f001] 과제명");
  });
  it("공고문이 없으면 그 사실을 알린다", () => {
    expect(assistantSystemPrompt({ notice: null, docTitle: "", profile: null, outline: "", field: null })).toContain("공고문이 아직 없다");
  });
});

describe("streamAssistant", () => {
  it("선택 영역 정보를 마지막 사용자 메시지 앞에 붙인다", async () => {
    let seen: { system: string; messages: { role: string; text: string }[] } | null = null;
    const fake: AiProvider = {
      name: "claude-code",
      async *streamChat(req) {
        seen = req;
        yield "ok";
      },
      completeJson: async () => ({}) as never,
    };
    const field = { id: "f002", label: "개발 목표", kind: "long" as const, section: "① 과제 개요", guide: "최대 1페이지", value: "" };
    const out: string[] = [];
    for await (const t of streamAssistant(fake, { notice: null, docTitle: "계획서", profile: null, outline: "", field }, [{ role: "user", text: "초안 써 줘" }])) out.push(t);
    expect(out).toEqual(["ok"]);
    expect(seen!.messages[0].text).toContain('<선택한_영역 id="f002"');
    expect(seen!.messages[0].text).toContain("현재 내용: (비어 있음)");
    expect(seen!.messages[0].text.endsWith("초안 써 줘")).toBe(true);
    expect(selectedFieldNote(null)).toBe("");
  });
});

describe("parsePageRange", () => {
  it("쪽 범위를 풀고 한도를 지킨다", () => {
    expect(parsePageRange("1-3, 5")).toEqual([1, 2, 3, 5]);
    expect(parsePageRange("3-1")).toEqual([1, 2, 3]);
    expect(() => parsePageRange("1-20")).toThrow(/6쪽/);
    expect(() => parsePageRange("abc")).toThrow();
  });
});
