-- =====================================================================
--  안전보건 제안 시스템 v4 · Supabase 데이터베이스 설정
--  사용법: Supabase 대시보드 > SQL Editor > New query 에 이 파일 전체를
--          붙여넣고 [Run] 을 한 번 누르면 됩니다.
--  ※ v1 을 설치했다면 reset.sql 을 먼저 실행하세요. (v2·v3 → v4 는 그대로 실행하면 자동 업그레이드)
--  v4 변경: 조직을 인사 부서코드 기준 트리(org_units)로 관리하고, 모든 조회·처리 권한을
--           본사 > 사업팀 > 그룹 > 팀 > 파트 상하 관계로 판단합니다(관리자는 본인 소속 조직과 그 하위만).
--  ※ 여러 번 실행해도 데이터가 지워지지 않도록 작성되어 있습니다.
-- =====================================================================

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------
-- 1. 조직 구조 (본사 > 사업팀 > 그룹 > 팀 > 파트) — 인사 부서코드 기준 트리
--    본사 PC 콘솔 [백데이터 업로드]에서 인사 명단(부서코드·부서·상위부서)을 올리면 자동으로 채워집니다.
--    path : 최상위부터 자기까지의 부서코드를 '/'로 이은 값 (예: AHA000/AHB000/AHB010/)
--           → 하위 조직 판단은 path 앞부분 일치로 처리
--    team/site/dept/part : 단계별 조직명 (사업팀/그룹/팀/파트). 사업팀이 아닌 최상위 조직은 '본사'로 묶음
-- ---------------------------------------------------------------------
create table if not exists public.org_units (
  code        text primary key check (code ~ '^[A-Za-z0-9-]{1,30}$'),
  name        text not null check (char_length(name) between 1 and 50),
  parent_code text,
  path        text not null,
  depth       int  not null,
  team        text,
  site        text,
  dept        text,
  part        text,
  sort        int  not null default 0,
  active      boolean not null default true,
  updated_at  timestamptz not null default now()
);
create index if not exists org_units_path_idx on public.org_units (path text_pattern_ops);

-- ---------------------------------------------------------------------
-- 2. 인원(사번) — 사번 원문 없이 HMAC 해시만 저장, 이름·연락처 없음
--    role : worker(근로자) / manager(관리자) / team(사업팀) / hq(본사)
--    소속 : org_code(부서코드) — 근로자·관리자·사업팀은 필수, 본사는 선택
--           조직명(team/site/dept/part)과 org_path 는 org_units 에서 자동으로 채워짐
--    권한 범위 : 본사=전체 / 사업팀=소속 사업팀 전체 / 관리자=본인 소속 조직과 그 하위 / 근로자=본인 제출건
-- ---------------------------------------------------------------------
create table if not exists public.employees (
  emp_hash      text primary key,
  emp_code      text generated always as (upper(left(emp_hash, 8))) stored,
  role          text not null default 'worker' check (role in ('worker','manager','team','hq')),
  team          text,
  site          text,
  active        boolean not null default true,
  user_id       uuid unique references auth.users(id) on delete set null,
  created_at    timestamptz not null default now(),
  registered_at timestamptz
);
-- v3 이하에서 업그레이드: 그룹 이름 기준 제약을 없애고 부서코드 기준으로 전환
alter table public.employees drop constraint if exists employees_site_fkey;
alter table public.employees drop constraint if exists employees_unit_chk;
drop table if exists public.org_sites cascade;
alter table public.employees add column if not exists dept text check (char_length(dept) <= 50);
alter table public.employees add column if not exists part text check (char_length(part) <= 50);
-- 성명은 마스킹된 형태(예: 홍*동)만 저장. 원래 성명은 브라우저에서 마스킹 후 전송되며 서버에 저장되지 않음
alter table public.employees add column if not exists name_mask text check (char_length(name_mask) <= 20);
alter table public.employees add column if not exists org_code text references public.org_units(code) on update cascade on delete set null;
alter table public.employees add column if not exists org_path text;
-- 직책 단계 (결재선용): part_lead=SE파트장 / team_lead=SE팀장 / group_lead=그룹장 — 인사명단 직책으로 자동 설정 (직책 원문은 저장하지 않음)
alter table public.employees add column if not exists pos text check (pos in ('part_lead','team_lead','group_lead'));
create index if not exists employees_team_idx on public.employees (team);
create index if not exists employees_path_idx on public.employees (org_path text_pattern_ops);
create index if not exists employees_site_idx on public.employees (site);

