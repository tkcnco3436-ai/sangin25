import { describe, expect, it } from "vitest";
import { matchProfileKey, missingRequired, prefillByRules, SAMPLE_PROFILE, EMPTY_PROFILE } from "./profile";
import { checkFile } from "./files";
import type { PlanDocument } from "./types";

describe("matchProfileKey", () => {
  it.each([
    ["기업명", "companyName"],
    ["회 사 명 · 국문", "companyName"],
    ["주관연구개발기관명", "companyName"],
    ["대표자명", "ceoName"],
    ["사업자등록번호", "bizNo"],
    ["설립일자", "foundedAt"],
    ["주   소 · 국문", "address"],
    ["사업장 소재지", "address"],
    ["E-mail", "email"],
    ["상시근로자 수", "employees"],
    ["주요 제품", "mainProducts"],
  ])("%s → %s", (label, key) => {
    expect(matchProfileKey(label)).toBe(key);
  });
  it("영문 칸·애매한 칸은 건너뛴다", () => {
    expect(matchProfileKey("회 사 명 · 영문")).toBeNull();
    expect(matchProfileKey("성명 · 국문")).toBeNull();
    expect(matchProfileKey("개발 목표")).toBeNull();
  });
});

describe("prefillByRules", () => {
  const doc = {
    fieldOrder: ["f001", "f002", "f003", "f004"],
    fields: {
      f001: { id: "f001", label: "기업명", kind: "short" },
      f002: { id: "f002", label: "개발 목표", kind: "long" },
      f003: { id: "f003", label: "연구원 현황 · 성명 (1행)", kind: "cell" },
      f004: { id: "f004", label: "대표자", kind: "short" },
    },
  } as unknown as PlanDocument;

  it("짧은 칸만 기업정보로 채우고 출처를 profile로 표시한다", () => {
    const v = prefillByRules(doc, SAMPLE_PROFILE);
    expect(v.f001).toEqual({ text: SAMPLE_PROFILE.companyName, source: "profile" });
    expect(v.f004?.text).toBe(SAMPLE_PROFILE.ceoName);
    expect(v.f002).toBeUndefined();
    expect(v.f003).toBeUndefined();
  });
});

describe("missingRequired", () => {
  it("빈 프로필은 필수 항목을 모두 돌려준다", () => {
    expect(missingRequired(EMPTY_PROFILE).length).toBe(12);
    expect(missingRequired(null).length).toBe(12);
  });
  it("예시 기업은 빠진 항목이 없다", () => {
    expect(missingRequired(SAMPLE_PROFILE)).toEqual([]);
  });
});

describe("checkFile", () => {
  it("형식·크기를 검사한다", () => {
    expect(checkFile({ name: "a.hwp", size: 1000 })).toBeNull();
    expect(checkFile({ name: "a.HWPX", size: 1000 })).toBeNull();
    expect(checkFile({ name: "a.doc", size: 1000 })).toContain(".docx");
    expect(checkFile({ name: "a.xlsx", size: 1000 })).toContain("HWP");
    expect(checkFile({ name: "a.pdf", size: 50 * 1024 * 1024 })).toContain("MB");
    expect(checkFile({ name: "a.pdf", size: 0 })).toContain("빈 파일");
  });
});
