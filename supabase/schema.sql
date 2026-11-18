-- =====================================================================
--  안전보건 제안 시스템 v3 · Supabase 데이터베이스 설정
--  사용법: Supabase 대시보드 > SQL Editor > New query 에 이 파일 전체를
--          붙여넣고 [Run] 을 한 번 누르면 됩니다.
--  ※ v1 을 설치했다면 reset.sql 을 먼저 실행하세요. (v2 → v3 는 그대로 실행하면 자동 업그레이드)
--  ※ 여러 번 실행해도 데이터가 지워지지 않도록 작성되어 있습니다.
-- =====================================================================

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------
-- 1. 조직 구조 (본사 > 사업팀 > 그룹(사업장) > 팀 > 파트)
--    사업팀-그룹 관계는 아래 org_sites 표, 그룹 아래 팀·파트는 사번별 백데이터
--    (employees.dept / employees.part, 본사 PC 화면에서 엑셀로 일괄 업로드)로 관리
--    사업장이 바뀌면 아래 목록을 고치고 다시 실행하거나,
--    Table Editor 에서 org_sites 표를 직접 수정하세요.
-- ---------------------------------------------------------------------
create table if not exists public.org_sites (
  site  text primary key,
  team  text not null,
  sort  int  not null default 0
);

insert into public.org_sites (site, team, sort) values
  ('디지털1그룹', '1사업팀', 11), ('디지털2그룹', '1사업팀', 12), ('서울R&D그룹', '1사업팀', 13),
  ('나노1그룹',  '2사업팀', 21), ('나노2그룹',  '2사업팀', 22), ('나노3그룹', '2사업팀', 23), ('미래기술그룹', '2사업팀', 24),
  ('아산1그룹',  '3사업팀', 31), ('아산2그룹',  '3사업팀', 32), ('기흥SDC그룹', '3사업팀', 33),
  ('평택그룹',   '4사업팀', 41), ('천안그룹',   '4사업팀', 42), ('온양그룹',  '4사업팀', 43)
on conflict (site) do update set team = excluded.team, sort = excluded.sort;

-- ---------------------------------------------------------------------
-- 2. 인원(사번) — 사번 원문 없이 HMAC 해시만 저장, 이름·연락처 없음
--    role : worker(근로자) / manager(관리자·그룹) / team(사업팀) / hq(본사)
--    소속 : worker·manager → 그룹(site) 필수 + 팀(dept)·파트(part) 선택
--           team → 사업팀(team) 필수, hq → 없음
-- ---------------------------------------------------------------------
create table if not exists public.employees (
  emp_hash      text primary key,
  emp_code      text generated always as (upper(left(emp_hash, 8))) stored,
  role          text not null default 'worker' check (role in ('worker','manager','team','hq')),
  team          text,
  site          text references public.org_sites(site) on update cascade,
  active        boolean not null default true,
  user_id       uuid unique references auth.users(id) on delete set null,
  created_at    timestamptz not null default now(),
  registered_at timestamptz,
  constraint employees_unit_chk check (
       (role in ('worker','manager') and site is not null and team is not null)
    or (role = 'team' and team is not null and site is null)
    or (role = 'hq'   and team is null     and site is null))
);
alter table public.employees add column if not exists dept text check (char_length(dept) <= 50);
alter table public.employees add column if not exists part text check (char_length(part) <= 50);
-- 성명은 마스킹된 형태(예: 홍*동)만 저장. 원래 성명은 브라우저에서 마스킹 후 전송되며 서버에 저장되지 않음
alter table public.employees add column if not exists name_mask text check (char_length(name_mask) <= 20);
create index if not exists employees_team_idx on public.employees (team);
create index if not exists employees_site_idx on public.employees (site);

