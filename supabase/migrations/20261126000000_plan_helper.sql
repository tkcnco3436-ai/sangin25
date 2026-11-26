-- 계획서 도우미 운영 스키마 초안 (Supabase / Postgres)
-- ⚠ 아직 어떤 DB에도 적용하지 않았습니다. 상인25가 Supabase로 옮겨 갈 때(README "2단계") 검토 후 적용하세요.
-- 프로토타입은 이 테이블 대신 브라우저 localStorage를 씁니다 (src/lib/plan-helper/storage.ts).

-- 1) 기업정보: 회원 1명 = 기업 1곳 (여러 기업 관리가 필요하면 user_id unique를 풀고 선택 UI 추가)
create table if not exists public.companies (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references auth.users (id) on delete cascade,
  company_name text not null,
  ceo_name text not null,
  biz_no text not null,                -- 사업자등록번호 (000-00-00000)
  corp_no text,                        -- 법인등록번호 (법인만)
  founded_at date not null,            -- 개업일·설립일
  biz_type text not null,              -- 개인사업자 / 법인
  industry text not null,              -- 업종·업태
  address text not null,
  phone text not null,
  email text not null,
  employees integer,                   -- 상시근로자 수
  revenue_krw bigint,                  -- 최근 연매출 (원)
  revenue_year integer,
  main_products text not null,
  homepage text,
  intro text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- 2) 작성 중인 계획서: 중간 표현(PlanDocument) + 채운 값 + 대화기록을 JSON으로 보관
create table if not exists public.plan_drafts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  title text not null,
  notice jsonb,                        -- NoticeBrief (공고 요약·평가 기준)
  doc jsonb not null,                  -- PlanDocument (양식 구조, 필드 정의)
  field_values jsonb not null default '{}'::jsonb,  -- { fieldId: { text, source, history } }
  chat jsonb not null default '[]'::jsonb,           -- ChatMessage[]
  source_file_name text,
  source_format text check (source_format in ('hwp', 'hwpx', 'pdf', 'docx')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists plan_drafts_user_updated on public.plan_drafts (user_id, updated_at desc);

-- 3) AI 사용량 기록 (비용·한도 관리용)
create table if not exists public.ai_usage (
  id bigint generated always as identity primary key,
  user_id uuid references auth.users (id) on delete set null,
  task text not null check (task in ('chat', 'notice', 'prefill', 'capture')),
  model text not null,
  input_tokens integer,
  output_tokens integer,
  created_at timestamptz not null default now()
);
create index if not exists ai_usage_user_created on public.ai_usage (user_id, created_at desc);

-- 행 수준 보안: 본인 행만
alter table public.companies enable row level security;
alter table public.plan_drafts enable row level security;
alter table public.ai_usage enable row level security;

create policy "companies_own" on public.companies
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "plan_drafts_own" on public.plan_drafts
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "ai_usage_read_own" on public.ai_usage
  for select using (auth.uid() = user_id);
-- ai_usage 쓰기는 서버(service role)만
