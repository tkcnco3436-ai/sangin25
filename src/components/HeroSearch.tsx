"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { REGIONS, getSavedRegion, saveRegion } from "@/lib/regions";
import { Search } from "./Icons";

// 홈 검색창: 지역을 고르고 필요한 것을 적으면 공고 보드로 바로 이동합니다.
export function HeroSearch() {
  const router = useRouter();
  const [region, setRegion] = useState("전체");
  const [q, setQ] = useState("");

  useEffect(() => setRegion(getSavedRegion()), []);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    saveRegion(region);
    const params = new URLSearchParams();
    if (q.trim()) params.set("q", q.trim());
    if (region !== "전체") params.set("region", region);
    router.push(`/board${params.size ? `?${params}` : ""}`);
  };

  return (
    <form className="hero-search" role="search" onSubmit={submit}>
      <label className="hero-region" htmlFor="hero-region">
        <span className="sr-only">지역</span>
        <select id="hero-region" value={region} onChange={(e) => setRegion(e.target.value)}>
          {REGIONS.map((r) => (
            <option key={r} value={r}>{r === "전체" ? "전국" : r}</option>
          ))}
        </select>
      </label>
      <input id="hero-q" type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="무엇이 필요하세요? 예: 간판" aria-label="공고 검색" />
      <button className="btn btn-primary" type="submit"><Search size={20} /><span>찾기</span></button>
    </form>
  );
}