-- ---------------------------------------------------------------------
-- 3. 제안·신고
--    개선제안 : 제안등급(가~라), 장소, 상세내용, 조치요청, 사진
--    아차사고 : 발생일시, 장소, 사고유형(선택·추후 등록), 상황설명, 재발방지의견, 사진
--    소속(부서코드·사업팀·그룹·팀·파트)은 작성자의 사번 등록 정보에서 서버가 자동으로 채웁니다.
--    등급 : 가=전사 적용 / 나=사업팀 적용 / 다=그룹 적용 / 라=단순 조치
--    상태 : received 접수 / reviewing 검토중 / rejected 반려 / done 조치완료
--           committee 산업안전보건위원회 의결예정 (결정등급 가·나·다 → 자동 종료)
-- ---------------------------------------------------------------------
create table if not exists public.reports (
  id             uuid primary key default gen_random_uuid(),
  report_no      bigint generated always as identity,
  type           text not null check (type in ('proposal','nearmiss','risk')),
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
alter table public.reports add column if not exists org_code text;
alter table public.reports add column if not exists org_path text;
create index if not exists reports_path_idx on public.reports (org_path text_pattern_ops);
-- 위험성평가 참여: 장소(근무지), 위험요인(category), 내용(detail), 위험정도 상·중·하(risk_level)
--   처리: 검토중 → 반영 완료(done) 시 결정 위험정도(final_risk) 필수
alter table public.reports drop constraint if exists reports_type_check;
alter table public.reports add constraint reports_type_check check (type in ('proposal','nearmiss','risk'));
alter table public.reports add column if not exists risk_level text check (risk_level in ('상','중','하'));
alter table public.reports add column if not exists final_risk text check (final_risk in ('상','중','하'));
alter table public.reports add column if not exists edited_at timestamptz;   -- 작성자가 접수 상태에서 내용을 수정한 마지막 시각
-- 제출 데이터는 사람이 아니라 '제출 당시 소속 조직(부서코드)'에 귀속
--   인원이 퇴직·삭제되어도 식별코드(사번 해시)와 제출 당시 성명(마스킹)은 제출건에 그대로 남음
alter table public.reports drop constraint if exists reports_emp_hash_fkey;
alter table public.reports add column if not exists author_mask text check (char_length(author_mask) <= 20);
-- 접수번호: 그룹 기준 일련번호 (예: 평택-26-0012 = 평택그룹 2026년 12번째) · 제출 순간 정해지고 바뀌지 않는 고유값
alter table public.reports add column if not exists rcpt_no    text;
alter table public.reports add column if not exists rcpt_group text;
alter table public.reports add column if not exists rcpt_year  int;
alter table public.reports add column if not exists rcpt_seq   int;
create unique index if not exists reports_rcpt_no_uq on public.reports (rcpt_no);
create unique index if not exists reports_rcpt_seq_uq on public.reports (rcpt_group, rcpt_year, rcpt_seq);
-- 개선제안 결재선: 1차 SE파트장 → (가·나·다) 2차 SE팀장 → 위원회 의결예정 / (라) 1차에서 조치완료
--   appr_step : 1 · 2 = 결재 진행 단계, null = 결재 없음(종료 · 다른 유형)
--   appr_pos · appr_path : 지금 결재할 사람의 직책 단계와 소속 경로 (없으면 그룹장 · 사업팀 · 본사가 대행)
alter table public.reports add column if not exists appr_step smallint check (appr_step in (1, 2));
alter table public.reports add column if not exists appr_pos  text;
alter table public.reports add column if not exists appr_path text;
create table if not exists public.rcpt_counters (
  grp  text not null,
  yr   int  not null,
  last int  not null default 0,
  primary key (grp, yr)
);

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
-- kind : submit 접수 / process 처리(상태·등급·의견) / edit 작성자 내용 수정
alter table public.report_logs add column if not exists kind text;
-- 결재 기록: 1차 승인 · 2차 상신 · 반려 · 대행 여부 / 처리 직후의 결재 단계 (이력 삭제 시 되돌리기용)
alter table public.report_logs add column if not exists note text;
alter table public.report_logs add column if not exists appr_step smallint;
alter table public.report_logs add column if not exists appr_pos text;
alter table public.report_logs add column if not exists appr_path text;

-- ---------------------------------------------------------------------
-- 4-1. 실명 대조 기록 (PC에서 인사명단과 대조해 실명 엑셀을 만들 때마다 서버 함수가 기록)
--      사번·성명은 기록하지 않고, 누가(식별코드·권한) 언제 몇 명을 대조했는지만 남김
-- ---------------------------------------------------------------------
create table if not exists public.export_logs (
  id          bigint generated always as identity primary key,
  actor_code  text,
  actor_role  text,
  kind        text,
  requested   int,
  matched     int,
  created_at  timestamptz not null default now()
);

-- 4-2. 조직·인원 백데이터 반영 이력 (본사 콘솔 업로드 1회 = 1행, 본사만 열람)
create table if not exists public.import_logs (
  id              bigint generated always as identity primary key,
  batch_id        uuid not null unique,
  created_at      timestamptz not null default now(),   -- 반영 시작
  finished_at     timestamptz not null default now(),   -- 마지막 반영
  actor_code      text,                                 -- 반영한 본사 계정 식별코드
  file_name       text check (char_length(file_name) <= 120),
  file_rows       int not null default 0,               -- 파일에서 읽은 반영 대상 인원
  client_invalid  int not null default 0,               -- 화면 검증 오류 행
  units_sent      int not null default 0,               -- 신규·변경 조직 단위
  units_total     int not null default 0,               -- 반영 후 전체 조직 단위
  emp_inserted    int not null default 0,               -- 신규 등록
  emp_updated     int not null default 0,               -- 소속·권한 갱신
  server_invalid  int not null default 0,               -- 서버 검증 오류
  emp_total       int not null default 0                -- 반영 후 전체 인원(사용 중)
);
create index if not exists import_logs_created_idx on public.import_logs (created_at desc);

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

-- 내 관리 범위 안의 조직인가? (본사=전체, 사업팀=소속 사업팀 전체, 관리자=본인 소속 조직과 그 하위)
--   p_path : 대상(제출건·인원)의 조직 경로. 경로 앞부분이 같으면 하위 조직
create or replace function public.in_scope(p_path text)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.employees e
     where e.user_id = auth.uid() and e.active and (
           e.role = 'hq'
        or (e.role = 'team' and p_path is not null and e.org_path is not null
            and left(p_path, length(split_part(e.org_path, '/', 1)) + 1) = split_part(e.org_path, '/', 1) || '/')
        or (e.role = 'manager' and p_path is not null and e.org_path is not null
            and left(p_path, length(e.org_path)) = e.org_path)));
$$;

-- (서버 함수 전용) 가상 로그인 ID 로 로그인 계정 찾기 — 재가입 시 잔여 계정 정리용
create or replace function public.auth_user_id_by_email(p_email text)
returns uuid language sql stable security definer set search_path = public, auth as $$
  select id from auth.users where lower(email) = lower(p_email) limit 1;
$$;
revoke all on function public.auth_user_id_by_email(text) from public, anon, authenticated;
grant execute on function public.auth_user_id_by_email(text) to service_role;