-- ---------------------------------------------------------------------
-- 3. 제안·신고
--    개선제안 : 제안등급(가~라), 장소, 상세내용, 조치요청, 사진
--    아차사고 : 발생일시, 사고유형(선택·추후 등록), 상황설명, 재발방지의견, 사진
--    소속(사업팀·그룹·팀·파트)은 작성자의 사번 등록 정보에서 서버가 자동으로 채웁니다.
--    등급 : 가=전사 적용 / 나=사업팀 적용 / 다=그룹 적용 / 라=단순 조치
--    상태 : received 접수 / reviewing 검토중 / rejected 반려 / done 조치완료
--           committee 산업안전보건위원회 의결예정 (결정등급 가·나·다 → 자동 종료)
-- ---------------------------------------------------------------------
create table if not exists public.reports (
  id             uuid primary key default gen_random_uuid(),
  report_no      bigint generated always as identity,
  type           text not null check (type in ('proposal','nearmiss')),
  author_id      uuid references auth.users(id) on delete set null,
  emp_hash       text references public.employees(emp_hash) on delete set null,
  team           text,
  site           text,
  proposed_grade text check (proposed_grade in ('가','나','다','라')),
  final_grade    text check (final_grade    in ('가','나','다','라')),
  location       text check (char_length(location) <= 100),
  category       text check (char_length(category) <= 50),
  occurred_at    timestamptz,
  detail         text not null check (char_length(detail) between 5 and 2000),
  request        text check (char_length(request) <= 2000),
  prevention     text check (char_length(prevention) <= 2000),
  photo_path     text,
  status         text not null default 'received'
                 check (status in ('received','reviewing','rejected','done','committee')),
  admin_comment  text check (char_length(admin_comment) <= 2000),
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  reviewed_at    timestamptz,
  closed_at      timestamptz
);
create index if not exists reports_created_idx on public.reports (created_at desc);
create index if not exists reports_author_idx  on public.reports (author_id);
create index if not exists reports_emp_idx     on public.reports (emp_hash);
create index if not exists reports_unit_idx    on public.reports (team, site);
alter table public.reports add column if not exists dept text;
alter table public.reports add column if not exists part text;

-- ---------------------------------------------------------------------
-- 4. 처리 이력
-- ---------------------------------------------------------------------
create table if not exists public.report_logs (
  id              bigint generated always as identity primary key,
  report_id       uuid not null references public.reports(id) on delete cascade,
  from_status     text,
  to_status       text,
  final_grade     text,
  comment         text,
  changed_by_code text,
  changed_by_role text,
  created_at      timestamptz not null default now()
);
create index if not exists report_logs_report_idx on public.report_logs (report_id, created_at);

-- ---------------------------------------------------------------------
-- 5. 권한 판단 함수
-- ---------------------------------------------------------------------
create or replace function public.my_role()
returns text language sql stable security definer set search_path = public as $$
  select role from public.employees where user_id = auth.uid() and active limit 1;
$$;

create or replace function public.is_active_member()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.employees where user_id = auth.uid() and active);
$$;

-- 내 관리 범위 안의 소속인가? (본사=전체, 사업팀=소속 팀, 관리자=소속 사업장)
create or replace function public.in_scope(p_team text, p_site text)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.employees e
     where e.user_id = auth.uid() and e.active and (
           e.role = 'hq'
        or (e.role = 'team'    and p_team is not null and e.team = p_team)
        or (e.role = 'manager' and p_site is not null and e.site = p_site)));
$$;

-- (서버 함수 전용) 가상 로그인 ID 로 로그인 계정 찾기 — 재가입 시 잔여 계정 정리용
create or replace function public.auth_user_id_by_email(p_email text)
returns uuid language sql stable security definer set search_path = public, auth as $$
  select id from auth.users where lower(email) = lower(p_email) limit 1;
$$;
revoke all on function public.auth_user_id_by_email(text) from public, anon, authenticated;
grant execute on function public.auth_user_id_by_email(text) to service_role;

-- (서버 함수 전용) 조직 백데이터 일괄 반영 — 사번해시별 그룹·팀·파트·권한
--   신규 사번은 등록, 기존 근로자·관리자는 소속 갱신, 사업팀·본사 계정은 변경하지 않음
create or replace function public.import_employees(p_rows jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare r jsonb; v_role text; v_cur text; ins int := 0; upd int := 0; skip int := 0;
begin
  for r in select value from jsonb_array_elements(p_rows) loop
    select role into v_cur from public.employees where emp_hash = r->>'emp_hash';
    v_role := nullif(r->>'role', '');
    if v_cur is null then
      insert into public.employees (emp_hash, role, site, dept, part, name_mask)
      values (r->>'emp_hash', coalesce(v_role, 'worker'), r->>'site', nullif(r->>'dept', ''), nullif(r->>'part', ''), nullif(r->>'name_mask', ''));
      ins := ins + 1;
    elsif v_cur in ('team', 'hq') then
      skip := skip + 1;
    else
      update public.employees
         set role = coalesce(v_role, role), site = r->>'site',
             dept = nullif(r->>'dept', ''), part = nullif(r->>'part', ''),
             name_mask = coalesce(nullif(r->>'name_mask', ''), name_mask)
       where emp_hash = r->>'emp_hash';
      upd := upd + 1;
    end if;
  end loop;
  return jsonb_build_object('inserted', ins, 'updated', upd, 'skipped', skip);
end $$;
revoke all on function public.import_employees(jsonb) from public, anon, authenticated;
grant execute on function public.import_employees(jsonb) to service_role;

-- ---------------------------------------------------------------------
-- 6. 자동 처리 트리거
-- ---------------------------------------------------------------------
-- 6-1) 인원: 그룹 → 사업팀 자동 채움, 소속 유효성 검사
create or replace function public.employees_fill_unit()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.role in ('worker','manager') then
    select team into new.team from public.org_sites where site = new.site;
    if new.team is null then raise exception '사업장(그룹)을 올바르게 선택해야 합니다'; end if;
  elsif new.role = 'team' then
    new.site := null; new.dept := null; new.part := null;
    if not exists (select 1 from public.org_sites where team = new.team) then
      raise exception '사업팀을 올바르게 선택해야 합니다';
    end if;
  else
    new.team := null; new.site := null; new.dept := null; new.part := null;
  end if;
  return new;
