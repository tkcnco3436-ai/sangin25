// 회원·기업정보: 필수 항목 정의, 빠진 항목 확인, 계획서 라벨과의 규칙 매칭.
import type { CompanyProfile, FieldValue, PlanDocument } from "./types";

export type ProfileKey = keyof CompanyProfile;

/** 계획서 도우미에 들어가려면 반드시 채워야 하는 기업정보 */
export const REQUIRED_FIELDS: { key: ProfileKey; label: string; placeholder: string; long?: boolean }[] = [
  { key: "companyName", label: "기업명(상호)", placeholder: "예) 동네빵집 OO베이커리" },
  { key: "ceoName", label: "대표자 이름", placeholder: "예) 홍길동" },
  { key: "bizNo", label: "사업자등록번호", placeholder: "000-00-00000" },
  { key: "foundedAt", label: "개업일(설립일)", placeholder: "YYYY-MM-DD" },
  { key: "bizType", label: "사업자 구분", placeholder: "개인 / 법인" },
  { key: "industry", label: "업종·업태", placeholder: "예) 제조업 / 제과점" },
  { key: "address", label: "사업장 주소", placeholder: "예) 부산광역시 OO구 OO로 00" },
  { key: "phone", label: "대표 연락처", placeholder: "예) 051-000-0000" },
  { key: "email", label: "이메일", placeholder: "예) owner@example.com" },
  { key: "employees", label: "상시근로자 수", placeholder: "예) 3명" },
  { key: "revenue", label: "최근 연매출", placeholder: "예) 2억 1천만원 (2025년)" },
  { key: "mainProducts", label: "주요 제품·서비스", placeholder: "예) 식빵, 수제 쿠키 선물세트", long: true },
];

export const OPTIONAL_FIELDS: { key: ProfileKey; label: string; placeholder: string; long?: boolean }[] = [
  { key: "corpNo", label: "법인등록번호", placeholder: "법인만" },
  { key: "homepage", label: "홈페이지·SNS", placeholder: "https://" },
  { key: "intro", label: "기업 한 줄 소개", placeholder: "예) 우리 동네 재료로 매일 아침 빵을 굽는 베이커리", long: true },
];

export const EMPTY_PROFILE: CompanyProfile = {
  companyName: "",
  ceoName: "",
  bizNo: "",
  foundedAt: "",
  bizType: "",
  industry: "",
  address: "",
  phone: "",
  email: "",
  employees: "",
  revenue: "",
  mainProducts: "",
  homepage: "",
  corpNo: "",
  intro: "",
};

/** 개발·시연용 가상 기업 (실존 기업 아님) */
export const SAMPLE_PROFILE: CompanyProfile = {
  companyName: "[예시] 바다온 식품",
  ceoName: "김예시",
  bizNo: "000-00-00000",
  foundedAt: "2019-04-15",
  bizType: "개인사업자",
  industry: "식료품 제조업 / 수산물 가공",
  address: "부산광역시 [예시구] [예시로] 00",
  phone: "051-000-0000",
  email: "owner@example.com",
  employees: "5명",
  revenue: "3억 2천만원 (2025년)",
  mainProducts: "어묵 간편식 세트, 수산물 반찬 정기배송",
  homepage: "https://example.com",
  corpNo: "",
  intro: "부산 수산물로 만든 어묵 간편식을 온라인과 지역 매장에 판매하는 소규모 식품 제조사",
};

export function missingRequired(p: CompanyProfile | null | undefined): { key: ProfileKey; label: string }[] {
  return REQUIRED_FIELDS.filter((f) => !(p?.[f.key] ?? "").toString().trim()).map(({ key, label }) => ({ key, label }));
}

// 계획서 라벨 → 기업정보 키 규칙 (앞쪽 규칙이 우선)
const RULES: { test: RegExp; key: ProfileKey }[] = [
  { test: /사업자\s*(등록)?\s*번호/, key: "bizNo" },
  { test: /법인\s*(등록)?\s*번호/, key: "corpNo" },
  { test: /(기업|업체|회사|법인|상호|기관)\s*(명|이름)|^상호$|주관(연구개발)?기관명|신청\s*(기업|업체)/, key: "companyName" },
  { test: /^대표\s*(자)?\s*(명|성명|이름)?$|^대표자/, key: "ceoName" },
  { test: /(설립|개업|창업)\s*(일|일자|연월일)/, key: "foundedAt" },
  { test: /(사업자|기업)\s*(구분|형태|유형)/, key: "bizType" },
  { test: /업종|업태/, key: "industry" },
  { test: /(사업장|본사|회사)?\s*(주소|소재지)/, key: "address" },
  { test: /(대표\s*)?(전화|연락처|휴대폰|핸드폰|tel)/i, key: "phone" },
  { test: /이메일|e-?mail|전자우편/i, key: "email" },
  { test: /(상시)?\s*(근로자|종업원|직원)\s*(수)?/, key: "employees" },
  { test: /매출(액)?/, key: "revenue" },
  { test: /(주요|주력)\s*(제품|상품|서비스|품목)|생산\s*품목/, key: "mainProducts" },
  { test: /홈페이지|웹사이트|sns/i, key: "homepage" },
  { test: /(기업|회사)\s*(소개|개요)/, key: "intro" },
];

/** 라벨 하나를 기업정보 키로 (못 찾으면 null). 표 머리글과 합친 "성명 · 소속" 같은 라벨은 앞부분만 봅니다. */
export function matchProfileKey(label: string): ProfileKey | null {
  // 영문 칸에 한글 기업정보를 넣지 않음
  if (/영문|english/i.test(label)) return null;
  // 양식은 "회 사 명", "주   소"처럼 글자 사이를 띄우는 경우가 많아 공백을 지우고 비교
  const head = label.split(/\s[·—]\s/)[0].replace(/\s+/g, "");
  if (!head || head.length > 30) return null;
  for (const r of RULES) if (r.test.test(head)) return r.key;
  return null;
}

/** 규칙으로 미리 채우기. 짧은 글/셀 칸만 (긴 글 영역은 AI·사용자 몫). 연구원 현황 같은 격자 칸은 건너뜁니다. */
export function prefillByRules(doc: PlanDocument, profile: CompanyProfile): Record<string, FieldValue> {
  const out: Record<string, FieldValue> = {};
  for (const id of doc.fieldOrder) {
    const f = doc.fields[id];
    if (f.kind === "check" || f.kind === "long") continue;
    if (/\(\d+행\)/.test(f.label)) continue;
    const key = matchProfileKey(f.label);
    if (!key) continue;
    const value = (profile[key] ?? "").toString().trim();
    if (value) out[id] = { text: value, source: "profile" };
  }
  return out;
}

export const PROFILE_LABELS: Record<ProfileKey, string> = Object.fromEntries(
  [...REQUIRED_FIELDS, ...OPTIONAL_FIELDS].map((f) => [f.key, f.label]),
) as Record<ProfileKey, string>;