-- (서버 함수 전용) 조직 트리 반영 — 서버 함수가 경로·단계별 이름을 계산해서 넘김
--   기존 부서코드는 이름·상위·경로를 갱신, 새 부서코드는 추가. 소속 인원의 조직명도 함께 갱신
create or replace function public.import_org(p_units jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare n int;
begin
  insert into public.org_units (code, name, parent_code, path, depth, team, site, dept, part, sort, active, updated_at)
  select u->>'code', u->>'name', nullif(u->>'parent_code', ''), u->>'path', (u->>'depth')::int,
         nullif(u->>'team', ''), nullif(u->>'site', ''), nullif(u->>'dept', ''), nullif(u->>'part', ''), coalesce((u->>'sort')::int, 0), true, now()
    from jsonb_array_elements(p_units) u
  on conflict (code) do update set name = excluded.name, parent_code = excluded.parent_code, path = excluded.path, depth = excluded.depth,
    team = excluded.team, site = excluded.site, dept = excluded.dept, part = excluded.part, sort = excluded.sort, active = true, updated_at = now();
  get diagnostics n = row_count;
  update public.employees e set team = o.team, site = o.site, dept = o.dept, part = o.part, org_path = o.path
    from public.org_units o where e.org_code = o.code
     and (e.org_path is distinct from o.path or e.team is distinct from o.team or e.site is distinct from o.site
          or e.dept is distinct from o.dept or e.part is distinct from o.part);
  -- 제출건(reports)은 건드리지 않음: 제출 데이터는 최초 등록한 부서(제출 당시 조직)에 그대로 남음
  return jsonb_build_object('units', n);
end $$;
revoke all on function public.import_org(jsonb) from public, anon, authenticated;
grant execute on function public.import_org(jsonb) to service_role;

-- 사업팀 소속 '지원그룹'(1~4지원그룹 등) 또는 그 하위 부서인가? → 소속 인원은 전부 사업팀 권한
create or replace function public.is_support_unit(p_code text)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.org_units me, public.org_units o
     where me.code = p_code
       and left(me.path, length(o.path)) = o.path
       and o.name ~ '지원그룹$'
       and coalesce(o.team, '본사') <> '본사');
$$;

revoke all on function public.is_support_unit(text) from public, anon, authenticated;
grant execute on function public.is_support_unit(text) to service_role;

-- (서버 함수 전용) 인원 일괄 반영 — 사번해시별 부서코드·성명(마스킹)·권한
--   신규 사번은 등록, 기존 인원은 소속(부서코드)·권한 갱신 (권한은 직책 기준으로 화면에서 계산해 전달)
--   본사(hq) 계정의 권한은 바꾸지 않고, 업로드로 본사 권한을 줄 수도 없음
drop function if exists public.import_employees(jsonb);
create or replace function public.import_employees(p_rows jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare r jsonb; v_role text; v_cur text; ins int := 0; upd int := 0;
begin
  for r in select value from jsonb_array_elements(p_rows) loop
    select role into v_cur from public.employees where emp_hash = r->>'emp_hash';
    v_role := nullif(r->>'role', '');
    if v_role not in ('worker', 'manager', 'team') then v_role := null; end if;
    if public.is_support_unit(r->>'org_code') then v_role := 'team'; end if;   -- 지원그룹 인원은 직책과 관계없이 사업팀
    if v_cur is null then
      insert into public.employees (emp_hash, role, org_code, name_mask, pos)
      values (r->>'emp_hash', coalesce(v_role, 'worker'), r->>'org_code', nullif(r->>'name_mask', ''),
              case when r->>'pos' in ('part_lead','team_lead','group_lead') then r->>'pos' end);
      ins := ins + 1;
    else
      update public.employees
         set org_code  = r->>'org_code',
             role      = case when v_cur = 'hq' then role else coalesce(v_role, role) end,
             name_mask = coalesce(nullif(r->>'name_mask', ''), name_mask),
             pos       = case when not (r ? 'pos') then pos   -- 직책 정보가 없는 업로드(구버전)면 그대로
                              when r->>'pos' in ('part_lead','team_lead','group_lead') then r->>'pos' else null end
       where emp_hash = r->>'emp_hash';
      upd := upd + 1;
    end if;
  end loop;
  perform public.refresh_approvers();   -- 직책 · 소속이 바뀌었으면 결재 대기 건의 결재자도 다시 찾기
  return jsonb_build_object('inserted', ins, 'updated', upd, 'skipped', 0);
end $$;
revoke all on function public.import_employees(jsonb) from public, anon, authenticated;
grant execute on function public.import_employees(jsonb) to service_role;

-- (서버 함수 전용) 백데이터 반영 이력 기록 — 500명씩 나눠 보내도 업로드 1회(batch_id)당 1행으로 누적
create or replace function public.log_import(p jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare r public.import_logs;
begin
  insert into public.import_logs as l (batch_id, actor_code, file_name, file_rows, client_invalid, units_sent, units_total,
                                       emp_inserted, emp_updated, server_invalid, emp_total)
  values ((p->>'batch_id')::uuid, nullif(p->>'actor_code', ''), left(nullif(p->>'file_name', ''), 120),
          coalesce((p->>'file_rows')::int, 0), coalesce((p->>'client_invalid')::int, 0), coalesce((p->>'units_sent')::int, 0),
          (select count(*) from public.org_units),
          coalesce((p->>'emp_inserted')::int, 0), coalesce((p->>'emp_updated')::int, 0), coalesce((p->>'server_invalid')::int, 0),
          (select count(*) from public.employees where active))
  on conflict (batch_id) do update set
    finished_at    = now(),
    units_sent     = greatest(l.units_sent, excluded.units_sent),
    units_total    = excluded.units_total,
    emp_inserted   = l.emp_inserted + excluded.emp_inserted,
    emp_updated    = l.emp_updated + excluded.emp_updated,
    server_invalid = l.server_invalid + excluded.server_invalid,
    emp_total      = excluded.emp_total
  returning * into r;
  return to_jsonb(r);
end $$;
revoke all on function public.log_import(jsonb) from public, anon, authenticated;
grant execute on function public.log_import(jsonb) to service_role;

-- ---------------------------------------------------------------------
-- 6. 자동 처리 트리거
-- ---------------------------------------------------------------------
-- 6-1) 인원: 부서코드 → 사업팀·그룹·팀·파트 이름과 조직 경로 자동 채움
create or replace function public.employees_fill_unit()
returns trigger language plpgsql security definer set search_path = public as $$
declare o public.org_units;
begin
  if new.org_code is not null then
    select * into o from public.org_units where code = new.org_code;
    if not found then raise exception '등록되지 않은 부서코드입니다: %', new.org_code; end if;
    new.team := o.team; new.site := o.site; new.dept := o.dept; new.part := o.part; new.org_path := o.path;
  elsif new.role = 'hq' then
    new.team := null; new.site := null; new.dept := null; new.part := null; new.org_path := null;
  elsif tg_op = 'INSERT' or new.role is distinct from old.role then
    raise exception '소속 조직을 선택해야 합니다';
  end if;
  return new;
end $$;

drop trigger if exists trg_employees_fill_unit on public.employees;
create trigger trg_employees_fill_unit
  before insert or update on public.employees
  for each row execute function public.employees_fill_unit();

-- 6-1b) 접수번호 · 결재선 도움 함수
create or replace function public.rcpt_label(p_site text, p_team text)
returns text language sql immutable as $$
  select case when nullif(regexp_replace(btrim(coalesce(p_site, '')), '그룹$', ''), '') is not null then regexp_replace(btrim(p_site), '그룹$', '')
              when nullif(btrim(coalesce(p_team, '')), '') is not null and btrim(p_team) <> '본사' then btrim(p_team)
              else '본사' end
