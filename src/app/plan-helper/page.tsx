import type { Metadata } from "next";
import { PlanHelperApp } from "@/components/plan-helper/PlanHelperApp";
import "./plan-helper.css";

export const metadata: Metadata = {
  title: "지원사업 계획서 도우미",
  description: "공고문과 계획서 양식을 올리면 계획서 화면과 AI 챗봇이 나란히 열려 칸을 하나씩 함께 채웁니다. (PC 전용)",
};

export default function PlanHelperPage() {
  return (
    <>
      {/* PC 전용: 1280px 미만 화면에서는 안내만 보임 (CSS) */}
      <div className="ph-narrow" role="note">
        <div className="ph-narrow-card">
          <b>PC 브라우저에서 이용해 주세요</b>
          <p>계획서 도우미는 계획서와 챗봇을 나란히 보는 화면이라 가로 1280px 이상이 필요해요. 휴대폰·태블릿 지원은 준비 중이에요.</p>
        </div>
      </div>
      <div className="ph-wide">
        <PlanHelperApp />
      </div>
    </>
  );
}
