// =====================================================================
//  설정 파일 — 이 파일만 수정하면 됩니다.
//  SUPABASE_URL / SUPABASE_KEY 가 비어 있으면 "데모 모드"로 동작합니다.
//  (데모 모드: 서버 없이 화면만 체험, 새로고침하면 데이터 초기화)
// =====================================================================
window.APP_CONFIG = {
  // ① Supabase > Project Settings > API (또는 Connect 버튼) 에서 복사
  SUPABASE_URL: "https://txwnxndkgdfietzyjtij.supabase.co",

  // ② Publishable key (sb_publishable_...) 또는 legacy anon key
  //    ※ 공개되어도 되는 키입니다. service_role / secret 키는 절대 넣지 마세요.
  SUPABASE_KEY: "sb_publishable_Ypdv4ksAyI8NkGGcCLJx8A_-x6w2ePc", 

  // ③ Edge Function 이름 (가이드대로 만들었다면 그대로 두세요)
  FUNCTION_NAME: "api",

  // ④ 아차사고 사고 유형 목록 (차후 등록 예정 — 비워두면 "등록 예정"으로 표시)
  //    예: ["추락·전도", "충돌·접촉", "끼임·협착", "화재·폭발", "기타"]
  NEARMISS_CATEGORIES: [],

  // ※ 조직 구조(본사 > 사업팀 > 사업장)는 서버(DB)의 org_sites 표에서 관리합니다.
};