$$;
create or replace function public.pos_level(p text) returns int language sql immutable as $$
  select case p when 'part_lead' then 1 when 'team_lead' then 2 when 'group_lead' then 3 end
$$;
create or replace function public.pos_label(p text) returns text language sql immutable as $$
  select case p when 'part_lead' then 'SE파트장' when 'team_lead' then 'SE팀장' when 'group_lead' then '그룹장' else '그룹장 · 사업팀 · 본사' end
$$;
-- 결재자 찾기: 제출건 소속 경로를 포함하는 가장 가까운 결재자 (p_from 단계 이상, 작성자 본인 제외)
--   SE파트장이 없으면 SE팀장, SE팀장도 없으면 그룹장이 결재 · 아무도 없으면 null (그룹장 · 사업팀 · 본사가 대행)
create or replace function public.pick_approver(p_path text, p_author text, p_from int)
returns text[] language sql stable security definer set search_path = public as $$
  select array[e.pos, e.org_path] from public.employees e
   where e.active and e.pos is not null and public.pos_level(e.pos) >= p_from and e.org_path is not null
     and left(coalesce(p_path, ''), length(e.org_path)) = e.org_path and e.emp_hash is distinct from p_author
   order by public.pos_level(e.pos), length(e.org_path) desc limit 1
$$;
revoke all on function public.pick_approver(text, text, int) from public, anon;
grant execute on function public.pick_approver(text, text, int) to authenticated;
-- 결재 대기 건의 결재자 다시 찾기: 결재자가 없거나(직책 미등록) 퇴직 · 직책 변경 · 조직 개편으로 사라진 경우
--   인원 백데이터 반영 직후와 이 파일 실행 시 자동 호출 (서버 전용)
create or replace function public.refresh_approvers()
returns int language plpgsql security definer set search_path = public as $$
declare r record; v_ap text[]; n int := 0;
begin
  perform set_config('ehs.org_sync', '1', true);
  for r in select id, org_path, emp_hash, appr_step, appr_pos, appr_path from public.reports x
            where x.type = 'proposal' and x.appr_step is not null
              and not exists (select 1 from public.employees e where e.active and e.pos = x.appr_pos and e.org_path = x.appr_path) loop
    v_ap := public.pick_approver(r.org_path, r.emp_hash, case when r.appr_step = 2 then 2 else 1 end);
    if v_ap[1] is distinct from r.appr_pos or v_ap[2] is distinct from r.appr_path then
      update public.reports set appr_pos = v_ap[1], appr_path = v_ap[2] where id = r.id; n := n + 1;
    end if;
  end loop;
  perform set_config('ehs.org_sync', '', true);
  return n;
end $$;
revoke all on function public.refresh_approvers() from public, anon, authenticated;

-- 6-2) 등록: 작성자·소속·상태를 서버가 강제로 채움 (조작 방지)
create or replace function public.reports_before_insert()
returns trigger language plpgsql security definer set search_path = public as $$
declare e public.employees; v_lbl text; v_yr int; v_seq int; v_ap text[];
begin
  select * into e from public.employees where user_id = auth.uid() and active;
  if not found then raise exception '등록되지 않았거나 사용이 중지된 계정입니다'; end if;

  new.author_id     := auth.uid();
  new.emp_hash      := e.emp_hash;
  new.team          := e.team;
  new.site          := e.site;
  new.dept          := e.dept;
  new.part          := e.part;
  new.org_code      := e.org_code;
  new.org_path      := e.org_path;
  new.author_mask   := e.name_mask;
  new.status        := 'received';
  new.final_grade   := null;
  new.admin_comment := null;
  new.reviewed_at   := null;
  new.closed_at     := null;
  new.created_at    := now();
  new.updated_at    := now();

  if coalesce(btrim(new.location), '') = '' then raise exception '장소를 입력해야 합니다'; end if;
  new.final_risk := null;
  if new.type = 'proposal' then
    if new.proposed_grade is null then raise exception '제안 등급을 선택해야 합니다'; end if;
    new.occurred_at := null; new.category := null; new.prevention := null; new.risk_level := null;
  elsif new.type = 'risk' then
    if new.risk_level is null then raise exception '위험정도(상·중·하)를 선택해야 합니다'; end if;
    new.proposed_grade := null; new.occurred_at := null; new.request := null; new.prevention := null;
  else
    new.risk_level := null;
    if new.occurred_at is null then raise exception '발생 일시를 입력해야 합니다'; end if;
    if new.occurred_at > now() + interval '5 minutes' then raise exception '발생 일시가 미래입니다'; end if;
    new.proposed_grade := null; new.request := null;
  end if;
  -- 접수번호: 그룹 기준 · 연도별 일련번호 (동시에 여러 건이 와도 번호가 겹치지 않음)
  v_lbl := public.rcpt_label(e.site, e.team);
  v_yr  := extract(year from (now() at time zone 'Asia/Seoul'))::int;
  insert into public.rcpt_counters as c (grp, yr, last) values (v_lbl, v_yr, 1)
    on conflict (grp, yr) do update set last = c.last + 1 returning c.last into v_seq;
  new.rcpt_group := v_lbl; new.rcpt_year := v_yr; new.rcpt_seq := v_seq;
  new.rcpt_no := v_lbl || '-' || lpad((v_yr % 100)::text, 2, '0') || '-' || lpad(v_seq::text, 4, '0');
  -- 결재선: 개선제안은 1차(SE파트장)부터
  if new.type = 'proposal' then
    new.appr_step := 1; v_ap := public.pick_approver(e.org_path, e.emp_hash, 1); new.appr_pos := v_ap[1]; new.appr_path := v_ap[2];
  else
    new.appr_step := null; new.appr_pos := null; new.appr_path := null;
  end if;
  return new;
