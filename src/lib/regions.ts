// 맨 왼쪽부터 지역 전체, 부산, 서울 순. 나머지는 수도권 → 광역시 → 도 순서.
export const REGIONS = ["전체", "부산", "서울", "경기", "인천", "대구", "광주", "대전", "울산", "세종", "강원", "충북", "충남", "전북", "전남", "경북", "경남", "제주"];
export const REGION_KEY = "sowonworld-region"; // 고른 지역을 다음 방문 때도 기억

export function getSavedRegion() {
  try {
    const r = localStorage.getItem(REGION_KEY);
    return r && REGIONS.includes(r) ? r : "전체";
  } catch {
    return "전체";
  }
}

export function saveRegion(r: string) {
  try {
    localStorage.setItem(REGION_KEY, r);
  } catch {}
}
