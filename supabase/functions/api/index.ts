// =====================================================================
//  안전보건 제안 시스템 v4 · Edge Function "api"
//  역할: 사번을 서버 비밀키로 HMAC-SHA256 처리(단방향 암호화)하고,
//        가입·로그인 보조·인원관리(소속·권한 범위 검사 포함)를 제공합니다.
//  사번 원문은 저장하거나 로그로 남기지 않습니다.
//
//  권한 범위 (조직 트리: 본사 > 사업팀 > 그룹 > 팀 > 파트, 인사 부서코드 기준)
//    본사(hq)        : 모든 인원·모든 권한 관리
//    사업팀(team)    : 소속 사업팀 안의 근로자·관리자 관리
//    관리자(manager) : 본인 소속 조직(그룹·팀·파트)과 그 하위의 근로자 관리
//    조직·인원 백데이터(부서코드·사번·성명) 일괄 업로드는 본사만 가능
//    근로자(worker)  : 인원관리 불가
//
//  필요한 Secrets (대시보드 > Edge Functions > Secrets)
//    EMP_PEPPER            : 사번 암호화용 비밀키 (40자 이상, 절대 변경·유출 금지)
//    INITIAL_ADMIN_EMP_ID  : 최초 본사 관리자 사번 (본사 계정이 하나도 없을 때만 사용)
//    ALLOWED_ORIGIN        : (선택) 접속 허용 주소. 예) https://아이디.github.io
// =====================================================================
import { createClient } from "npm:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const PEPPER = Deno.env.get("EMP_PEPPER") ?? "";
const INITIAL_ADMIN = normEmp(Deno.env.get("INITIAL_ADMIN_EMP_ID") ?? "");
const ALLOWED_ORIGIN = (Deno.env.get("ALLOWED_ORIGIN") ?? "*").trim() || "*";

const LOGIN_DOMAIN = "emp.ehs.local"; // 메일이 발송되지 않는 내부용 가상 주소
const EMP_RE = /^[A-Z0-9]{4,20}$/;
const HASH_RE = /^[0-9a-f]{64}$/;
const PW_MIN = 8;
const ROLES = ["worker", "manager", "team", "hq"] as const;
type Role = typeof ROLES[number];
const CODE_RE = /^[A-Za-z0-9-]{1,30}$/;
type Unit = { role: Role; org_code: string | null; org_path: string | null };
type Actor = Unit & { userId: string; empHash: string };

const db = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

class HttpError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

function cors(origin: string | null) {
  const allow = ALLOWED_ORIGIN === "*" ? "*" : (origin === ALLOWED_ORIGIN ? origin : ALLOWED_ORIGIN);
  return {
    "Access-Control-Allow-Origin": allow,
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Vary": "Origin",
  };
}

function cleanText(v: unknown, max = 50): string | null {
  const t = String(v ?? "").trim().replace(/\s+/g, " ");
  return t ? t.slice(0, max) : null;
}

// 성명 마스킹: 첫 글자와 끝 글자만 남김 (홍길동→홍*동, 남궁민수→남**수, 이산→이*). 이미 마스킹된 값도 그대로 유지됨
function maskName(v: unknown): string | null {
  const n = String(v ?? "").trim().replace(/\s+/g, "").slice(0, 20);
  if (!n) return null;
  const c = [...n];
  if (c.length === 1) return c[0];
  if (c.length === 2) return c[0] + "*";
  return c[0] + "*".repeat(c.length - 2) + c[c.length - 1];
}

function normEmp(v: unknown): string {
  return String(v ?? "").trim().toUpperCase().replace(/\s+/g, "");
}

