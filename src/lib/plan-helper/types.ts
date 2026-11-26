// 지원사업 계획서 도우미의 공통 데이터 구조.
// 어떤 형식(HWP·HWPX·PDF·DOCX)으로 올라와도 먼저 이 "중간 표현(PlanDocument)"으로 바꾼 뒤,
// 화면(계획서 뷰)·미리 채움·챗봇이 모두 이 구조만 봅니다.

export type SourceFormat = "hwp" | "hwpx" | "pdf" | "docx";

/** 구조를 어떤 경로로 얻었는지. capture = 페이지 이미지를 Claude 비전으로 읽어 재구성 */
export type ParserKind = "kordoc" | "capture";

/** 작성 영역 유형: 짧은 글(한 줄), 긴 글(여러 문단), 표 셀, 체크 */
export type FieldKind = "short" | "long" | "cell" | "check";

/** 계획서 안에서 사용자가 채워야 하는 영역 하나 */
export type PlanField = {
  /** 문서 안에서 고정된 id (f001 …). 저장·복원·챗봇 맥락의 키 */
  id: string;
  /** 사람이 읽는 이름. 예: "과제명", "연구원 현황 · 성명 (1행)" */
  label: string;
  kind: FieldKind;
  /** 이 영역이 속한 큰 항목. 예: "1. 기술개발 목표" */
  section?: string;
  /** 양식 안의 작성 안내(※ …, * 최대 1페이지 등). 공고문 기준 가이드는 NoticeBrief에서 합쳐 보여 줌 */
  guide?: string;
  /** 칸에 원래 적혀 있던 양식 문구 ("( ) 부스", "원"). 값이 없을 때 이 문구를 보여 주고 그 위에 고쳐 씀 */
  template?: string;
};

export type CellAlign = "left" | "center" | "right";

export type PlanCell = {
  text: string;
  colSpan: number;
  rowSpan: number;
  /** 항목 이름 칸(옆이나 아래 빈칸의 라벨) — 원본처럼 옅은 배경으로 그림 */
  label?: boolean;
  /** 표 머리 행 칸 */
  header?: boolean;
  /** 작성 영역이면 그 필드 id */
  fieldId?: string;
  align?: CellAlign;
  bold?: boolean;
};

export type TableVariant =
  /** 문서 제목 상자 (1×1, 글 있음) */
  | "title"
  /** "1. 기술개발 목표 | (빈칸)" 처럼 항목 제목 띠 */
  | "titleBar"
  /** ※ 작성 안내 상자 */
  | "guide"
  /** 큰 빈 글상자 (1×1, 비어 있음) — 긴 글 작성 영역 */
  | "box"
  /** 일반 표 (라벨/값, 격자) */
  | "grid";

export type PlanBlock =
  | { type: "heading"; level: number; text: string; fontPt?: number }
  | { type: "paragraph"; text: string; note?: boolean; fieldId?: string; fontPt?: number; bold?: boolean; align?: CellAlign }
  | { type: "table"; variant: TableVariant; cols: number; rows: PlanCell[][]; colWidths?: number[] }
  /** 양식 안 그림 (배너·로고 등). src는 data URL — 크기 제한을 넘으면 자리표시만 */
  | { type: "image"; src?: string; alt: string }
  | { type: "pageBreak" };

export type PlanSection = { id: string; title: string; blocks: PlanBlock[] };

export type PlanDocument = {
  version: 1;
  id: string;
  title: string;
  fileName: string;
  sourceFormat: SourceFormat;
  parser: ParserKind;
  pageCount?: number;
  sections: PlanSection[];
  fields: Record<string, PlanField>;
  /** 문서에 나오는 순서 */
  fieldOrder: string[];
  /** 파싱 중 생긴 경고 (사용자에게 그대로 보여 줌) */
  warnings: string[];
};

export type ValueSource = "profile" | "ai" | "user";

export type FieldValue = {
  text: string;
  source: ValueSource;
  /** 되돌리기용 이전 값들 (최근 것이 마지막) */
  history?: { text: string; source: ValueSource }[];
};

/** 공고문을 읽고 정리한 요약. 챗봇 시스템 맥락에 들어감 */
export type NoticeBrief = {
  fileName: string;
  title: string;
  summary: string;
  /** 평가 기준·배점 등 */
  criteria: string[];
  /** 지원 대상, 신청 자격, 지원 내용, 마감 등 핵심 */
  keyPoints: string[];
  /** AI 요약 전 원문 텍스트 (앞부분만, 챗봇 맥락 보강용) */
  excerpt: string;
};

/** 회원·기업정보. 운영에서는 DB(companies 테이블)에서 읽고, 프로토타입은 브라우저에 저장한 목업을 씀 */
export type CompanyProfile = {
  companyName: string;
  ceoName: string;
  bizNo: string;
  foundedAt: string;
  bizType: string;
  industry: string;
  address: string;
  phone: string;
  email: string;
  employees: string;
  revenue: string;
  mainProducts: string;
  homepage?: string;
  corpNo?: string;
  intro?: string;
};

export type ChatRole = "user" | "assistant";

export type ChatMessage = {
  id: string;
  role: ChatRole;
  text: string;
  /** 이 메시지를 보낼 때 선택돼 있던 영역 */
  fieldId?: string;
  /** 응답 안의 <제안>…</제안> 문안 (있으면 "이 영역에 적용" 버튼) */
  suggestion?: string;
  /** 제안을 계획서에 적용했는지 */
  applied?: boolean;
  error?: boolean;
};

/** 브라우저에 저장하는 작업 묶음 */
export type Workspace = {
  version: 1;
  savedAt: string;
  notice: NoticeBrief | null;
  doc: PlanDocument | null;
  values: Record<string, FieldValue>;
  chat: ChatMessage[];
};
