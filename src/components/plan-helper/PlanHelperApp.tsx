"use client";

// 지원사업 계획서 도우미 — 화면 전체 흐름
//  1) 진입 조건: 로그인 + 기업정보 필수 항목 (프로토타입은 브라우저 목업)
//  2) 업로드: 공고문 / 계획서 양식 드래그 드롭
//  3) 작업: 왼쪽 계획서 뷰 + 오른쪽 챗봇 뷰, 자동 저장
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ChatView } from "./ChatView";
import { PlanView } from "./PlanView";
import { UploadZone } from "./UploadZone";
import { extractSuggestion } from "@/lib/plan-helper/ai/tasks";
import { matchProfileKey, missingRequired, prefillByRules } from "@/lib/plan-helper/profile";
import { loadProfile, loadSession, loadWorkspace, saveSession, saveWorkspace, type MockSession } from "@/lib/plan-helper/storage";
import type { ChatMessage, CompanyProfile, FieldValue, NoticeBrief, PlanDocument, PlanField } from "@/lib/plan-helper/types";

type Status = "idle" | "busy" | "done" | "error";
type ProviderInfo = { provider: string; model?: string; ready: boolean };

let seq = 0;
const newId = () => `m${Date.now().toString(36)}${(seq++).toString(36)}`;

async function postFile(url: string, file: File) {
  const form = new FormData();
  form.append("file", file);
  const res = await fetch(url, { method: "POST", body: form });
  const data = await res.json().catch(() => ({ error: "서버 응답을 읽지 못했어요." }));
  if (!res.ok) throw new Error(data.error ?? "처리하지 못했어요.");
  return data;
}

function outlineOf(doc: PlanDocument, values: Record<string, FieldValue>) {
  return doc.fieldOrder
    .map((id) => {
      const f = doc.fields[id];
      const v = (values[id]?.text ?? "").replace(/\s+/g, " ").trim();
      return `- [${id}] ${f.section ? f.section + " > " : ""}${f.label}: ${v ? v.slice(0, 160) : f.template ? `(양식 문구: ${f.template})` : "(비어 있음)"}`;
    })
    .join("\n");
}

