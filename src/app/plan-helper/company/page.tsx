import type { Metadata } from "next";
import { CompanyForm } from "@/components/plan-helper/CompanyForm";
import "../plan-helper.css";

export const metadata: Metadata = { title: "기업정보" };

export default function CompanyPage() {
  return (
    <section className="section">
      <div className="container">
        <div className="section-head">
          <div>
            <span className="eyebrow">계획서 도우미 · 기업정보</span>
            <h2 style={{ marginTop: 6 }}>계획서에 미리 넣을 기업정보</h2>
            <p className="muted" style={{ marginTop: 6 }}>여기 적은 정보가 계획서의 기업명·대표자·주소 같은 칸에 자동으로 들어가요.</p>
          </div>
        </div>
        <CompanyForm />
      </div>
    </section>
  );
}
