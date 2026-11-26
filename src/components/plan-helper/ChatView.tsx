"use client";

// 챗봇 뷰 (화면 오른쪽 절반): 위쪽 대화기록, 아래쪽 프롬프트 입력창 + 전송 버튼.
// 선택한 계획서 영역은 입력창 위에 칩으로 보이고, 응답의 <제안> 문안은 "이 영역에 적용"으로 넣습니다.
import { useEffect, useRef, useState } from "react";
import type { ChatMessage, PlanField } from "@/lib/plan-helper/types";

type Props = {
  messages: ChatMessage[];
  busy: boolean;
  selected: PlanField | null;
  fieldLabel: (id: string) => string;
  canUndo: (fieldId: string) => boolean;
  onSend: (text: string) => void;
  onStop: () => void;
  onClearSelection: () => void;
  onApply: (message: ChatMessage) => void;
  onUndo: (fieldId: string) => void;
  onClear: () => void;
  appliedIds: Set<string>;
  providerLabel: string;
};

const QUICK = ["이 영역에 들어갈 초안을 써 줘", "평가 기준에 맞게 다듬어 줘", "더 짧고 분명하게 고쳐 줘", "무엇을 써야 할지 질문해 줘"];

/** <제안> 태그를 눈에 띄는 상자로 바꿔 보여 줌 (스트리밍 중 닫는 태그가 아직 없어도 처리) */
function MessageBody({ text }: { text: string }) {
  const open = text.indexOf("<제안>");
  if (open < 0) return <div className="ph-msg-text">{text}</div>;
  const close = text.indexOf("</제안>", open);
  const before = text.slice(0, open).trim();
  const inner = text.slice(open + 4, close < 0 ? undefined : close).trim();
  const after = close < 0 ? "" : text.slice(close + 5).trim();
  return (
    <>
      {before && <div className="ph-msg-text">{before}</div>}
      <div className="ph-suggestion">
        <span className="ph-suggestion-tag">제안 문안</span>
        <div className="ph-msg-text">{inner}</div>
      </div>
      {after && <div className="ph-msg-text">{after}</div>}
    </>
  );
}

export function ChatView(p: Props) {
  const [draft, setDraft] = useState("");
  const logRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const el = logRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [p.messages]);

  const send = (text = draft) => {
    const t = text.trim();
    if (!t || p.busy) return;
    p.onSend(t);
    setDraft("");
  };

  return (
    <section className="ph-chat" aria-label="챗봇 뷰">
      <header className="ph-chat-head">
        <div>
          <b>계획서 도우미 챗봇</b>
          <span className="ph-provider" title="AI 연결 방식">
            {p.providerLabel}
          </span>
        </div>
        {p.messages.length > 0 && (
          <button type="button" className="ph-link-btn" onClick={p.onClear} disabled={p.busy}>
            대화 비우기
          </button>
        )}
      </header>

      <div className="ph-chat-log" ref={logRef} aria-live="polite">
        {p.messages.length === 0 && (
          <div className="ph-chat-empty">
            <b>왼쪽 계획서에서 작성할 칸을 클릭하세요.</b>
            <p>선택한 칸의 항목·현재 내용·공고문 평가 기준을 챗봇이 함께 보고 문안을 제안해요. 제안이 마음에 들면 &lsquo;이 영역에 적용&rsquo;을 누르세요.</p>
          </div>
        )}
        {p.messages.map((m) => (
          <div key={m.id} className={`ph-msg ph-msg-${m.role}${m.error ? " is-error" : ""}`}>
            {m.fieldId && m.role === "user" && <span className="ph-msg-field">{p.fieldLabel(m.fieldId)}</span>}
            <MessageBody text={m.text || (p.busy ? "…" : "")} />
            {m.role === "assistant" && m.suggestion && m.fieldId && (
              <div className="ph-msg-actions">
                {p.appliedIds.has(m.id) ? (
                  <>
                    <span className="ph-applied">적용됨 · {p.fieldLabel(m.fieldId)}</span>
                    {p.canUndo(m.fieldId) && (
                      <button type="button" className="ph-btn-sm ph-btn-ghost" onClick={() => p.onUndo(m.fieldId!)}>
                        되돌리기
                      </button>
                    )}
                  </>
                ) : (
                  <button type="button" className="ph-btn-sm ph-btn-primary" onClick={() => p.onApply(m)}>
                    이 영역에 적용
                  </button>
                )}
              </div>
            )}
          </div>
        ))}
      </div>

      <div className="ph-chat-input">
        {p.selected ? (
          <div className="ph-chip-row">
            <span className="ph-chip" title={p.selected.guide ?? undefined}>
              <span className="ph-chip-kind">선택한 영역</span>
              {p.selected.section ? `${p.selected.section} › ` : ""}
              {p.selected.label}
              <button type="button" aria-label="선택 해제" onClick={p.onClearSelection}>
                ×
              </button>
            </span>
          </div>
        ) : (
          <div className="ph-chip-row ph-muted">선택한 영역 없음 · 전체 계획서에 대해 물어볼 수 있어요</div>
        )}
        {p.selected && (
          <div className="ph-quick">
            {QUICK.map((q) => (
              <button key={q} type="button" onClick={() => send(q)} disabled={p.busy}>
                {q}
              </button>
            ))}
          </div>
        )}
        <div className="ph-input-row">
          <textarea
            ref={inputRef}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                e.preventDefault();
                send();
              }
            }}
            placeholder="질문이나 요청을 입력하세요 (Enter 전송, Shift+Enter 줄바꿈)"
            rows={3}
            aria-label="프롬프트 입력"
          />
          {p.busy ? (
            <button type="button" className="ph-send is-stop" onClick={p.onStop}>
              중지
            </button>
          ) : (
            <button type="button" className="ph-send" onClick={() => send()} disabled={!draft.trim()}>
              전송
            </button>
          )}
        </div>
      </div>
    </section>
  );
}
