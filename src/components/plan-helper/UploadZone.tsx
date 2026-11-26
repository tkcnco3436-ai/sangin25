"use client";

// 드래그 드롭 업로드 칸 (공고문 / 계획서 양식)
import { useRef, useState } from "react";
import { ACCEPT_ATTR, checkFile } from "@/lib/plan-helper/files";

type Props = {
  title: string;
  hint: string;
  status: "idle" | "busy" | "done" | "error";
  message?: string;
  fileName?: string;
  compact?: boolean;
  onFile: (file: File) => void;
};

export function UploadZone({ title, hint, status, message, fileName, compact, onFile }: Props) {
  const [over, setOver] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);

  const take = (files: FileList | null) => {
    const file = files?.[0];
    if (!file) return;
    const problem = checkFile(file);
    setLocalError(problem);
    if (!problem) onFile(file);
  };

  const error = localError ?? (status === "error" ? message : null);

  return (
    <div
      className={`ph-drop${compact ? " is-compact" : ""}${over ? " is-over" : ""} is-${status}`}
      onDragOver={(e) => {
        e.preventDefault();
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setOver(false);
        take(e.dataTransfer.files);
      }}
      onClick={() => status !== "busy" && input.current?.click()}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && input.current?.click()}
      aria-label={`${title} 올리기`}
    >
      <input ref={input} type="file" accept={ACCEPT_ATTR} hidden onChange={(e) => take(e.target.files)} />
      <div className="ph-drop-title">
        <b>{title}</b>
        {status === "done" && <span className="ph-ok">완료</span>}
      </div>
      {status === "busy" ? (
        <div className="ph-drop-body">
          <span className="ph-spinner" aria-hidden /> {message ?? "읽는 중…"}
        </div>
      ) : fileName && status === "done" ? (
        <div className="ph-drop-body">
          <span className="ph-file">{fileName}</span>
          {message && <span className="ph-drop-msg">{message}</span>}
          <span className="ph-drop-hint">다른 파일로 바꾸려면 끌어다 놓거나 클릭</span>
        </div>
      ) : (
        <div className="ph-drop-body">
          <span>{hint}</span>
          <span className="ph-drop-hint">HWP · HWPX · PDF · DOCX — 끌어다 놓거나 클릭</span>
        </div>
      )}
      {error && (
        <div className="ph-drop-error" role="alert">
          {error}
        </div>
      )}
    </div>
  );
}
