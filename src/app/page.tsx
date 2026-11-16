import Link from "next/link";
import { getPrograms } from "@/lib/programs";
import { getStatus, sortByDeadline } from "@/lib/status";
import { kindInfo, kindOf } from "@/lib/kinds";
import { DOCUMENTS } from "@/lib/documents";
import { LevelGate } from "@/components/onboarding/LevelGate";
import { HeroSearch } from "@/components/HeroSearch";
import { KindBadge, KindIcon } from "@/components/KindIcon";
import { BookOpen, ChevronRight, FileCheck, LayoutGrid, Monitor, Package, Sparkles, Store, GraduationCap } from "@/components/Icons";

export const revalidate = 3600;

// 무엇이 필요한지 아이콘으로 바로 고르기 (K-뉴딜 아카데미의 원형 아이콘 메뉴 참고)
const NEEDS = [
  { label: "간판", href: "/board?q=간판", Icon: Store },
  { label: "로고·브랜드", href: "/board?q=로고", Icon: Sparkles },
  { label: "포장·패키지", href: "/board?q=포장", Icon: Package },
  { label: "상세페이지", href: "/board?q=상세페이지", Icon: Monitor },
  { label: "교육·컨설팅", href: "/board?type=capacity", Icon: GraduationCap },
  { label: "전체 공고", href: "/board", Icon: LayoutGrid },
];

export default function Home() {
  const programs = sortByDeadline(getPrograms());
  const active = programs.filter((p) => ["closing", "open", "always"].includes(getStatus(p).kind));
  const count = (k: string) => active.filter((p) => kindOf(p) === k).length;
  const urgent = programs.filter((p) => ["closing", "open"].includes(getStatus(p).kind)).slice(0, 5);
  const closingSoon = active.filter((p) => getStatus(p).kind === "closing").length;

  // 사장님 입장에서 쓴 '하고 싶은 일' 카드 (국민연금공단의 "어떤 도움이 필요하세요?" 참고)
  const TASKS = [
    { href: "/board?type=grant", tone: "grant", Icon: () => <KindIcon kind="grant" size={26} />, title: "디자인 비용을 지원받고 싶어요", sub: `지원금 지원 공고 ${count("grant")}건`, tour: false },
    { href: "/board?type=capacity", tone: "capacity", Icon: () => <KindIcon kind="capacity" size={26} />, title: "전문가에게 배우고 상담받고 싶어요", sub: `역량 강화 공고 ${count("capacity")}건`, tour: false },
    { href: "/guide", tone: "start", Icon: () => <BookOpen size={26} />, title: "지원사업이 처음이라 막막해요", sub: "5단계 가이드 · 30초 자가진단", tour: true },
    { href: "/docs", tone: "plain", Icon: () => <FileCheck size={26} />, title: "신청 서류를 떼야 해요", sub: `발급처 ${DOCUMENTS.length}곳 바로가기`, tour: false },
    { href: "/portfolio", tone: "plain", Icon: () => <Sparkles size={26} />, title: "회사 소개 자료가 필요해요", sub: "사진만 올리면 A4 포트폴리오로", tour: false },
    { href: "/board?type=etc", tone: "plain", Icon: () => <KindIcon kind="etc" size={26} />, title: "판로·전시 지원도 볼래요", sub: `기타 공고 ${count("etc")}건`, tour: false },
  ];

  return (
    <>
      <LevelGate />

      {/* 1. 한 문장 소개 + 검색 (KONA BIZ의 쉬운 헤드라인 참고) */}
      <section className="home-hero">
        <div className="container">
          <p className="home-live">
            <span className="live-dot" aria-hidden />
            지금 신청할 수 있는 공고 <b>{active.length}건</b>
            {closingSoon > 0 && <> · 이번 주 마감 <b className="pink">{closingSoon}건</b></>}
          </p>
          <h1>
            사장님 가게에 필요한 <br className="br-mobile" />
            <em>지원사업</em>을 찾아드려요
          </h1>
          <p className="home-lead">간판·로고·포장 디자인 지원 공고를 한곳에 모았어요. 지역과 필요한 것만 고르세요.</p>
          <HeroSearch />
          <nav className="needs" aria-label="필요한 것 바로 고르기">
            {NEEDS.map(({ label, href, Icon }) => (
              <Link key={label} href={href} className="need">
                <span className="need-icon"><Icon size={26} /></span>
                <span>{label}</span>
              </Link>
            ))}
          </nav>
        </div>
      </section>

      {/* 2. 어떤 도움이 필요하세요? (하고 싶은 일로 고르기) */}
      <section className="section home-tasks">
        <div className="container">
          <div className="section-head">
            <h2>어떤 도움이 필요하세요?</h2>
          </div>
          <div className="tasks">
            {TASKS.map((t) => (
              <Link key={t.href} href={t.href} className={`task task-${t.tone}`} {...(t.tour ? { "data-tour": "start" } : {})}>
                <span className="task-icon"><t.Icon /></span>
                <span className="task-text">
                  <b>{t.title}</b>
                  <span>{t.sub}</span>
                </span>
                <span className="task-go" aria-hidden><ChevronRight size={20} /></span>
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* 3. 마감이 가까운 공고: D-day를 가장 크게 */}
      <section className="section" style={{ paddingTop: 0 }}>
        <div className="container">
          <div className="section-head">
            <h2>마감이 가까운 공고</h2>
            <Link href="/board" className="link-more">전체 보기 →</Link>
          </div>
          <ol className="deadline-list">
            {urgent.map((p) => {
              const s = getStatus(p);
              const k = kindOf(p);
              return (
                <li key={p.id}>
                  <Link href={`/board/${p.id}`} className="deadline-item">
                    <span className={`dday dday-${s.kind}`}>
                      {s.daysLeft === 0 ? "오늘" : <>D-<b>{s.daysLeft}</b></>}
                    </span>
                    <span className="deadline-text">
                      <span className="deadline-badges"><KindBadge kind={k} label={kindInfo(k).short} /><span className="muted">{p.region}</span></span>
                      <b>{p.title}</b>
                      <span className="muted">{p.agency}</span>
                    </span>
                    <ChevronRight size={20} />
                  </Link>
                </li>
              );
            })}
          </ol>
        </div>
      </section>

      {/* 4. 이용 순서 3단계 */}
      <section className="section" style={{ paddingTop: 0 }}>
        <div className="container">
          <div className="section-head">
            <h2>이렇게 이용하세요</h2>
          </div>
          <ol className="how">
            <li><Link href="/board"><em>1</em><b>공고 찾기</b><span>지역과 필요한 것을 골라요</span></Link></li>
            <li><Link href="/docs"><em>2</em><b>서류 준비</b><span>공고마다 필요한 서류를 떼요</span></Link></li>
            <li><Link href="/guide#step-4"><em>3</em><b>원문에서 신청</b><span>기관 사이트에서 접수해요</span></Link></li>
          </ol>
        </div>
      </section>

      <section className="section" style={{ paddingTop: 0 }}>
        <div className="container">
          <div className="cta-band">
            <div>
              <h2>신청서 쓰기가 막막하다면 <span className="hl">함께 준비해요</span></h2>
              <p>공고 선택부터 신청서 작성, 선정 후 디자인 수행까지 태경씨앤코가 도와드립니다.</p>
            </div>
            <Link href="/guide#step-4" className="btn btn-pink">신청서 작성 팁 보기 →</Link>
          </div>
        </div>
      </section>
    </>
  );
}