end $$;

drop trigger if exists trg_reports_before_insert on public.reports;
create trigger trg_reports_before_insert
  before insert on public.reports
  for each row execute function public.reports_before_insert();

-- 6-3) 처리: 결정등급 · 결재선 규칙 적용
--      개선제안: 1차 SE파트장이 결정등급 확정 → 라 = 조치완료 / 가·나·다 = 2차 SE팀장 → 승인 시 '위원회 의결예정(committee)'
--      어느 단계에서든 반려 가능 · 지금 차례가 아닌 사람은 그룹장 · 사업팀 · 본사만 대행 (이력에 '대행' 표시)
create or replace function public.reports_before_update()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_staff boolean; v_author boolean; v_content boolean; v_proc boolean;
        v_me public.employees; v_desig boolean; v_proxy boolean; v_step int; v_note text; v_ap text[]; v_revert boolean;
begin
  v_revert := current_setting('ehs.revert', true) = '1';   -- 이력 삭제로 직전 단계 되돌리기 (delete_report_log 안에서만)
  -- 접수번호는 어떤 경우에도 바뀌지 않음 (최초 부여 이후)
  if old.rcpt_no is not null then
    new.rcpt_no := old.rcpt_no; new.rcpt_group := old.rcpt_group; new.rcpt_year := old.rcpt_year; new.rcpt_seq := old.rcpt_seq;
  end if;
  -- 서버 내부 정리 작업(제출 당시 성명 채우기)만 허용 — 그 외 항목·수정시각은 그대로
  if auth.uid() is null and current_setting('ehs.org_sync', true) = '1' then
    new.team := old.team; new.site := old.site; new.dept := old.dept; new.part := old.part;
    new.org_code := old.org_code; new.org_path := old.org_path; new.emp_hash := old.emp_hash;
    return new;
  end if;
  -- 작성자 수정 / 관리자 처리 구분
  --   작성자 : 결재(검토중 포함) 전, 즉 '접수' 상태에서만 내용 수정 가능 · 처리 항목은 바꿀 수 없음
  --   관리자 : 상태 · 등급 · 위험정도 · 처리 의견만 바꿀 수 있음 (내용은 바꿀 수 없음)
  v_staff  := auth.uid() is null or public.in_scope(old.org_path);   -- auth.uid() 없음 = 서버 내부 처리
  v_author := auth.uid() is not null and auth.uid() = old.author_id;
  v_content := new.location is distinct from old.location or new.category is distinct from old.category or new.occurred_at is distinct from old.occurred_at
            or new.detail is distinct from old.detail or new.request is distinct from old.request or new.prevention is distinct from old.prevention
            or new.proposed_grade is distinct from old.proposed_grade or new.risk_level is distinct from old.risk_level or new.photo_path is distinct from old.photo_path;
  v_proc := new.status is distinct from old.status or new.final_grade is distinct from old.final_grade
         or new.final_risk is distinct from old.final_risk or new.admin_comment is distinct from old.admin_comment;
  if v_content then
    if not v_author then raise exception '제출 내용은 작성자만 수정할 수 있습니다'; end if;
    if old.status <> 'received' then raise exception '검토가 시작된 건은 수정할 수 없습니다'; end if;
    if v_proc then raise exception '내용 수정과 처리를 함께 할 수 없습니다'; end if;
    if coalesce(btrim(new.location), '') = '' then raise exception '장소를 입력해야 합니다'; end if;
    if char_length(coalesce(new.detail, '')) < 5 then raise exception '내용을 5자 이상 작성해야 합니다'; end if;
    if new.type = 'proposal' and new.proposed_grade is null then raise exception '제안 등급을 선택해야 합니다'; end if;
    if new.type = 'risk' and new.risk_level is null then raise exception '위험정도(상·중·하)를 선택해야 합니다'; end if;
    if new.type = 'nearmiss' and (new.occurred_at is null or new.occurred_at > now() + interval '5 minutes') then raise exception '발생 일시를 확인해야 합니다'; end if;
    if new.type <> 'proposal' then new.proposed_grade := null; new.request := case when new.type = 'proposal' then new.request else null end; end if;
    if new.type <> 'risk' then new.risk_level := null; end if;
    if new.type <> 'nearmiss' then new.occurred_at := null; new.prevention := null; end if;
    if new.type = 'proposal' then new.category := null; end if;
    new.type := old.type; new.created_at := old.created_at; new.author_id := old.author_id; new.emp_hash := old.emp_hash;
    new.team := old.team; new.site := old.site; new.dept := old.dept; new.part := old.part; new.org_code := old.org_code; new.org_path := old.org_path;
    new.author_mask := old.author_mask;
    new.appr_step := old.appr_step; new.appr_pos := old.appr_pos; new.appr_path := old.appr_path;
    new.edited_at := now(); new.updated_at := now();
    return new;
  end if;
  if v_proc and not v_staff then raise exception '처리 권한이 없습니다'; end if;
  new.edited_at := old.edited_at;

  -- 제출 당시 작성자·소속은 고정: 작성자의 부서 이동·퇴직·삭제, 관리자 변경, 조직 개편과 관계없이 최초 등록한 부서에 남음
  new.type := old.type; new.created_at := old.created_at;
  if new.author_id is not null then new.author_id := old.author_id; end if; -- 계정 삭제 시 연결만 끊는 것은 허용
  new.team := old.team; new.site := old.site; new.dept := old.dept; new.part := old.part;
  new.org_code := old.org_code; new.org_path := old.org_path;
  new.emp_hash := old.emp_hash; new.author_mask := old.author_mask;     -- 식별코드·제출 당시 성명은 영구 보존 (인원 삭제와 무관)
  new.risk_level := old.risk_level;
  if not v_revert then new.appr_step := old.appr_step; new.appr_pos := old.appr_pos; new.appr_path := old.appr_path; end if;
  if new.type <> 'proposal' then new.appr_step := null; new.appr_pos := null; new.appr_path := null; end if;
  if new.type = 'nearmiss' then
    if new.status not in ('received','reviewing','done') then
      raise exception '아차사고는 접수/검토중/조치완료 상태만 사용할 수 있습니다';
    end if;
    new.final_grade := null; new.final_risk := null;
  elsif new.type = 'risk' then
    if new.status not in ('received','reviewing','done') then
      raise exception '위험성평가는 검토중/반영 완료 상태만 사용할 수 있습니다';
    end if;
    new.final_grade := null;
    if new.status = 'done' then
      if new.final_risk is null then raise exception '반영 완료 시 위험정도(상·중·하)를 선택해야 합니다'; end if;
    else
      new.final_risk := null;
    end if;
  else
    new.final_risk := null;
    if v_revert then
      null;   -- 되돌리기: delete_report_log 가 지정한 상태 · 등급 · 결재 단계 그대로
    elsif v_proc then
      -- 결재 권한: 지금 차례의 결재자(직책 단계 + 소속) 또는 대행(그룹장 · 사업팀 · 본사 · 서버)
      select * into v_me from public.employees where user_id = auth.uid();
      v_desig := old.appr_step is not null and v_me.pos is not null and v_me.pos = old.appr_pos and v_me.org_path = old.appr_path;
      v_proxy := auth.uid() is null or v_me.role in ('team','hq') or v_me.pos = 'group_lead';
      if old.appr_step is null and old.status in ('done','committee','rejected') and not v_proxy then
        raise exception '결재가 끝난 건은 그룹장 · 사업팀 · 본사만 다시 열 수 있습니다';
      end if;
      if old.appr_step is not null and not (v_desig or v_proxy) then
        raise exception '지금은 %차 결재(%) 차례입니다', old.appr_step, public.pos_label(old.appr_pos);
      end if;
      v_step := coalesce(old.appr_step, 1);
      if old.appr_step is null and old.status in ('done','committee','rejected') and new.status = old.status then
        new.final_grade := old.final_grade; v_note := '처리 의견 수정';   -- 결재가 끝난 건: 의견만 고침 (상태 · 등급 그대로)
      elsif new.status in ('received','reviewing') then
        if old.appr_step is null and old.status in ('done','committee','rejected') then   -- 다시 열기 → 1차부터
          new.status := 'reviewing'; new.final_grade := null; new.appr_step := 1;
          v_ap := public.pick_approver(old.org_path, old.emp_hash, 1); new.appr_pos := v_ap[1]; new.appr_path := v_ap[2];
          v_note := '다시 열기 · 1차 결재';
        elsif v_step = 2 then
          new.status := 'reviewing'; new.final_grade := coalesce(new.final_grade, old.final_grade); v_note := '2차 검토';
        else
          new.final_grade := null; v_note := '1차 검토';
        end if;
      elsif new.status = 'rejected' then
        new.final_grade := null; new.appr_step := null; new.appr_pos := null; new.appr_path := null; v_note := v_step || '차 반려';
      else   -- 승인 (done · committee)
        if new.final_grade is null then raise exception '결재 시 결정 등급을 선택해야 합니다'; end if;
        if new.final_grade = '라' then
          new.status := 'done'; new.appr_step := null; new.appr_pos := null; new.appr_path := null; v_note := v_step || '차 승인 · 조치완료(라 등급)';
        elsif v_step = 1 and coalesce(public.pos_level(old.appr_pos), 1) >= 2 then
          -- SE파트장이 없어 SE팀장(이상)이 1차를 맡은 경우: 같은 단계 결재를 두 번 받지 않고 바로 위원회 의결예정
          new.status := 'committee'; new.appr_step := null; new.appr_pos := null; new.appr_path := null;
          v_note := '1차 승인(' || public.pos_label(old.appr_pos) || ') · 위원회 의결예정';
        elsif v_step = 1 then
          new.status := 'reviewing'; new.appr_step := 2;
          v_ap := public.pick_approver(old.org_path, old.emp_hash, 2);
          new.appr_pos := v_ap[1]; new.appr_path := v_ap[2]; v_note := '1차 승인 · 2차 결재(' || public.pos_label(v_ap[1]) || ') 상신';
        else
          new.status := 'committee'; new.appr_step := null; new.appr_pos := null; new.appr_path := null; v_note := '2차 승인 · 위원회 의결예정';
        end if;
      end if;
      if auth.uid() is not null and not v_desig and old.appr_step is not null then v_note := v_note || ' · 대행'; end if;
      perform set_config('ehs.appr_note', v_note, true);
    end if;
  end if;

  new.updated_at := now();
  if new.status is distinct from old.status
     or new.final_grade is distinct from old.final_grade
     or new.final_risk is distinct from old.final_risk
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
  if current_setting('ehs.skip_log', true) = '1' then return null; end if;   -- 이력 삭제로 되돌릴 때는 기록하지 않음
  if auth.uid() is null and current_setting('ehs.org_sync', true) = '1' then return null; end if;   -- 서버 정리 작업은 기록하지 않음
  select emp_code, role into v_code, v_role from public.employees where user_id = auth.uid();
  if tg_op = 'INSERT' then
    insert into public.report_logs (report_id, from_status, to_status, comment, changed_by_code, changed_by_role, kind, appr_step, appr_pos, appr_path)
    values (new.id, null, new.status, '접수', v_code, v_role, 'submit', new.appr_step, new.appr_pos, new.appr_path);
  elsif new.edited_at is distinct from old.edited_at then
    insert into public.report_logs (report_id, from_status, to_status, comment, changed_by_code, changed_by_role, kind)
    values (new.id, old.status, new.status, '작성자가 내용을 수정했습니다', v_code, v_role, 'edit');
  elsif new.status is distinct from old.status
        or new.final_grade is distinct from old.final_grade
        or new.final_risk is distinct from old.final_risk
        or new.admin_comment is distinct from old.admin_comment
        or new.appr_step is distinct from old.appr_step then
    insert into public.report_logs (report_id, from_status, to_status, final_grade, comment, changed_by_code, changed_by_role, kind, note, appr_step, appr_pos, appr_path)
    values (new.id, old.status, new.status, coalesce(new.final_grade, new.final_risk), new.admin_comment, v_code, v_role, 'process',
            nullif(current_setting('ehs.appr_note', true), ''), new.appr_step, new.appr_pos, new.appr_path);
    perform set_config('ehs.appr_note', '', true);
  end if;
  return null;
