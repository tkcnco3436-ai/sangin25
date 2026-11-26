"use client";

// 계획서 뷰 (화면 왼쪽 절반): 중간 표현(PlanDocument)을 A4 쪽 모양 HTML로 그립니다.
// 작성 영역은 마우스를 가까이 대면 강조되고, 클릭하면 선택(챗봇 맥락) + 바로 편집할 수 있습니다.
import { memo, useEffect, useRef } from "react";
import type { CSSProperties } from "react";
import type { FieldValue, PlanBlock, PlanCell, PlanDocument } from "@/lib/plan-helper/types";

type Props = {
  doc: PlanDocument;
  values: Record<string, FieldValue>;
  selectedId: string | null;
  onSelect: (id: string) => void;
  onEdit: (id: string, text: string) => void;
};

const SOURCE_TAG: Record<string, string> = { profile: "기업정보", ai: "AI 적용", user: "" };

/** 편집 칸: 바깥에서 값이 바뀌면(적용·되돌리기·미리 채움) 내용을 갈아 끼우고, 입력 중에는 건드리지 않음 */
const FieldEditor = memo(function FieldEditor({
  id,
  kind,
  label,
  template,
  value,
  selected,
  onSelect,
  onEdit,
}: {
  id: string;
  kind: string;
  label: string;
  template?: string;
  value: FieldValue | undefined;
  selected: boolean;
  onSelect: (id: string) => void;
  onEdit: (id: string, text: string) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const text = value?.text ?? template ?? "";
  useEffect(() => {
    const el = ref.current;
    if (el && document.activeElement !== el && el.innerText !== text) el.innerText = text;
  }, [text]);
  const source = value?.text ? value.source : undefined;
  if (kind === "check") {
    const on = !!text.trim();
    return (
      <button
        type="button"
        className={`ph-field ph-field-check${selected ? " is-selected" : ""}${on ? " is-on" : ""}`}
        data-field-id={id}
        aria-pressed={on}
        aria-label={label}
        title={label}
        onClick={() => {
          onSelect(id);
          onEdit(id, on ? "" : "○");
        }}
      >
        {on ? text : ""}
      </button>
    );
  }
  return (
    <div
      ref={ref}
      className={`ph-field ph-field-${kind}${selected ? " is-selected" : ""}${source ? ` src-${source}` : ""}`}
      data-field-id={id}
      data-placeholder={kind === "check" ? "" : label}
      contentEditable="plaintext-only"
      suppressContentEditableWarning
      role="textbox"
      aria-label={label}
      aria-multiline={kind === "long" || kind === "cell"}
      tabIndex={0}
      onFocus={() => onSelect(id)}
      onClick={() => onSelect(id)}
      onInput={(e) => onEdit(id, (e.currentTarget as HTMLDivElement).innerText.replace(/\n$/, ""))}
      title={source && SOURCE_TAG[source] ? `${label} · ${SOURCE_TAG[source]}에서 채움` : label}
    />
  );
});

function cellStyle(c: PlanCell): CSSProperties {
  return { textAlign: c.align ?? "left", fontWeight: c.bold || c.label || c.header ? 700 : undefined };
}

/** A4 폭(794px)을 왼쪽 칸 폭에 맞춰 통째로 줄임 — 글자 줄바꿈이 원본과 같도록 레이아웃은 그대로 두고 배율만 바꿈 */
function useFitZoom() {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    const host = el?.parentElement;
    if (!el || !host) return;
    const fit = () => el.style.setProperty("--ph-zoom", String(Math.min(1, Math.max(0.5, (host.clientWidth - 32) / 794))));
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(host);
    return () => ro.disconnect();
  }, []);
  return ref;
}

export function PlanView({ doc, values, selectedId, onSelect, onEdit }: Props) {
  const zoomRef = useFitZoom();
  const renderCell = (c: PlanCell, key: string) => {
    const f = c.fieldId ? doc.fields[c.fieldId] : undefined;
    return (
      <td
        key={key}
        colSpan={c.colSpan > 1 ? c.colSpan : undefined}
        rowSpan={c.rowSpan > 1 ? c.rowSpan : undefined}
        className={[c.label ? "is-label" : "", c.header ? "is-header" : "", f ? "has-field" : ""].join(" ").trim() || undefined}
        style={cellStyle(c)}
      >
        {f ? (
          <FieldEditor
            id={f.id}
            kind={f.kind}
            label={f.label}
            template={f.template}
            value={values[f.id]}
            selected={selectedId === f.id}
            onSelect={onSelect}
            onEdit={onEdit}
          />
        ) : (
          c.text
        )}
      </td>
    );
  };

  const renderBlock = (b: PlanBlock, key: string) => {
    switch (b.type) {
      case "pageBreak":
        return <div key={key} className="ph-page-break" aria-hidden />;
      case "heading":
        return (
          <div key={key} className={`ph-h ph-h${b.level}`} style={b.fontPt ? { fontSize: `${Math.min(b.fontPt, 20)}pt` } : undefined}>
            {b.text}
          </div>
        );
      case "paragraph":
        return (
          <p
            key={key}
            className={`ph-p${b.note ? " is-note" : ""}`}
            style={{ fontSize: b.fontPt ? `${Math.min(Math.max(b.fontPt, 8), 18)}pt` : undefined, fontWeight: b.bold ? 700 : undefined, textAlign: b.align }}
          >
            {b.text}
          </p>
        );
      case "image":
        return b.src ? (
          // 양식 그림은 data URL이라 next/image 최적화 대상이 아님
          // eslint-disable-next-line @next/next/no-img-element
          <img key={key} className="ph-img" src={b.src} alt={b.alt} />
        ) : (
          <div key={key} className="ph-img-missing">
            {b.alt}
          </div>
        );
      case "table":
        return (
          <table key={key} className={`ph-table ph-table-${b.variant}`}>
            <tbody>
              {b.rows.map((row, ri) => (
                <tr key={ri}>{row.map((c, ci) => renderCell(c, `${ri}-${ci}`))}</tr>
              ))}
            </tbody>
          </table>
        );
    }
  };

  // 쪽 나눔 기준으로 A4 쪽들로 묶기
  const pages: PlanBlock[][] = [[]];
  for (const s of doc.sections) for (const b of s.blocks) {
    if (b.type === "pageBreak") {
      if (pages[pages.length - 1].length) pages.push([]);
    } else pages[pages.length - 1].push(b);
  }

  return (
    <div className="ph-doc" aria-label="계획서 뷰" ref={zoomRef}>
      {pages.map((blocks, pi) => (
        <article key={pi} className="ph-page" aria-label={`${pi + 1}쪽`}>
          {blocks.map((b, bi) => renderBlock(b, `${pi}-${bi}`))}
          <span className="ph-page-no" aria-hidden>
            - {pi + 1} -
          </span>
        </article>
      ))}
    </div>
  );
}
