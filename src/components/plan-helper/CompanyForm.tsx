"use client";

// 기업정보 입력 (개발용 목업). 운영에서는 회원가입 후 '내 기업정보' 화면 + DB 저장으로 바뀝니다.
import Link from "next/link";
import { useEffect, useState } from "react";
import { EMPTY_PROFILE, OPTIONAL_FIELDS, REQUIRED_FIELDS, SAMPLE_PROFILE, missingRequired } from "@/lib/plan-helper/profile";
import { loadProfile, saveProfile } from "@/lib/plan-helper/storage";
import type { CompanyProfile } from "@/lib/plan-helper/types";

export function CompanyForm() {
  const [p, setP] = useState<CompanyProfile>(EMPTY_PROFILE);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    const cur = loadProfile();
    if (cur) setP({ ...EMPTY_PROFILE, ...cur });
  }, []);

  const missing = missingRequired(p);
  const set = (k: keyof CompanyProfile, v: string) => {
    setSaved(false);
    setP((x) => ({ ...x, [k]: v }));
  };

  const field = (f: { key: keyof CompanyProfile; label: string; placeholder: string; long?: boolean }, required: boolean) => (
    <label key={f.key} className={`ph-form-row${f.long ? " is-long" : ""}`}>
      <span>
        {f.label}
        {required && <em aria-label="필수"> *</em>}
      </span>
      {f.long ? (
        <textarea value={p[f.key] ?? ""} placeholder={f.placeholder} rows={2} onChange={(e) => set(f.key, e.target.value)} />
      ) : (
        <input value={p[f.key] ?? ""} placeholder={f.placeholder} onChange={(e) => set(f.key, e.target.value)} />
      )}
    </label>
  );

  return (
    <form
      className="ph-company"
      onSubmit={(e) => {
        e.preventDefault();
        saveProfile(p);
        setSaved(true);
      }}
    >
      <div className="notice" style={{ marginBottom: 16 }}>
        개발용 프로토타입: 기업정보는 이 브라우저에만 저장돼요. 시연할 때는 &lsquo;예시 기업으로 채우기&rsquo;를 누르세요 (가상의 기업).
      </div>
      <div className="ph-form-grid">{REQUIRED_FIELDS.map((f) => field(f, true))}</div>
      <h3 className="ph-form-sub">선택 항목</h3>
      <div className="ph-form-grid">{OPTIONAL_FIELDS.map((f) => field(f, false))}</div>
      <div className="ph-form-actions">
        <button type="button" className="btn btn-ghost" onClick={() => (setP(SAMPLE_PROFILE), setSaved(false))}>
          예시 기업으로 채우기
        </button>
        <button type="submit" className="btn btn-primary">
          저장
        </button>
        {saved &&
          (missing.length ? (
            <span className="ph-muted">저장했어요. 아직 빈 필수 항목: {missing.map((m) => m.label).join(", ")}</span>
          ) : (
            <Link href="/plan-helper" className="btn btn-pink">
              계획서 도우미로 가기
            </Link>
          ))}
      </div>
    </form>
  );
}