end $$;

drop trigger if exists trg_reports_after_change on public.reports;
create trigger trg_reports_after_change
  after insert or update on public.reports
  for each row execute function public.reports_after_change();

-- 6-5) 처리 이력 삭제 (관리자 이상 · 관리 범위 안)
--      가장 최근 처리 이력을 지우면 제출건의 상태 · 등급 · 위험정도 · 처리 의견을 직전 단계로 되돌림
--      ('검토중'을 지우면 다시 '접수' → 작성자가 다시 수정 가능). 최초 '접수' 기록은 지울 수 없음
create or replace function public.delete_report_log(p_log_id bigint)
returns public.reports language plpgsql security definer set search_path = public as $$
declare l public.report_logs; r public.reports; latest bigint; prev public.report_logs; sub public.report_logs; v_role text;
begin
  select * into l from public.report_logs where id = p_log_id;
  if not found then raise exception '이력을 찾을 수 없습니다'; end if;
  select * into r from public.reports where id = l.report_id;
  v_role := public.my_role();
  if v_role is null or v_role = 'worker' or not public.in_scope(r.org_path) then raise exception '이력을 삭제할 권한이 없습니다'; end if;
  if coalesce(l.kind, case when l.from_status is null then 'submit' else 'process' end) = 'submit' then raise exception '최초 접수 기록은 삭제할 수 없습니다'; end if;
  -- 결재선이 적용된 개선제안: 결재를 되돌리는 것이므로 그룹장 · 사업팀 · 본사만
  if r.type = 'proposal' and r.rcpt_no is not null and v_role not in ('team','hq')
     and coalesce((select pos from public.employees where user_id = auth.uid()), '') <> 'group_lead' then
    raise exception '개선제안 결재 이력은 그룹장 · 사업팀 · 본사만 삭제할 수 있습니다';
  end if;
  select max(id) into latest from public.report_logs
   where report_id = r.id and coalesce(kind, case when from_status is null then 'submit' else 'process' end) = 'process';
  delete from public.report_logs where id = l.id;
  if l.id = latest and coalesce(l.kind, 'process') = 'process' then
    select * into prev from public.report_logs
     where report_id = r.id and id < l.id and coalesce(kind, case when from_status is null then 'submit' else 'process' end) = 'process'
     order by id desc limit 1;
    select * into sub from public.report_logs
     where report_id = r.id and coalesce(kind, case when from_status is null then 'submit' else 'process' end) = 'submit' order by id limit 1;
    perform set_config('ehs.skip_log', '1', true);
    perform set_config('ehs.revert', '1', true);
    update public.reports set
      status        = coalesce(l.from_status, 'received'),
      final_grade   = case when r.type = 'proposal' then prev.final_grade end,
      final_risk    = case when r.type = 'risk' then prev.final_grade end,
      admin_comment = prev.comment,
      appr_step     = case when r.type <> 'proposal' then null when prev.id is not null then prev.appr_step else coalesce(sub.appr_step, 1) end,
      appr_pos      = case when r.type <> 'proposal' then null when prev.id is not null then prev.appr_pos else sub.appr_pos end,
      appr_path     = case when r.type <> 'proposal' then null when prev.id is not null then prev.appr_path else sub.appr_path end
     where id = r.id returning * into r;
    perform set_config('ehs.revert', '', true);
    perform set_config('ehs.skip_log', '', true);
  end if;
  return r;