end $$;

drop trigger if exists trg_employees_fill_unit on public.employees;
create trigger trg_employees_fill_unit
  before insert or update on public.employees
  for each row execute function public.employees_fill_unit();

-- 6-2) 등록: 작성자·소속·상태를 서버가 강제로 채움 (조작 방지)
create or replace function public.reports_before_insert()
returns trigger language plpgsql security definer set search_path = public as $$
declare e public.employees;
begin
  select * into e from public.employees where user_id = auth.uid() and active;
  if not found then raise exception '등록되지 않았거나 사용이 중지된 계정입니다'; end if;

  new.author_id     := auth.uid();
  new.emp_hash      := e.emp_hash;
  new.team          := e.team;
  new.site          := e.site;
  new.dept          := e.dept;
  new.part          := e.part;
  new.status        := 'received';
  new.final_grade   := null;
  new.admin_comment := null;
  new.reviewed_at   := null;
  new.closed_at     := null;
  new.created_at    := now();
  new.updated_at    := now();

  if new.type = 'proposal' then
    if new.proposed_grade is null then raise exception '제안 등급을 선택해야 합니다'; end if;
    if coalesce(btrim(new.location), '') = '' then raise exception '장소를 입력해야 합니다'; end if;
    new.occurred_at := null; new.category := null; new.prevention := null;
  else
    if new.occurred_at is null then raise exception '발생 일시를 입력해야 합니다'; end if;
    if new.occurred_at > now() + interval '5 minutes' then raise exception '발생 일시가 미래입니다'; end if;
    new.proposed_grade := null; new.location := null; new.request := null;
  end if;
  return new;
end $$;

drop trigger if exists trg_reports_before_insert on public.reports;
create trigger trg_reports_before_insert
  before insert on public.reports
  for each row execute function public.reports_before_insert();

-- 6-3) 처리: 결정등급 규칙 적용
--      개선제안을 '조치완료'로 처리할 때 결정등급 필수
--      결정등급 가·나·다 → 상태가 자동으로 '위원회 의결예정(committee)'으로 종료
create or replace function public.reports_before_update()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.type = 'nearmiss' then
    if new.status not in ('received','reviewing','done') then
      raise exception '아차사고는 접수/검토중/조치완료 상태만 사용할 수 있습니다';
    end if;
    new.final_grade := null;
  else
    if new.status in ('done','committee') then
      if new.final_grade is null then raise exception '조치완료 처리 시 결정 등급을 선택해야 합니다'; end if;
      new.status := case when new.final_grade in ('가','나','다') then 'committee' else 'done' end;
    else
      new.final_grade := null;
    end if;
  end if;

  new.updated_at := now();
  if new.status is distinct from old.status
     or new.final_grade is distinct from old.final_grade
     or new.admin_comment is distinct from old.admin_comment then
    new.reviewed_at := now();
  end if;
  if new.status in ('done','committee','rejected') then
    if old.status not in ('done','committee','rejected') or old.closed_at is null then new.closed_at := now(); end if;
  else
    new.closed_at := null;
  end if;
  return new;
end $$;

drop trigger if exists trg_reports_before_update on public.reports;
create trigger trg_reports_before_update
  before update on public.reports
  for each row execute function public.reports_before_update();