async function hmacHex(text: string): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey("raw", enc.encode(PEPPER), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(text));
  return Array.from(new Uint8Array(sig)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function hashEmp(raw: unknown) {
  const emp = normEmp(raw);
  if (!EMP_RE.test(emp)) throw new HttpError(400, "사번 형식이 올바르지 않습니다 (영문·숫자 4~20자)");
  return await hmacHex(emp);
}

function loginIdOf(hash: string) {
  return `u${hash.slice(0, 40)}@${LOGIN_DOMAIN}`;
}

// ---------------------------------------------------------------------
// 권한·소속
// ---------------------------------------------------------------------
async function getActor(req: Request): Promise<Actor> {
  const token = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
  if (!token) throw new HttpError(401, "로그인이 필요합니다");
  const { data, error } = await db.auth.getUser(token);
  if (error || !data?.user) throw new HttpError(401, "로그인이 만료되었습니다. 다시 로그인해주세요");
  const { data: me } = await db.from("employees")
    .select("emp_hash, role, org_code, org_path, active").eq("user_id", data.user.id).maybeSingle();
  if (!me || !me.active) throw new HttpError(403, "사용이 중지되었거나 등록되지 않은 계정입니다");
  if (me.role === "worker") throw new HttpError(403, "인원관리 권한이 없습니다");
  return { userId: data.user.id, empHash: me.emp_hash, role: me.role, org_code: me.org_code, org_path: me.org_path };
}

// 조직 경로 범위: 사업팀은 최상위(사업팀) 경로 전체, 관리자는 본인 소속 경로와 그 하위
function teamPrefix(path: string | null) { return path ? path.split("/")[0] + "/" : null; }
function within(path: string | null, prefix: string | null) { return !!path && !!prefix && path.startsWith(prefix); }

function canManage(a: Actor, t: { role: string; org_path: string | null }) {
  if (a.role === "hq") return true;
  if (a.role === "team") return (t.role === "worker" || t.role === "manager") && within(t.org_path, teamPrefix(a.org_path));
  if (a.role === "manager") return t.role === "worker" && within(t.org_path, a.org_path);
  return false;
}

// 권한 + 부서코드를 조직표(org_units)로 검증 (본사는 부서코드 선택)
async function resolveUnit(roleRaw: unknown, codeRaw: unknown): Promise<Unit> {
  const role = String(roleRaw ?? "") as Role;
  if (!ROLES.includes(role)) throw new HttpError(400, "권한 값이 올바르지 않습니다");
  const code = String(codeRaw ?? "").trim();
  if (!code) {
    if (role === "hq") return { role, org_code: null, org_path: null };
    throw new HttpError(400, "소속 조직을 선택해주세요");
  }
  if (!CODE_RE.test(code)) throw new HttpError(400, "부서코드 형식이 올바르지 않습니다");
  const { data } = await db.from("org_units").select("code, path").eq("code", code).maybeSingle();
  if (!data) throw new HttpError(400, "등록되지 않은 부서코드입니다. 조직 백데이터를 먼저 업로드하세요");
  return { role, org_code: data.code, org_path: data.path };
}

async function findEmployee(hash: string) {
  const { data } = await db.from("employees")
    .select("emp_hash, emp_code, role, team, site, dept, part, org_code, org_path, name_mask, active, user_id, registered_at, created_at")
    .eq("emp_hash", hash).maybeSingle();
  return data;
}

async function targetHash(body: any) {
  if (body.empHash) {
    const h = String(body.empHash);
    if (!HASH_RE.test(h)) throw new HttpError(400, "잘못된 요청입니다");
    return h;
  }
  return await hashEmp(body.empId);
}

// ---------------------------------------------------------------------
// 로그인·가입
// ---------------------------------------------------------------------
async function actResolve(body: any) {
  const hash = await hashEmp(body.empId);
  return { loginId: loginIdOf(hash) };   // DB 조회 없음 → 사번 존재 여부 비노출
}

async function createLoginUser(loginId: string, password: string) {
  const attempt = () => db.auth.admin.createUser({
    email: loginId, password, email_confirm: true, app_metadata: { app: "ehs-proposal" },
  });
  let { data, error } = await attempt();
  if (error && /already|registered|exists/i.test(String(error.message))) {
    // 인원 연결이 끊긴 잔여 계정이면 정리 후 다시 생성
    const { data: oldId } = await db.rpc("auth_user_id_by_email", { p_email: loginId });
    if (oldId) {
      const { data: linked } = await db.from("employees").select("emp_hash").eq("user_id", oldId).maybeSingle();
      if (!linked) {
        await db.auth.admin.deleteUser(oldId as string);
        ({ data, error } = await attempt());
      }
    }
  }
  if (error || !data?.user) {
    const msg = String(error?.message ?? "");
    if (/password/i.test(msg)) throw new HttpError(400, "비밀번호가 보안 기준에 맞지 않습니다. 더 길고 복잡하게 설정해주세요");
    if (/already|registered|exists/i.test(msg)) throw new HttpError(409, "이미 가입된 사번입니다. 관리자에게 초기화를 요청하세요");
    throw new HttpError(500, "계정 생성 중 오류가 발생했습니다");
  }
  return data.user.id;
}

async function actSignup(body: any) {
  const emp = normEmp(body.empId);
  const password = String(body.password ?? "");
  if (password.length < PW_MIN) throw new HttpError(400, `비밀번호는 ${PW_MIN}자 이상이어야 합니다`);
  const hash = await hashEmp(emp);

  let row = await findEmployee(hash);
  // 최초 본사 관리자 자동 등록 (본사 계정이 없고, Secrets 에 지정한 사번일 때만)
  if (!row && INITIAL_ADMIN && emp === INITIAL_ADMIN) {
    const { count } = await db.from("employees").select("emp_hash", { count: "exact", head: true }).eq("role", "hq");
    if (!count) {
      const { error } = await db.from("employees").insert({ emp_hash: hash, role: "hq" });
      if (error) throw new HttpError(500, "본사 관리자 등록 중 오류가 발생했습니다");
      row = await findEmployee(hash);
    }
  }
  if (!row) throw new HttpError(403, "등록되지 않은 사번입니다. 소속 관리자에게 사번 등록을 요청하세요");
  if (!row.active) throw new HttpError(403, "사용이 중지된 사번입니다. 관리자에게 문의하세요");
  if (row.user_id) throw new HttpError(409, "이미 가입된 사번입니다. 비밀번호를 잊었다면 관리자에게 초기화를 요청하세요");

  const loginId = loginIdOf(hash);
  const uid = await createLoginUser(loginId, password);
  const { data: upd, error: uErr } = await db.from("employees")
    .update({ user_id: uid, registered_at: new Date().toISOString() })
    .eq("emp_hash", hash).is("user_id", null).select("emp_hash");
  if (uErr || !upd?.length) {
    await db.auth.admin.deleteUser(uid);
    throw new HttpError(409, "가입 처리 중 충돌이 발생했습니다. 다시 시도해주세요");
  }
  return { ok: true, loginId };
}

// ---------------------------------------------------------------------
// 인원관리 (관리자·사업팀·본사)
// ---------------------------------------------------------------------
async function actRegister(req: Request, body: any) {
  const actor = await getActor(req);
  const unit = await resolveUnit(body.role, body.orgCode);
  if (!canManage(actor, unit)) throw new HttpError(403, "해당 권한·소속으로 등록할 수 없습니다 (관리 범위 밖)");

  const list: string[] = Array.isArray(body.empIds) ? body.empIds : [];
  if (!list.length) throw new HttpError(400, "등록할 사번을 입력하세요");
  if (list.length > 500) throw new HttpError(400, "한 번에 최대 500건까지 등록할 수 있습니다");

  const invalid: string[] = [];
  const hashes = new Set<string>();
  for (const raw of list) {
    const emp = normEmp(raw);
    if (!emp) continue;
    if (!EMP_RE.test(emp)) { invalid.push(emp); continue; }
    hashes.add(await hmacHex(emp));
  }
  const rows = [...hashes].map((h) => ({ emp_hash: h, role: unit.role, org_code: unit.org_code }));
  let added = 0;
  if (rows.length) {
    const { data, error } = await db.from("employees")
      .upsert(rows, { onConflict: "emp_hash", ignoreDuplicates: true }).select("emp_hash");
    if (error) throw new HttpError(500, "사번 등록 중 오류가 발생했습니다");
    added = data?.length ?? 0;
  }
  return { added, skipped: rows.length - added, invalid };
}

async function actLookup(req: Request, body: any) {
  const actor = await getActor(req);
  const hash = await hashEmp(body.empId);
  const row = await findEmployee(hash);
  const base = { empHash: hash, empCode: hash.slice(0, 8).toUpperCase(), exists: !!row };
  if (!row) return base;
  if (!canManage(actor, row) && row.emp_hash !== actor.empHash) return { ...base, outOfScope: true };
  const { count } = await db.from("reports").select("id", { count: "exact", head: true }).eq("emp_hash", hash);
  return {
    ...base, role: row.role, team: row.team, site: row.site, dept: row.dept, part: row.part, orgCode: row.org_code, orgPath: row.org_path,
    nameMask: row.name_mask, active: row.active,
    registered: !!row.registered_at, reportCount: count ?? 0, self: row.emp_hash === actor.empHash,
  };
}

async function actUpdate(req: Request, body: any) {
  const actor = await getActor(req);
  const hash = await targetHash(body);
  if (hash === actor.empHash) throw new HttpError(400, "본인 계정의 권한·소속은 직접 변경할 수 없습니다");
  const row = await findEmployee(hash);
  if (!row) throw new HttpError(404, "등록되지 않은 사번입니다");
  if (!canManage(actor, row)) throw new HttpError(403, "관리 범위 밖의 인원입니다");

  const patch: Record<string, unknown> = {};
  if (body.role !== undefined || body.orgCode !== undefined) {
    const unit = await resolveUnit(body.role ?? row.role, body.orgCode !== undefined ? body.orgCode : row.org_code);
    if (!canManage(actor, unit)) throw new HttpError(403, "해당 권한·소속으로 변경할 수 없습니다 (관리 범위 밖)");
    patch.role = unit.role; patch.org_code = unit.org_code;
  }
  if (typeof body.active === "boolean") patch.active = body.active;
  if (!Object.keys(patch).length) return { ok: true };
  const { error } = await db.from("employees").update(patch).eq("emp_hash", hash);
  if (error) throw new HttpError(500, "변경 중 오류가 발생했습니다");
  return { ok: true };
}

async function actReset(req: Request, body: any) {
  const actor = await getActor(req);
  const hash = await targetHash(body);
  if (hash === actor.empHash) throw new HttpError(400, "본인 계정은 초기화할 수 없습니다");
  const row = await findEmployee(hash);
  if (!row) throw new HttpError(404, "등록되지 않은 사번입니다");
  if (!canManage(actor, row)) throw new HttpError(403, "관리 범위 밖의 인원입니다");
  if (!row.user_id) return { ok: true, message: "아직 가입하지 않은 사번입니다" };
  await db.from("employees").update({ user_id: null, registered_at: null }).eq("emp_hash", hash);
  await db.auth.admin.deleteUser(row.user_id);
  return { ok: true, message: "초기화되었습니다. 해당 직원이 [최초 등록]으로 다시 가입하면 됩니다" };
}

async function actRemove(req: Request, body: any) {
  const actor = await getActor(req);
  const hash = await targetHash(body);
  if (hash === actor.empHash) throw new HttpError(400, "본인 계정은 삭제할 수 없습니다");
  const row = await findEmployee(hash);
  if (!row) throw new HttpError(404, "등록되지 않은 사번입니다");
  if (!canManage(actor, row)) throw new HttpError(403, "관리 범위 밖의 인원입니다");
  if (row.user_id) await db.auth.admin.deleteUser(row.user_id);
  await db.from("employees").delete().eq("emp_hash", hash);
  return { ok: true };
}

// [관리자 이상] 실명 대조용 사번 확인
//   PC 브라우저가 인사명단의 사번 목록을 보내면, 관리 범위 안의 인원(또는 범위 안 제출건의 작성자)만
//   { i: 목록 순번, h: 사번해시 } 로 돌려줌. 성명은 받지도 보내지도 않음(대조는 브라우저 안에서).
//   사번은 저장하지 않으며, 누가 몇 명을 대조했는지만 export_logs 에 기록
async function actMatch(req: Request, body: any) {
  const actor = await getActor(req);
  const list: unknown[] = Array.isArray(body.empIds) ? body.empIds : [];
  if (!list.length) throw new HttpError(400, "대조할 사번이 없습니다");
  if (list.length > 1000) throw new HttpError(400, "한 번에 최대 1,000건까지 대조할 수 있습니다");
  const byHash = new Map<string, number[]>();
  for (let i = 0; i < list.length; i++) {
    const emp = normEmp(list[i]);
    if (!EMP_RE.test(emp)) continue;
    const h = await hmacHex(emp);
    byHash.set(h, [...(byHash.get(h) ?? []), i]);
  }
  const hashes = [...byHash.keys()];
  const ok = new Set<string>();
  if (hashes.length) {
    const { data: emps } = await db.from("employees").select("emp_hash, org_path").in("emp_hash", hashes);
    const prefix = actor.role === "team" ? teamPrefix(actor.org_path) : actor.org_path;
    for (const e of emps ?? []) if (actor.role === "hq" || within(e.org_path, prefix)) ok.add(e.emp_hash);
    if (actor.role !== "hq") {
      const rest = hashes.filter((h) => !ok.has(h));
      if (rest.length) {
        const { data: reps } = await db.from("reports").select("emp_hash, org_path").in("emp_hash", rest);
        for (const r of reps ?? []) if (within(r.org_path, prefix)) ok.add(r.emp_hash);
      }
    }
  }
  const matches: { i: number; h: string }[] = [];
  for (const h of ok) for (const i of byHash.get(h) ?? []) matches.push({ i, h });
  const { data: me } = await db.from("employees").select("emp_code").eq("emp_hash", actor.empHash).maybeSingle();
  await db.from("export_logs").insert({ actor_code: me?.emp_code ?? null, actor_role: actor.role, kind: String(body.kind ?? "").slice(0, 20) || null,
    requested: list.length, matched: matches.length });
  return { matches };
}

// [본사] 조직 트리 계산: [{code, name, parent}] → 경로·단계·단계별 이름
//   사업팀(이름이 '사업팀'으로 끝나는 최상위)이 아닌 최상위 조직은 모두 '본사'로 묶어 표시
function buildOrg(list: any[]) {
  const map = new Map<string, { code: string; name: string; parent: string | null }>();
  for (const u of list) {
    const code = String(u?.code ?? "").trim(), name = cleanText(u?.name, 50);
    if (!CODE_RE.test(code) || !name) throw new HttpError(400, `조직 데이터 오류: ${code || "(빈 부서코드)"}`);
    const parent = String(u?.parent ?? "").trim();
    map.set(code, { code, name, parent: parent && parent !== code && CODE_RE.test(parent) ? parent : null });
  }
  const out: any[] = [];
  const codes = [...map.keys()].sort();
  for (const code of codes) {
    const chain: string[] = []; const seen = new Set<string>(); let cur: string | null = code;
    while (cur && map.has(cur) && !seen.has(cur) && chain.length < 12) { seen.add(cur); chain.unshift(cur); cur = map.get(cur)!.parent; }
    const names = chain.map((c) => map.get(c)!.name);
    const top = names[0] ?? "";
    const biz = /사업팀$/.test(top);
    const lv = biz ? names : ["본사", ...names.slice(1)];   // 본사 쪽: 최상위(대표이사 등)를 '본사'로
    out.push({
      code, name: map.get(code)!.name, parent_code: chain.length > 1 ? chain[chain.length - 2] : null,
      path: chain.join("/") + "/", depth: chain.length,
      team: lv[0] ?? null, site: lv[1] ?? null, dept: lv[2] ?? null, part: lv[3] ?? null, sort: codes.indexOf(code),
    });
  }
  return out;
}

// [본사] 조직·인원 백데이터 일괄 반영
//   units = [{ code, name, parent }]  (부서코드 트리, 첫 묶음에만 포함)
//   rows  = [{ empId, nameMask, orgCode, role(worker|manager|team|'') }]
//           성명은 브라우저에서 마스킹된 값, 권한은 브라우저가 직책으로 정한 값(직책 원문은 받지 않음)
//           본사(hq) 권한은 업로드로 부여·변경하지 않음
async function actImport(req: Request, body: any) {
  const actor = await getActor(req);
  if (actor.role !== "hq") throw new HttpError(403, "조직 백데이터 업로드는 본사만 가능합니다");
  const units: any[] = Array.isArray(body.units) ? body.units : [];
  const list: any[] = Array.isArray(body.rows) ? body.rows : [];
  if (!units.length && !list.length) throw new HttpError(400, "업로드할 데이터가 없습니다");
  if (units.length > 3000) throw new HttpError(400, "조직 단위가 너무 많습니다 (최대 3,000개)");
  if (list.length > 1000) throw new HttpError(400, "한 번에 최대 1,000건까지 처리할 수 있습니다");
  let unitCount = 0;
  if (units.length) {
    // 기존 조직과 합쳐서 경로 계산 (이번 파일에 없는 상위 조직도 이어지도록)
    const { data: cur } = await db.from("org_units").select("code, name, parent_code");
    const merged = new Map<string, any>();
    for (const o of cur ?? []) merged.set(o.code, { code: o.code, name: o.name, parent: o.parent_code });
    for (const u of units) merged.set(String(u?.code ?? "").trim(), { code: u?.code, name: u?.name, parent: u?.parent });
    const built = buildOrg([...merged.values()]);
    const { data, error } = await db.rpc("import_org", { p_units: built });
    if (error) throw new HttpError(500, "조직 구조 반영 중 오류가 발생했습니다");
    unitCount = (data as any)?.units ?? built.length;
  }
  const { data: org } = await db.from("org_units").select("code");
  const codes = new Set((org ?? []).map((o: any) => o.code));
  const invalid: { row: number; reason: string }[] = [];
  const byHash = new Map<string, unknown>();
  for (let i = 0; i < list.length; i++) {
    const r = list[i] ?? {};
    const rowNo = Number(r.row ?? i + 1);
    const emp = normEmp(r.empId);
    if (!EMP_RE.test(emp)) { invalid.push({ row: rowNo, reason: "사번 형식 오류" }); continue; }
    const code = String(r.orgCode ?? "").trim();
    if (!codes.has(code)) { invalid.push({ row: rowNo, reason: `알 수 없는 부서코드: ${code || "(빈칸)"}` }); continue; }
    const role = ["worker", "manager", "team"].includes(r.role) ? r.role : "";
    byHash.set(await hmacHex(emp), { org_code: code, role, name_mask: maskName(r.nameMask) ?? "" });
  }
  const rows = [...byHash.entries()].map(([h, v]: [string, any]) => ({ ...v, emp_hash: h }));
  let result = { inserted: 0, updated: 0, skipped: 0 };
  if (rows.length) {
    const { data, error } = await db.rpc("import_employees", { p_rows: rows });
    if (error) throw new HttpError(500, "인원 반영 중 오류가 발생했습니다");
    result = data as typeof result;
  }
  // 반영 이력 (업로드 1회 = batch 1건으로 누적) — 실패해도 반영 결과에는 영향 없음
  let log: unknown = null;
  try {
    const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    const meta = body.meta ?? {};
    const batch = UUID_RE.test(String(body.batch ?? "")) ? String(body.batch) : crypto.randomUUID();
    const num = (v: unknown) => Math.max(0, Math.min(1_000_000, Math.floor(Number(v) || 0)));
    const { data: me } = await db.from("employees").select("emp_code").eq("emp_hash", actor.empHash).maybeSingle();
    const { data: lg } = await db.rpc("log_import", { p: {
      batch_id: batch, actor_code: me?.emp_code ?? "", file_name: String(meta.fileName ?? "").slice(0, 120),
      file_rows: num(meta.fileRows), client_invalid: num(meta.clientInvalid), units_sent: units.length,
      emp_inserted: result.inserted ?? 0, emp_updated: result.updated ?? 0, server_invalid: invalid.length,
    } });
    log = lg;
  } catch (_) { /* 이력 기록 실패는 무시 */ }
  return { ...result, units: unitCount, invalid, log };
}

// ---------------------------------------------------------------------
Deno.serve(async (req) => {
  const headers = { ...cors(req.headers.get("Origin")), "Content-Type": "application/json; charset=utf-8" };
  if (req.method === "OPTIONS") return new Response("ok", { headers });
  if (req.method !== "POST") return new Response(JSON.stringify({ error: "POST only" }), { status: 405, headers });
  try {
    if (!PEPPER || PEPPER.length < 32) throw new HttpError(500, "서버 설정 오류: EMP_PEPPER 가 없거나 너무 짧습니다");
    const body = await req.json().catch(() => ({}));
    let result: unknown;
    switch (body.action) {
      case "resolve":        result = await actResolve(body); break;
      case "signup":         result = await actSignup(body); break;
      case "admin_register": result = await actRegister(req, body); break;
      case "admin_lookup":   result = await actLookup(req, body); break;
      case "admin_update":   result = await actUpdate(req, body); break;
      case "admin_reset":    result = await actReset(req, body); break;
      case "admin_remove":   result = await actRemove(req, body); break;
      case "admin_import":   result = await actImport(req, body); break;
      case "match_names":    result = await actMatch(req, body); break;
      default: throw new HttpError(400, "알 수 없는 요청입니다");
    }
    return new Response(JSON.stringify(result), { status: 200, headers });
  } catch (e) {
    const status = e instanceof HttpError ? e.status : 500;
    const message = e instanceof HttpError ? e.message : "서버 오류가 발생했습니다";
    if (!(e instanceof HttpError)) console.error("unexpected", (e as Error)?.message);
    return new Response(JSON.stringify({ error: message }), { status, headers });
  }
});