end $$;
revoke all on function public.delete_report_log(bigint) from public, anon;
grant execute on function public.delete_report_log(bigint) to authenticated;

-- 6-5) 이미 등록된 인원 바로잡기: 사업팀 소속 지원그룹 인원은 사업팀 권한 (본사 계정 제외)
--      이 파일을 다시 실행할 때마다 적용되므로, 업로드를 다시 하지 않아도 정리됨
update public.employees e set role = 'team'
 where e.role in ('worker', 'manager') and e.org_code is not null and public.is_support_unit(e.org_code);

-- ---------------------------------------------------------------------
-- 7. 행 단위 보안(RLS)
--    근로자 : 본인 제출건만
--    관리자 : 본인 소속 조직과 그 하위 / 사업팀 : 소속 사업팀 전체 / 본사 : 전체
--    인원 등록·변경은 서버 함수(Edge Function)만 가능
-- ---------------------------------------------------------------------
alter table public.org_units   enable row level security;
alter table public.employees   enable row level security;
alter table public.reports     enable row level security;
alter table public.report_logs enable row level security;
alter table public.export_logs enable row level security;
alter table public.import_logs enable row level security;
alter table public.rcpt_counters enable row level security;   -- 정책 없음 = 앱에서 직접 접근 불가 (트리거만 사용)
revoke all on public.rcpt_counters from anon, authenticated;