-- 6-4) 처리 이력 자동 기록
create or replace function public.reports_after_change()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_code text; v_role text;
begin
  select emp_code, role into v_code, v_role from public.employees where user_id = auth.uid();
  if tg_op = 'INSERT' then
    insert into public.report_logs (report_id, from_status, to_status, comment, changed_by_code, changed_by_role)
    values (new.id, null, new.status, '접수', v_code, v_role);
  elsif new.status is distinct from old.status
        or new.final_grade is distinct from old.final_grade
        or new.admin_comment is distinct from old.admin_comment then
    insert into public.report_logs (report_id, from_status, to_status, final_grade, comment, changed_by_code, changed_by_role)
    values (new.id, old.status, new.status, new.final_grade, new.admin_comment, v_code, v_role);
  end if;
  return null;
end $$;

drop trigger if exists trg_reports_after_change on public.reports;
create trigger trg_reports_after_change
  after insert or update on public.reports
  for each row execute function public.reports_after_change();

-- ---------------------------------------------------------------------
-- 7. 행 단위 보안(RLS)
--    근로자 : 본인 제출건만
--    관리자 : 소속 사업장 전체 / 사업팀 : 소속 팀 전체 / 본사 : 전체
--    인원 등록·변경은 서버 함수(Edge Function)만 가능
-- ---------------------------------------------------------------------
alter table public.org_sites   enable row level security;
alter table public.employees   enable row level security;
alter table public.reports     enable row level security;
alter table public.report_logs enable row level security;

revoke all on public.org_sites, public.employees, public.reports, public.report_logs from anon, authenticated;

-- 서버 함수(service_role)용 권한 — 최근 Supabase 프로젝트는 새 표에 자동으로 권한을 주지 않으므로 명시
grant usage on schema public to service_role, authenticated;
grant all on public.org_sites, public.employees, public.reports, public.report_logs to service_role;
grant usage, select on all sequences in schema public to service_role;

grant select on public.org_sites, public.employees, public.reports, public.report_logs to authenticated;
grant insert (type, proposed_grade, location, category, occurred_at, detail, request, prevention, photo_path)
  on public.reports to authenticated;
grant update (status, final_grade, admin_comment) on public.reports to authenticated;
grant delete on public.reports to authenticated;

drop policy if exists org_select on public.org_sites;
create policy org_select on public.org_sites for select to authenticated using (true);

drop policy if exists emp_select on public.employees;
create policy emp_select on public.employees for select to authenticated
  using (user_id = auth.uid() or public.in_scope(team, site));

drop policy if exists rep_select on public.reports;
create policy rep_select on public.reports for select to authenticated
  using (author_id = auth.uid() or public.in_scope(team, site));

drop policy if exists rep_insert on public.reports;
create policy rep_insert on public.reports for insert to authenticated
  with check (public.is_active_member());

drop policy if exists rep_update on public.reports;
create policy rep_update on public.reports for update to authenticated
  using (public.in_scope(team, site)) with check (public.in_scope(team, site));

drop policy if exists rep_delete on public.reports;
create policy rep_delete on public.reports for delete to authenticated
  using (public.my_role() = 'hq');

drop policy if exists log_select on public.report_logs;
create policy log_select on public.report_logs for select to authenticated
  using (exists (select 1 from public.reports r where r.id = report_id));  -- reports RLS 가 범위를 제한

-- ---------------------------------------------------------------------
-- 8. 사진 저장소 (비공개, 5MB) · 경로: report-photos/{사용자ID}/{파일}.jpg
-- ---------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('report-photos', 'report-photos', false, 5242880, array['image/jpeg','image/png','image/webp'])
on conflict (id) do nothing;

drop policy if exists photo_insert_own on storage.objects;
create policy photo_insert_own on storage.objects for insert to authenticated
  with check (bucket_id = 'report-photos'
              and (storage.foldername(name))[1] = auth.uid()::text
              and public.is_active_member());

drop policy if exists photo_select on storage.objects;
create policy photo_select on storage.objects for select to authenticated
  using (bucket_id = 'report-photos'
         and ((storage.foldername(name))[1] = auth.uid()::text
              or exists (select 1 from public.reports r where r.photo_path = name)));

drop policy if exists photo_delete on storage.objects;
create policy photo_delete on storage.objects for delete to authenticated
  using (bucket_id = 'report-photos'
         and ((storage.foldername(name))[1] = auth.uid()::text or public.my_role() = 'hq'));

-- 완료 확인: 4개 테이블과 사업장 수(13)가 보이면 정상
select 'org_sites' as t, count(*) from public.org_sites
union all select 'employees', count(*) from public.employees
union all select 'reports', count(*) from public.reports
union all select 'report_logs', count(*) from public.report_logs;
