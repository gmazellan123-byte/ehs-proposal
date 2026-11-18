-- =====================================================================
--  이전 버전(v1) 정리용 — v1 을 설치한 적이 있을 때만, schema.sql 보다 먼저 1회 실행
--  ⚠ 기존 제안·신고·인원 데이터가 모두 삭제됩니다. (운영 시작 전에만 사용)
--  로그인 계정(Authentication > Users)은 남아 있어도 재가입 시 자동 정리됩니다.
--  사진 파일은 Storage > report-photos 에서 필요 시 직접 비우세요.
-- =====================================================================
drop table if exists public.report_logs cascade;
drop table if exists public.reports     cascade;
drop table if exists public.employees   cascade;
drop table if exists public.org_sites   cascade;

drop function if exists public.is_admin()                 cascade;
drop function if exists public.is_active_member()         cascade;
drop function if exists public.employees_before_update()  cascade;
drop function if exists public.reports_before_insert()    cascade;
drop function if exists public.reports_before_update()    cascade;
drop function if exists public.reports_after_change()     cascade;

drop policy if exists photo_insert_own   on storage.objects;
drop policy if exists photo_select       on storage.objects;
drop policy if exists photo_delete_admin on storage.objects;
drop policy if exists photo_delete       on storage.objects;

select '정리 완료 — 이어서 schema.sql 을 실행하세요' as result;