revoke all on public.org_units, public.employees, public.reports, public.report_logs from anon, authenticated;

-- 서버 함수(service_role)용 권한 — 최근 Supabase 프로젝트는 새 표에 자동으로 권한을 주지 않으므로 명시
grant usage on schema public to service_role, authenticated;
grant all on public.org_units, public.employees, public.reports, public.report_logs, public.export_logs, public.import_logs to service_role;
revoke all on public.export_logs, public.import_logs from anon, authenticated;
grant select on public.export_logs, public.import_logs to authenticated;
grant usage, select on all sequences in schema public to service_role;

grant select on public.org_units, public.employees, public.reports, public.report_logs to authenticated;
grant insert (type, proposed_grade, location, category, occurred_at, detail, request, prevention, photo_path, risk_level)
  on public.reports to authenticated;
grant update (status, final_grade, final_risk, admin_comment,
              location, category, occurred_at, detail, request, prevention, proposed_grade, risk_level) on public.reports to authenticated;
grant delete on public.reports to authenticated;

drop policy if exists org_select on public.org_units;
create policy org_select on public.org_units for select to authenticated
  using (public.my_role() in ('manager', 'team', 'hq'));   -- 근로자에게는 조직표를 보여주지 않음

drop policy if exists emp_select on public.employees;
create policy emp_select on public.employees for select to authenticated
  using (user_id = auth.uid() or public.in_scope(org_path));

drop policy if exists rep_select on public.reports;
create policy rep_select on public.reports for select to authenticated
  using (author_id = auth.uid() or public.in_scope(org_path));

drop policy if exists rep_insert on public.reports;
create policy rep_insert on public.reports for insert to authenticated
  with check (public.is_active_member());

drop policy if exists rep_update on public.reports;
create policy rep_update on public.reports for update to authenticated
  using (public.in_scope(org_path)) with check (public.in_scope(org_path));

-- 작성자: 결재 전('접수' 상태) 본인 제출건 내용 수정
drop policy if exists rep_update_own on public.reports;
create policy rep_update_own on public.reports for update to authenticated
  using (author_id = auth.uid() and status = 'received') with check (author_id = auth.uid());

drop policy if exists rep_delete on public.reports;
create policy rep_delete on public.reports for delete to authenticated
  using (public.my_role() = 'hq');

drop policy if exists log_select on public.report_logs;
create policy log_select on public.report_logs for select to authenticated
  using (exists (select 1 from public.reports r where r.id = report_id));  -- reports RLS 가 범위를 제한

drop policy if exists exp_select on public.export_logs;
create policy exp_select on public.export_logs for select to authenticated using (public.my_role() = 'hq');   -- 대조 기록은 본사만 열람
drop policy if exists imp_select on public.import_logs;
create policy imp_select on public.import_logs for select to authenticated using (public.my_role() = 'hq');   -- 백데이터 반영 이력은 본사만 열람

drop function if exists public.in_scope(text, text);   -- v3 이하의 이름 기준 범위 함수 정리

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

-- ---------------------------------------------------------------------
-- 9. 기존 제출건 정리 (다시 실행해도 안전)
--    · 제출 당시 성명(마스킹)이 비어 있는 건만 현재 인원 정보로 채움 (소속·경로는 바꾸지 않음)
-- ---------------------------------------------------------------------
select set_config('ehs.org_sync', '1', false);
update public.reports r set author_mask = e.name_mask
  from public.employees e where r.emp_hash = e.emp_hash and r.author_mask is null and e.name_mask is not null;
select set_config('ehs.org_sync', '', false);
--    · 접수번호가 없는 기존 건: 그룹별 · 연도별로 제출 순서대로 번호 부여
--    · 진행 중(접수 · 검토중)인 개선제안: 1차 결재(SE파트장)부터
do $$
declare r record; v_lbl text; v_yr int; v_seq int; v_ap text[];
begin
  perform set_config('ehs.org_sync', '1', true);
  for r in select id, site, team, created_at from public.reports where rcpt_no is null order by created_at, report_no loop
    v_lbl := public.rcpt_label(r.site, r.team);
    v_yr  := extract(year from (r.created_at at time zone 'Asia/Seoul'))::int;
    insert into public.rcpt_counters as c (grp, yr, last) values (v_lbl, v_yr, 1)
      on conflict (grp, yr) do update set last = c.last + 1 returning c.last into v_seq;
    update public.reports set rcpt_group = v_lbl, rcpt_year = v_yr, rcpt_seq = v_seq,
           rcpt_no = v_lbl || '-' || lpad((v_yr % 100)::text, 2, '0') || '-' || lpad(v_seq::text, 4, '0')
     where id = r.id;
  end loop;
  for r in select id, org_path, emp_hash from public.reports
            where type = 'proposal' and status in ('received','reviewing') and appr_step is null loop
    v_ap := public.pick_approver(r.org_path, r.emp_hash, 1);
    update public.reports set appr_step = 1, appr_pos = v_ap[1], appr_path = v_ap[2] where id = r.id;
  end loop;
  perform set_config('ehs.org_sync', '', true);
  perform public.refresh_approvers();
end $$;

-- 완료 확인: 4개 테이블이 보이면 정상 (org_units 는 본사 콘솔에서 인사 명단을 올리면 채워짐)
select 'org_units' as t, count(*) from public.org_units
union all select 'employees', count(*) from public.employees
union all select 'reports', count(*) from public.reports
union all select 'report_logs', count(*) from public.report_logs;