export function PlanHelperApp() {
  const [hydrated, setHydrated] = useState(false);
  const [session, setSession] = useState<MockSession | null>(null);
  const [profile, setProfile] = useState<CompanyProfile | null>(null);
  const [provider, setProvider] = useState<ProviderInfo | null>(null);

  const [notice, setNotice] = useState<NoticeBrief | null>(null);
  const [noticeStatus, setNoticeStatus] = useState<Status>("idle");
  const [noticeMsg, setNoticeMsg] = useState<string>();
  const [doc, setDoc] = useState<PlanDocument | null>(null);
  const [formStatus, setFormStatus] = useState<Status>("idle");
  const [formMsg, setFormMsg] = useState<string>();
  const formFileRef = useRef<File | null>(null); // 캡처로 다시 만들 때 쓰는 원본 (메모리에만)
  const [capture, setCapture] = useState<{ suggested: boolean; reason?: string; pages: string; busy: boolean; error?: string }>({
    suggested: false,
    pages: "1-3",
    busy: false,
  });

  const [values, setValues] = useState<Record<string, FieldValue>>({});
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [chat, setChat] = useState<ChatMessage[]>([]);
  const [busy, setBusy] = useState(false);
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [restored, setRestored] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  // 브라우저 저장소에서 목업 로그인·기업정보·작업 불러오기
  useEffect(() => {
    setSession(loadSession());
    setProfile(loadProfile());
    const w = loadWorkspace();
    if (w?.doc) {
      setDoc(w.doc);
      setValues(w.values ?? {});
      setChat(w.chat ?? []);
      setFormStatus("done");
      setRestored(true);
    }
    if (w?.notice) {
      setNotice(w.notice);
      setNoticeStatus("done");
    }
    setHydrated(true);
    fetch("/api/plan-helper/status")
      .then((r) => r.json())
      .then(setProvider)
      .catch(() => setProvider({ provider: "unknown", ready: false }));
  }, []);

  // 자동 저장 (0.6초 모아서)
  useEffect(() => {
    if (!hydrated || (!doc && !notice)) return;
    const t = setTimeout(() => {
      const savedAt = new Date().toISOString();
      const ok = saveWorkspace({ version: 1, savedAt, notice, doc, values, chat: chat.filter((m) => m.text) });
      setSavedAt(ok ? savedAt : null);
    }, 600);
    return () => clearTimeout(t);
  }, [hydrated, notice, doc, values, chat]);

  const missing = useMemo(() => missingRequired(profile), [profile]);
  const selected: PlanField | null = doc && selectedId ? doc.fields[selectedId] ?? null : null;

  // ───── 업로드 ─────
  const uploadNotice = async (file: File) => {
    setNoticeStatus("busy");
    setNoticeMsg("공고문을 읽고 평가 기준을 정리하는 중… (30초~1분)");
    try {
      const data = await postFile("/api/plan-helper/notice", file);
      setNotice(data.notice);
      setNoticeStatus("done");
      setNoticeMsg(`평가 기준 ${data.notice.criteria.length}개 정리`);
    } catch (e) {
      setNoticeStatus("error");
      setNoticeMsg((e as Error).message);
    }
  };

  const loadDoc = (d: PlanDocument) => {
    const prefilled = profile ? prefillByRules(d, profile) : {};
    setDoc(d);
    setValues(prefilled);
    setSelectedId(null);
    setFormStatus("done");
    setRestored(false);
    setFormMsg(`작성 영역 ${d.fieldOrder.length}개 · 기업정보로 ${Object.keys(prefilled).length}칸 채움`);
    void aiPrefill(d, prefilled);
  };

  const uploadForm = async (file: File) => {
    formFileRef.current = file;
    setFormStatus("busy");
    setFormMsg("계획서 양식을 읽어 화면으로 옮기는 중…");
    try {
      const data = (await postFile("/api/plan-helper/parse", file)) as { doc: PlanDocument; needsCapture: boolean; reason?: string };
      loadDoc(data.doc);
      setCapture((c) => ({ ...c, suggested: data.needsCapture, reason: data.reason, error: undefined, busy: false }));
    } catch (e) {
      setFormStatus("error");
      setFormMsg((e as Error).message);
    }
  };

  // 캡처 경로: 고른 쪽을 이미지로 만들어 Claude 비전으로 재구성
  const runCapture = async () => {
    const file = formFileRef.current;
    if (!file) {
      setCapture((c) => ({ ...c, error: "원본 파일이 메모리에 없어요. 계획서 양식을 다시 올린 뒤 시도해 주세요." }));
      return;
    }
    setCapture((c) => ({ ...c, busy: true, error: undefined }));
    try {
      const form = new FormData();
      form.append("file", file);
      form.append("pages", capture.pages);
      const res = await fetch("/api/plan-helper/capture", { method: "POST", body: form });
      const data = await res.json().catch(() => ({ error: "서버 응답을 읽지 못했어요." }));
      if (!res.ok) throw new Error(data.error ?? "캡처 재구성에 실패했어요.");
      loadDoc(data.doc);
      setCapture((c) => ({ ...c, busy: false, suggested: false }));
    } catch (e) {
      setCapture((c) => ({ ...c, busy: false, error: (e as Error).message }));
    }
  };

  // 규칙으로 못 채운 짧은 칸을 AI가 기업정보 항목과 짝지음 (값은 브라우저에서 채움)
  const aiPrefill = async (d: PlanDocument, already: Record<string, FieldValue>) => {
    if (!profile) return;
    const candidates = d.fieldOrder
      .map((id) => d.fields[id])
      .filter((f) => (f.kind === "short" || f.kind === "cell") && !already[f.id] && !matchProfileKey(f.label) && !/\(\d+행\)/.test(f.label));
    if (!candidates.length) return;
    try {
      const res = await fetch("/api/plan-helper/prefill", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ fields: candidates }) });
      if (!res.ok) return;
      const { matches } = (await res.json()) as { matches: { fieldId: string; profileKey: keyof CompanyProfile }[] };
      setValues((cur) => {
        const next = { ...cur };
        for (const m of matches) {
          const v = (profile[m.profileKey] ?? "").toString().trim();
          if (v && !next[m.fieldId]?.text) next[m.fieldId] = { text: v, source: "profile" };
        }
        return next;
      });
    } catch {
      /* 보조 기능이라 실패해도 조용히 넘어감 */
    }
  };

  // ───── 편집·적용·되돌리기 ─────
  const onEdit = useCallback((id: string, text: string) => {
    setValues((cur) => {
      const prev = cur[id];
      // 미리 채움/AI 값 위에 처음 손댈 때만 이전 값을 기록 (타자마다 쌓지 않음)
      const history = prev && prev.source !== "user" ? [...(prev.history ?? []), { text: prev.text, source: prev.source }] : prev?.history;
      return { ...cur, [id]: { text, source: "user", history } };
    });
  }, []);

  const applySuggestion = (m: ChatMessage) => {
    if (!m.fieldId || !m.suggestion) return;
    const id = m.fieldId;
    setValues((cur) => {
      const prev = cur[id];
      const history = [...(prev?.history ?? []), { text: prev?.text ?? "", source: prev?.source ?? "user" }];
      return { ...cur, [id]: { text: m.suggestion!, source: "ai", history } };
    });
    setChat((c) => c.map((x) => (x.id === m.id ? { ...x, applied: true } : x)));
    setSelectedId(id);
    requestAnimationFrame(() => document.querySelector(`[data-field-id="${id}"]`)?.scrollIntoView({ block: "center", behavior: "smooth" }));
  };

  const undo = (id: string) => {
    setValues((cur) => {
      const prev = cur[id];
      const history = [...(prev?.history ?? [])];
      const last = history.pop();
      if (!last) return cur;
      return { ...cur, [id]: { text: last.text, source: last.source, history } };
    });
  };

  // ───── 챗봇 ─────
  const send = async (text: string) => {
    if (!doc) return;
    const user: ChatMessage = { id: newId(), role: "user", text, fieldId: selectedId ?? undefined };
    const reply: ChatMessage = { id: newId(), role: "assistant", text: "", fieldId: selectedId ?? undefined };
    const history = [...chat.filter((m) => m.text && !m.error), user];
    setChat((c) => [...c, user, reply]);
    setBusy(true);
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    const field = selected ? { ...selected, value: values[selected.id]?.text ?? "" } : null;
    let acc = "";
    const update = (patch: Partial<ChatMessage>) => setChat((c) => c.map((m) => (m.id === reply.id ? { ...m, ...patch } : m)));
    try {
      const res = await fetch("/api/plan-helper/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: ctrl.signal,
        body: JSON.stringify({
          messages: history.map((m) => ({ role: m.role, text: m.text })),
          context: { notice, docTitle: doc.title, profile, outline: outlineOf(doc, values), field },
        }),
      });
      if (!res.ok || !res.body) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? "AI 응답에 실패했어요.");
      }
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buf = "";
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        const lines = buf.split("\n");
        buf = lines.pop() ?? "";
        for (const line of lines) {
          if (!line.trim()) continue;
          const ev = JSON.parse(line) as { type: string; text?: string; error?: string };
          if (ev.type === "text" && ev.text) {
            acc += ev.text;
            update({ text: acc });
          } else if (ev.type === "error") throw new Error(ev.error);
        }
      }
      update({ text: acc, suggestion: extractSuggestion(acc) });
    } catch (e) {
      if ((e as Error).name === "AbortError") update({ text: acc ? `${acc}\n\n(중지함)` : "(중지함)", suggestion: extractSuggestion(acc) });
      else update({ text: (e as Error).message, error: true });
    } finally {
      setBusy(false);
      abortRef.current = null;
    }
  };

  const reset = () => {
    if (!confirm("지금 작업을 지우고 새로 시작할까요? (저장된 계획서·대화가 지워져요)")) return;
    saveWorkspace(null);
    setDoc(null);
    setNotice(null);
    setValues({});
    setChat([]);
    setSelectedId(null);
    setFormStatus("idle");
    setNoticeStatus("idle");
    setFormMsg(undefined);
    setNoticeMsg(undefined);
    setSavedAt(null);
  };

  // ───── 화면 ─────
  if (!hydrated) return <div className="ph-loading">불러오는 중…</div>;

  if (!session) {
    return (
      <div className="ph-gate">
        <h2>로그인이 필요해요</h2>
        <p>계획서 도우미는 상인25 회원만 쓸 수 있어요. 지금은 개발용 프로토타입이라 실제 회원가입 대신 테스트 계정으로 들어갑니다.</p>
        <button
          type="button"
          className="btn btn-primary"
          onClick={() => {
            const s = { name: "테스트 사용자", email: "tester@example.com", loggedInAt: new Date().toISOString() };
            saveSession(s);
            setSession(s);
          }}
        >
          테스트 계정으로 로그인
        </button>
        <p className="ph-muted">운영에서는 Supabase Auth 로그인으로 바뀝니다. (docs/plan-helper/개발자-전달문서.md)</p>
      </div>
    );
  }

  if (missing.length) {
    return (
      <div className="ph-gate">
        <h2>기업정보를 먼저 채워 주세요</h2>
        <p>계획서에 기업정보를 미리 넣어 드리려면 아래 항목이 필요해요.</p>
        <ul className="ph-missing">
          {missing.map((m) => (
            <li key={m.key}>{m.label}</li>
          ))}
        </ul>
        <Link href="/plan-helper/company" className="btn btn-primary">
          기업정보 입력하러 가기
        </Link>
      </div>
    );
  }

  const providerLabel = provider
    ? provider.provider === "claude-code"
      ? "로컬 Claude (개발용)"
      : provider.provider === "anthropic"
        ? provider.ready
          ? "Claude API"
          : "Claude API · 키 없음"
        : "AI 설정 확인 필요"
    : "AI 확인 중";

  const filled = doc ? doc.fieldOrder.filter((id) => values[id]?.text?.trim()).length : 0;

  return (
    <div className="ph-root">
      <div className="ph-toolbar">
        <div className="ph-toolbar-title">
          <b>{doc ? doc.title : "지원사업 계획서 도우미"}</b>
          {doc && (
            <span className="ph-muted">
              {doc.fileName} · 작성 {filled}/{doc.fieldOrder.length}칸
            </span>
          )}
        </div>
        <div className="ph-toolbar-actions">
          {doc && (
            <>
              <UploadZone compact title="공고문" hint="공고문 올리기" status={noticeStatus} message={noticeMsg} fileName={notice?.fileName} onFile={uploadNotice} />
              <UploadZone compact title="계획서 양식" hint="양식 바꾸기" status={formStatus} message={formMsg} fileName={doc.fileName} onFile={uploadForm} />
              <button type="button" className="ph-btn-sm ph-btn-ghost" onClick={() => window.print()}>
                인쇄·PDF
              </button>
              <button type="button" className="ph-btn-sm ph-btn-ghost" onClick={reset}>
                새로 시작
              </button>
            </>
          )}
          <span className="ph-save" aria-live="polite">
            {restored ? "이전 작업을 불러왔어요 · " : ""}
            {savedAt ? `자동 저장됨 ${new Date(savedAt).toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit" })}` : ""}
          </span>
        </div>
      </div>

      {!doc ? (
        <div className="ph-landing">
          <div className="ph-landing-head">
            <h2>공고문과 계획서 양식을 올려 주세요</h2>
            <p className="ph-muted">
              양식을 올리면 왼쪽에 계획서 화면이 열리고, 오른쪽 챗봇과 대화하며 칸을 채울 수 있어요. <b>{profile?.companyName}</b> 기업정보가 알맞은 칸에 미리 들어가요.{" "}
              <Link href="/plan-helper/company">기업정보 수정</Link>
            </p>
          </div>
          <div className="ph-landing-drops">
            <UploadZone title="① 지원사업 공고문" hint="평가 기준을 챗봇이 참고해요 (선택)" status={noticeStatus} message={noticeMsg} fileName={notice?.fileName} onFile={uploadNotice} />
            <UploadZone title="② 계획서 양식" hint="빈 사업계획서 양식 파일" status={formStatus} message={formMsg} onFile={uploadForm} />
          </div>
          <p className="ph-muted ph-landing-foot">올린 파일은 화면으로 옮기는 데만 쓰고 서버에 보관하지 않아요. 작성 내용은 이 브라우저에 자동 저장돼요.</p>
        </div>
      ) : (
        <div className="ph-split">
          <div className="ph-left">
            {doc.warnings.length > 0 && <div className="ph-warn">{doc.warnings.join(" · ")}</div>}
            {formMsg && formStatus === "done" && (
              <div className="ph-info">
                {formMsg}
                <span className="ph-legend">
                  <span>
                    <i style={{ background: "#fff6d1" }} />
                    기업정보로 채움
                  </span>
                  <span>
                    <i style={{ background: "#e7f0ff" }} />
                    AI 제안 적용
                  </span>
                </span>
              </div>
            )}
            <div className={`ph-capture${capture.suggested ? " is-suggested" : ""}`}>
              <span>
                {capture.suggested ? <b>원본 모양을 제대로 읽지 못했어요. </b> : "모양이 원본과 많이 다르면 "}
                페이지를 이미지로 찍어 Claude가 다시 그리게 할 수 있어요 (쪽당 30초~1분).
              </span>
              <label>
                쪽
                <input value={capture.pages} onChange={(e) => setCapture((c) => ({ ...c, pages: e.target.value }))} disabled={capture.busy} aria-label="캡처할 쪽 범위" />
              </label>
              <button type="button" className="ph-btn-sm ph-btn-primary" onClick={runCapture} disabled={capture.busy || !formFileRef.current}>
                {capture.busy ? "캡처로 재구성 중…" : "캡처로 다시 만들기"}
              </button>
              {capture.error && <span className="ph-drop-error">{capture.error}</span>}
            </div>
            <PlanView doc={doc} values={values} selectedId={selectedId} onSelect={setSelectedId} onEdit={onEdit} />
          </div>
          <div className="ph-right">
            {notice && (
              <details className="ph-notice">
                <summary>
                  <span className="ph-chip-kind">공고문</span> {notice.title}
                </summary>
                <p>{notice.summary}</p>
                {notice.criteria.length > 0 && (
                  <>
                    <b>평가 기준</b>
                    <ul>
                      {notice.criteria.map((c, i) => (
                        <li key={i}>{c}</li>
                      ))}
                    </ul>
                  </>
                )}
              </details>
            )}
            <ChatView
              messages={chat}
              busy={busy}
              selected={selected}
              fieldLabel={(id) => doc.fields[id]?.label ?? id}
              canUndo={(id) => !!values[id]?.history?.length}
              onSend={send}
              onStop={() => abortRef.current?.abort()}
              onClearSelection={() => setSelectedId(null)}
              onApply={applySuggestion}
              onUndo={undo}
              onClear={() => setChat([])}
              appliedIds={new Set(chat.filter((m) => m.applied).map((m) => m.id))}
              providerLabel={providerLabel}
            />
          </div>
        </div>
      )}
    </div>
  );
}
