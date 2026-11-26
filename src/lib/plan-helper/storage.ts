// 프로토타입 저장소: 브라우저 localStorage.
// 운영에서는 Supabase(로그인 사용자별 companies / plan_drafts 테이블)로 바꿉니다 — docs/plan-helper 참고.
// 저장이 막힌 브라우저(사생활 보호 모드 등)에서도 화면은 동작하도록 모든 읽기·쓰기를 감쌉니다.
import type { CompanyProfile, Workspace } from "./types";

const PROFILE_KEY = "sangin25:plan-helper:profile:v1";
const SESSION_KEY = "sangin25:plan-helper:session:v1";
const WORKSPACE_KEY = "sangin25:plan-helper:workspace:v1";

function read<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}
function write(key: string, value: unknown): boolean {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

/** 개발용 목업 로그인. 운영에서는 Supabase Auth 세션 */
export type MockSession = { name: string; email: string; loggedInAt: string };
export const loadSession = () => read<MockSession>(SESSION_KEY);
export const saveSession = (s: MockSession | null) => write(SESSION_KEY, s);

export const loadProfile = () => read<CompanyProfile>(PROFILE_KEY);
export const saveProfile = (p: CompanyProfile) => write(PROFILE_KEY, p);

export const loadWorkspace = () => {
  const w = read<Workspace>(WORKSPACE_KEY);
  return w && w.version === 1 ? w : null;
};
export const saveWorkspace = (w: Workspace | null) => write(WORKSPACE_KEY, w);
