(function(){
'use strict';
var $ = function(s, r){ return (r || document).querySelector(s); };
var $$ = function(s, r){ return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
function esc(s){ return String(s == null ? '' : s).replace(/[&<>"']/g, function(c){ return { '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]; }); }
function low(c){ return String(c == null ? '' : c).trim().toLowerCase(); }
function normEmp(s){ return String(s == null ? '' : s).trim().toUpperCase().replace(/\s+/g, ''); }
function pad(n){ return String(n).padStart(2, '0'); }
function today(){ var d = new Date(); return d.getFullYear() + pad(d.getMonth() + 1) + pad(d.getDate()); }
function toast(msg, err){ var t = $('#toast'); t.textContent = msg; t.className = 'toast show' + (err ? ' err' : ''); clearTimeout(toast.t); toast.t = setTimeout(function(){ t.className = 'toast'; }, 3200); }

var S = { key:null, keyMeta:null, rows:[], files:[], view:'dec',
  dec:{ q:'', page:1, sort:null },
  st:{ f:{ type:'all', team:'all', site:'all', dept:'all', part:'all', status:'all', only:'all', from:'', to:'', q:'' }, lv:'auto', sub:'list', page:1, sort:{} } };
var PAGE = 100;
var TYPES = ['개선제안','위험성평가','아차사고'];

/* ---------- 2. KEY 열기 (본사에서 받은 .ehskey + 비밀번호 · 이 PC 메모리에서만 풂) ---------- */
function ub64(s){ var b = atob(s), u = new Uint8Array(b.length); for (var i = 0; i < b.length; i++) u[i] = b.charCodeAt(i); return u; }
/* KEY 원본: 파일 선택 · 끌어다 놓기 · 1번 칸에 잘못 넣은 파일 · 붙여넣은 내용 중 하나 */
var KEYSRC = null;   // { name, text }
function isKeyText(t){ try { var o = JSON.parse(t); return !!o && (o.format === 'ehs-key' || o.format === 'ehs-matchkey' || o.format === 'ehs-key-shared'); } catch(e){ return false; } }
async function setKeySource(file){
  var t = ''; try { t = await file.text(); } catch(e){}
  if (!isKeyText(t)){ toast('"' + file.name + '"은(는) KEY 파일이 아닙니다. 본사에서 받은 KEY_….ehskey 파일을 넣어 주세요', true); return false; }
  KEYSRC = { name:file.name, text:t };
  $('#keyPick').innerHTML = '선택한 KEY: <b>' + esc(file.name) + '</b>';
  if ($('#keyPw').value) openKey(); else { $('#keyPw').focus(); toast('KEY 파일을 넣었습니다. 비밀번호를 입력하고 [KEY 열기]를 누르세요'); }
  return true;
}
async function openKey(){
  var pw = $('#keyPw').value, pasted = ($('#keyText') && $('#keyText').value || '').trim();
  if (!KEYSRC && pasted){ if (!isKeyText(pasted)) return toast('붙여넣은 내용이 KEY가 아닙니다. 본사에서 받은 KEY 내용을 처음부터 끝까지 그대로 붙여넣어 주세요', true); KEYSRC = { name:'붙여넣은 KEY', text:pasted }; }
  if (!KEYSRC) return toast('KEY 파일을 아직 넣지 않았습니다. 2번 칸의 [파일 선택]으로 KEY_….ehskey를 고르거나, 파일을 이 창에 끌어다 놓으세요', true);
  if (!pw) return toast('KEY 비밀번호를 입력해주세요', true);
  if (!window.crypto || !crypto.subtle) return toast('이 브라우저는 암호 해제를 지원하지 않습니다. Chrome 또는 Edge로 열어주세요', true);
  var btn = $('#keyBtn'); btn.disabled = true; btn.textContent = '여는 중…';
  try {
    var pack = JSON.parse(KEYSRC.text);
    if (pack.format === 'ehs-key-shared'){ await openShared(pack, pw); return; }
    if (pack.format !== 'ehs-key' && pack.format !== 'ehs-matchkey') throw new Error('KEY 파일이 아닙니다');
    var enc = new TextEncoder();
    var base = await crypto.subtle.importKey('raw', enc.encode(pw), 'PBKDF2', false, ['deriveKey']);
    var key = await crypto.subtle.deriveKey({ name:'PBKDF2', hash:pack.kdf.hash, salt:ub64(pack.kdf.salt), iterations:pack.kdf.iter }, base, { name:'AES-GCM', length:256 }, false, ['decrypt']);
    var plain;
    try { plain = await crypto.subtle.decrypt({ name:'AES-GCM', iv:ub64(pack.iv) }, key, ub64(pack.ct)); }
    catch(e){ throw new Error('비밀번호가 올바르지 않거나 파일이 손상되었습니다'); }
    var obj = JSON.parse(new TextDecoder().decode(plain));
    if (obj.expires && new Date(obj.expires + 'T23:59:59') < new Date()) throw new Error('유효기간(' + obj.expires + ')이 지난 KEY입니다. 본사에 새 KEY를 요청하세요');
    var m = {}; Object.keys(obj.map || {}).forEach(function(c){ var v = obj.map[c]; m[c] = Array.isArray(v) ? { id:v[0], name:v[1] || '' } : { id:v, name:'' }; });
    S.key = m; S.keyMeta = { scope:obj.scope, created:obj.created, count:obj.count, expires:obj.expires };
    $('#keyPw').value = ''; obj = null; KEYSRC = null; if ($('#keyText')) $('#keyText').value = '';
    setDone('key', '<b>' + esc(S.keyMeta.scope) + '</b> · ' + Number(S.keyMeta.count).toLocaleString() + '명 · ' + esc(S.keyMeta.created) + ' 발급' + (S.keyMeta.expires ? ' · <b>' + esc(S.keyMeta.expires) + '</b>까지 사용' : ''));
    rematch();
  } catch(e){ toast(e.message || 'KEY를 열 수 없습니다', true); }
  finally { btn.disabled = false; btn.textContent = 'KEY 열기'; }
}

/* ---------- 전사 공통 KEY (v3): 비밀번호 + 데이터 파일의 대조코드가 있어야 그 사람 항목만 풀림 ---------- */
var SHARED = null;   // { M, entries, aad, iter, tried:{} }
async function openShared(pack, pw){
  var enc = new TextEncoder(), meta = pack.meta || {};
  if (meta.expires && new Date(meta.expires + 'T23:59:59') < new Date()) throw new Error('유효기간(' + meta.expires + ')이 지난 KEY입니다. 본사에 새 KEY를 요청하세요');
  var base = await crypto.subtle.importKey('raw', enc.encode(pw), 'PBKDF2', false, ['deriveBits']);
  var M = new Uint8Array(await crypto.subtle.deriveBits({ name:'PBKDF2', hash:pack.kdf.hash, salt:ub64(pack.kdf.salt), iterations:pack.kdf.iter }, base, 256));
  var aad = enc.encode('ehs-key-shared|' + (meta.expires || ''));
  try { var ck = await crypto.subtle.importKey('raw', M, 'AES-GCM', false, ['decrypt']), cp = String(pack.chk).split('.');
    await crypto.subtle.decrypt({ name:'AES-GCM', iv:ub64(cp[0]), additionalData:aad }, ck, ub64(cp[1])); }
  catch(e){ throw new Error('비밀번호가 올바르지 않거나 KEY 파일이 손상·변조되었습니다'); }
  SHARED = { M:M, entries:pack.entries || {}, aad:aad, iter:(pack.per && pack.per.iter) || 20000, tried:{} };
  S.key = {}; S.keyMeta = { scope:meta.scope || '전사 공통', created:meta.created, count:meta.count, expires:meta.expires };
  $('#keyPw').value = ''; KEYSRC = null; if ($('#keyText')) $('#keyText').value = '';
  await resolveShared();
}
async function resolveShared(){
  if (!SHARED) return;
  var enc = new TextEncoder(), dec = new TextDecoder(), todo = [], seen = {}, noCode = 0;
  S.rows.forEach(function(r){ if (!r.lcode){ if (r.code) noCode++; return; } if (SHARED.tried[r.lcode] || seen[r.lcode]) return; seen[r.lcode] = 1; todo.push(r); });
  for (var i = 0; i < todo.length; i += 20){
    if (todo.length > 40) $('#c-key .st').innerHTML = '데이터 파일의 인원 확인 중… ' + Math.round(i / todo.length * 100) + '%';
    await Promise.all(todo.slice(i, i + 20).map(async function(r){
      SHARED.tried[r.lcode] = 1;
      var base = await crypto.subtle.importKey('raw', enc.encode(r.lcode), 'PBKDF2', false, ['deriveBits']);
      var bits = new Uint8Array(await crypto.subtle.deriveBits({ name:'PBKDF2', hash:'SHA-256', salt:SHARED.M, iterations:SHARED.iter }, base, 512));
      var id = Array.prototype.map.call(bits.slice(0, 12), function(x){ return ('0' + x.toString(16)).slice(-2); }).join('');
      var e = SHARED.entries[id]; if (!e) return;
      try { var k = await crypto.subtle.importKey('raw', bits.slice(32, 64), 'AES-GCM', false, ['decrypt']), p = e.split('.');
        var v = JSON.parse(dec.decode(await crypto.subtle.decrypt({ name:'AES-GCM', iv:ub64(p[0]), additionalData:SHARED.aad }, k, ub64(p[1]))));
        S.key[r.code] = { id:v[0], name:v[1] || '' }; } catch(_){}
    }));
  }
  var n = Object.keys(S.key).length;
  setDone('key', '<b>' + esc(S.keyMeta.scope) + '</b> KEY · 이 데이터의 <b>' + n.toLocaleString() + '명</b> 확인 · ' + esc(S.keyMeta.created || '') + ' 발급' + (S.keyMeta.expires ? ' · <b>' + esc(S.keyMeta.expires) + '</b>까지 사용' : '') +
    (S.rows.length ? '' : ' <span class="dim">(데이터 파일을 넣으면 그 안의 인원만 바뀝니다)</span>'));
  if (noCode) toast('예전에 내보낸 데이터 파일에는 대조코드가 없어 공통 KEY로 바꿀 수 없습니다. 휴대폰에서 다시 [내보내기] 해 주세요', true);
  rematch();
}

/* ---------- 엑셀 · 텍스트 읽기 ---------- */
async function readSheet(file){
  if (/\.(txt|tsv)$/i.test(file.name)) return parseText(await file.text());
  var wb = XLSX.read(await file.arrayBuffer(), { type:'array', raw:true });
  return XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header:1, raw:false, defval:'' });
}
/* 붙여넣은 내용: 엑셀에서 복사(탭 구분) · 메모장으로 연 CSV(쉼표 구분) 모두 처리 */
function parseText(text){
  text = String(text || '').replace(/^﻿/, '');
  var first = text.split(/\r?\n/)[0] || '';
  var fs = first.indexOf('\t') > -1 ? '\t' : (first.split(';').length > first.split(',').length ? ';' : ',');
  var wb = XLSX.read(text, { type:'string', FS:fs, raw:true });
  return XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header:1, raw:false, defval:'' });
}
function findHeader(aoa, names){ return aoa.slice(0, 20).findIndex(function(r){ return r.some(function(c){ return names.indexOf(low(c)) > -1; }); }); }
function colOf(head, names){ return head.findIndex(function(h){ return names.indexOf(h) > -1; }); }

/* ---------- 1. 받은 데이터 (휴대폰·PC에서 내보낸 접수목록 · 여러 개 가능) ---------- */
var D_COLS = { no:['접수번호'], type:['유형'], status:['상태'], team:['사업팀'], site:['그룹'], dept:['팀'], part:['파트'], loc:['장소'], pg:['제안등급'], fg:['결정등급'],
  rl:['위험정도(제출)'], fr:['위험정도(반영)'], cat:['사고유형/위험요인','사고유형'], occ:['발생일시'], detail:['상세내용/상황설명','상세내용'], req:['조치요청사항'], prev:['재발방지의견'],
  cmt:['처리의견'], code:['제출자식별코드','식별코드'], lcode:['대조코드'], mask:['제출자성명(마스킹)','성명(마스킹)'], at:['제출일시'], closed:['종료일시'], empId:['사번'], realName:['성명(실명)'] };
function ingest(aoa){
  var hi = findHeader(aoa, D_COLS.no); if (hi < 0) return null;
  var head = aoa[hi].map(low), c = {}; Object.keys(D_COLS).forEach(function(k){ c[k] = colOf(head, D_COLS[k]); });
  var seen = {}, added = 0, dup = 0; S.rows.forEach(function(r){ seen[r.no] = 1; });
  aoa.slice(hi + 1).forEach(function(r){
    var g = function(k){ return c[k] > -1 ? String(r[c[k]] == null ? '' : r[c[k]]).trim() : ''; };
    var no = g('no'); if (!no) return; if (seen[no]){ dup++; return; } seen[no] = 1;
    S.rows.push({ no:no, type:g('type'), status:g('status'), team:g('team'), site:g('site'), dept:g('dept'), part:g('part'), loc:g('loc'),
      pg:g('pg'), fg:g('fg'), rl:g('rl'), fr:g('fr'), cat:g('cat'), occ:g('occ'), detail:g('detail'), req:g('req'), prev:g('prev'), cmt:g('cmt'),
      code:g('code').toUpperCase(), lcode:g('lcode').toUpperCase(), mask:g('mask'), at:g('at'), closed:g('closed'), fileId:g('empId'), fileName:g('realName') });
    added++;
  });
  return { added:added, dup:dup };
}
var DUP = 0;
async function finishData(){
  S.rows.sort(function(a, b){ return a.at < b.at ? 1 : a.at > b.at ? -1 : 0; });
  setDone('data', '<b>' + S.rows.length.toLocaleString() + '건</b> · ' + S.files.length + '개 묶음' + (DUP ? ' <span class="dim">(중복 ' + DUP + '건 제외)</span>' : ''));
  if (SHARED) await resolveShared(); else rematch();
}
async function openData(list){
  var files = Array.prototype.slice.call(list && list.length ? list : $('#dataFile').files); if (!files.length) return;
  $('#dataFile').value = '';
  var bad = [], any = false;
  for (var fi = 0; fi < files.length; fi++){
    var file = files[fi];
    try {
      if (/\.(ehskey|json)$/i.test(file.name)){ await setKeySource(file); continue; }
      if (/\.(txt|tsv)$/i.test(file.name)){ var tx = await file.text(); if (isKeyText(tx)){ await setKeySource(file); continue; } }
      var res = ingest(await readSheet(file));
      if (!res){ bad.push(file.name); continue; }
      DUP += res.dup; S.files.push(file.name); any = true;
    } catch(e){ bad.push(file.name); }
  }
  if (bad.length) toast('접수목록 형식이 아닌 파일은 건너뛰었습니다: ' + bad.join(', '), true);
  if (any) await finishData();
}
async function pasteData(){
  var ta = $('#dataText'), text = ta.value.trim(); if (!text) return toast('붙여넣은 내용이 없습니다. 엑셀에서 전체 선택(Ctrl+A) → 복사(Ctrl+C) 후 이 칸에 붙여넣기(Ctrl+V) 하세요', true);
  if (isKeyText(text)){ KEYSRC = { name:'붙여넣은 KEY', text:text }; ta.value = ''; $('#keyPick').innerHTML = '선택한 KEY: <b>붙여넣은 KEY</b>'; $('#keyPw').focus(); return toast('KEY 내용이라 2번 칸으로 옮겼습니다. 비밀번호를 입력하고 [KEY 열기]를 누르세요'); }
  var res = null; try { res = ingest(parseText(text)); } catch(e){}
  if (!res) return toast('접수목록 내용을 찾지 못했습니다. 첫 줄(머리글)에 "접수번호"가 포함되도록 전체를 복사해 주세요', true);
  ta.value = ''; DUP += res.dup; S.files.push('붙여넣기'); toast(res.added.toLocaleString() + '건을 넣었습니다');
  await finishData();
}

/* ---------- 치환: 식별코드 → (KEY) 사번 · 성명 ---------- */
function rematch(){
  S.rows.forEach(function(r){
    var k = S.key && r.code ? S.key[r.code] : null;
    r.empId = k ? k.id : (r.fileId || ''); r.name = k ? k.name : (r.fileName || '');
    r.matched = !!(r.empId && r.name);
  });
  render();
}
function setDone(k, html){ var card = $('#c-' + k); card.classList.add('done'); $('.st', card).innerHTML = html; }
function decrypted(){ return !!S.key && S.rows.some(function(r){ return r.matched; }); }

/* ---------- 공통 ---------- */
function opts(sel, vals, label, cur){ sel.innerHTML = '<option value="all">' + label + ' 전체</option>' + vals.map(function(v){ return '<option' + (v === cur ? ' selected' : '') + '>' + esc(v) + '</option>'; }).join(''); if (cur !== 'all' && vals.indexOf(cur) < 0) sel.value = 'all'; }
function uniq(rows, k){ var v = []; rows.forEach(function(r){ if (r[k] && v.indexOf(r[k]) < 0) v.push(r[k]); }); return v.sort(function(a, b){ return a.localeCompare(b, 'ko', { numeric:true }); }); }
function tagType(t){ var c = t === '개선제안' ? 'p' : t === '위험성평가' ? 'r' : t === '아차사고' ? 'n' : 'x'; return '<span class="tt t-' + c + '">' + esc(t || '-') + '</span>'; }
function tagSt(s){ return '<span class="st">' + esc(s || '-') + '</span>'; }
function grade(r){ if (r.type === '개선제안') return (r.pg ? '제안 ' + esc(r.pg) : '') + (r.fg ? ' · 결정 <b>' + esc(r.fg) + '</b>' : '');
  if (r.type === '위험성평가') return (r.rl ? '제출 ' + esc(r.rl) : '') + (r.fr ? ' · 반영 <b>' + esc(r.fr) + '</b>' : ''); return ''; }
function unit(r){ return [r.team, r.site, r.dept, r.part].filter(Boolean).join(' › '); }
function ym(r){ var m = /^(\d{4})[.\-\/](\d{1,2})/.exec(r.at || ''); return m ? m[1] + '-' + pad(+m[2]) : ''; }
function isOpen(s){ return /접수|검토/.test(s || ''); }
function isDone(s){ return /완료|위원회|의결/.test(s || ''); }
function isRej(s){ return /반려/.test(s || ''); }
function kpi(k, v, s, c){ return '<div class="kpi ' + (c || '') + '"><span>' + k + '</span><b>' + (typeof v === 'number' ? v.toLocaleString() : v) + '</b><small>' + esc(s || '') + '</small></div>'; }
function pager(cur, pages, id){ var a = []; for (var p = 1; p <= pages; p++) if (p === 1 || p === pages || Math.abs(p - cur) <= 3) a.push('<button data-pg="' + p + '" data-pt="' + id + '"' + (p === cur ? ' class="on"' : '') + '>' + p + '</button>');
  return pages > 1 ? '<span>' + cur + ' / ' + pages + ' 페이지</span>' + a.join('') : ''; }

/* ---------- 칼럼 정렬: 머리글 클릭 → 오름 ▲ → 내림 ▼ → 원래 순서 ---------- */
function cmp(a, b){ if (typeof a === 'number' && typeof b === 'number') return a - b; return String(a == null ? '' : a).localeCompare(String(b == null ? '' : b), 'ko', { numeric:true }); }
var RANK = { '가':1, '나':2, '다':3, '라':4, '상':1, '중':2, '하':3 };
function rv(r, k){
  switch(k){
    case 'no': return +String(r.no).replace(/\D/g, '') || 0;
    case 'unit': return unit(r); case 'grade': return RANK[r.fg || r.fr || r.pg || r.rl] || 9;
    case 'emp': return r.empId || ('~' + r.code); case 'name': return r.name || ('~' + (r.mask || ''));
    default: return r[k] == null ? '' : r[k];
  }
}
function sorted(L, st, get){ if (!st || !st.k) return L; get = get || rv; return L.slice().sort(function(a, b){ return cmp(get(a, st.k), get(b, st.k)) * st.dir; }); }
function th(t, k, label, st, cls){ var on = st && st.k === k; return '<th data-t="' + t + '" data-k="' + k + '" class="srt' + (on ? (st.dir > 0 ? ' asc' : ' desc') : '') + (cls ? ' ' + cls : '') + '">' + label + '</th>'; }
function sortState(t){ return t === 'dec' ? S.dec.sort : S.st.sort[t]; }
function setSort(t, k){ var cur = sortState(t), nx = cur && cur.k === k ? (cur.dir > 0 ? { k:k, dir:-1 } : null) : { k:k, dir:1 };
  if (t === 'dec'){ S.dec.sort = nx; S.dec.page = 1; } else { S.st.sort[t] = nx; if (t === 'list') S.st.page = 1; } render(); }

/* ---------- 상단 탭 ---------- */
function render(){
  var dec = decrypted();
  $$('.apptab').forEach(function(b){ b.classList.toggle('on', b.dataset.view === S.view); });
  $('#tabStat').classList.toggle('locked', !dec);
  $('#vDec').classList.toggle('hidden', S.view !== 'dec'); $('#vStat').classList.toggle('hidden', S.view !== 'stat');
  if (S.view === 'dec') renderDec(); else renderStat();
}

/* ---------- ① 복호화 탭: 넣은 데이터 확인 (저장 없음) ---------- */
function decRows(){ var q = S.dec.q.trim().toLowerCase();
  return S.rows.filter(function(r){ return !q || [r.no, r.loc, r.detail, r.cat, r.empId, r.name, r.code, r.mask, unit(r)].join(' ').toLowerCase().indexOf(q) > -1; }); }
function listCols(t, st){ return th(t,'no','접수번호',st) + th(t,'type','유형',st) + th(t,'status','상태',st) + th(t,'unit','소속 (제출 당시)',st) + th(t,'loc','장소',st) + th(t,'grade','등급 · 위험정도',st) +
  th(t,'detail','내용',st) + th(t,'code','식별코드',st) + th(t,'emp','사번',st) + th(t,'name','성명',st) + th(t,'at','제출일시',st); }
function listRow(r){ return '<tr data-i="' + S.rows.indexOf(r) + '"><td class="mono">' + esc(r.no) + '</td><td>' + tagType(r.type) + '</td><td>' + tagSt(r.status) + '</td><td class="ell">' + esc(unit(r)) + '</td><td class="ell">' + esc(r.loc) + '</td><td>' + grade(r) + '</td>' +
  '<td class="ell w">' + esc(r.detail) + '</td><td class="mono dim">' + esc(r.code || '-') + '</td><td class="mono">' + (r.empId ? esc(r.empId) : '<span class="dim">미확인</span>') + '</td><td>' + (r.name ? '<b>' + esc(r.name) + '</b>' : '<span class="dim">' + esc(r.mask || '미확인') + '</span>') + '</td><td class="mono">' + esc(r.at) + '</td></tr>'; }
function renderDec(){
  var has = S.rows.length;
  $('#decMain').classList.toggle('hidden', !has); $('#empty').classList.toggle('hidden', !!has);
  if (!has) return;
  var m = S.rows.filter(function(r){ return r.matched; }).length;
  $('#decKpis').innerHTML = kpi('넣은 데이터', S.rows.length, '파일·붙여넣기 ' + S.files.length + '개') + kpi('실명 확인', m, S.rows.length ? Math.round(m / S.rows.length * 100) + '%' : '-', 'g') +
    kpi('미확인', S.rows.length - m, !S.key ? 'KEY를 열어주세요' : 'KEY 범위 밖 인원', S.rows.length - m ? 'o' : '');
  $('#decCta').innerHTML = decrypted() ? '<div class="cta ok"><span><b>복호화 완료</b> · ' + S.rows.length.toLocaleString() + '건 중 ' + m.toLocaleString() + '건이 사번 · 성명으로 바뀌었습니다. 조회 · 현황 · 저장은 <b>② 데이터 현황</b>에서 합니다.</span><button class="btn pri" data-go="stat">데이터 현황 보기 →</button></div>'
    : '<div class="cta"><span><b>아직 복호화 전입니다.</b> 2번 칸에 KEY와 비밀번호를 넣으면 식별코드가 사번 · 성명으로 바뀌고, 그 다음 ② 데이터 현황에서 조회 · 저장할 수 있습니다.</span></div>';
  var L = sorted(decRows(), S.dec.sort), pages = Math.max(1, Math.ceil(L.length / PAGE)); if (S.dec.page > pages) S.dec.page = pages;
  var P = L.slice((S.dec.page - 1) * PAGE, S.dec.page * PAGE);
  $('#decTbl').innerHTML = P.length ? '<table><thead><tr>' + listCols('dec', S.dec.sort) + '</tr></thead><tbody>' + P.map(listRow).join('') + '</tbody></table>' : '<div class="none">조건에 맞는 건이 없습니다</div>';
  $('#decPager').innerHTML = pager(S.dec.page, pages, 'dec');
}

/* ---------- ② 데이터 현황 탭: 유형 · 소속 · 기간 조회, 현황, 정렬, 저장 (복호화 후에만) ---------- */
function statRows(){
  var f = S.st.f, q = f.q.trim().toLowerCase();
  return S.rows.filter(function(r){
    if (f.type !== 'all' && r.type !== f.type) return false;
    if (f.team !== 'all' && r.team !== f.team) return false;
    if (f.site !== 'all' && r.site !== f.site) return false;
    if (f.dept !== 'all' && r.dept !== f.dept) return false;
    if (f.part !== 'all' && r.part !== f.part) return false;
    if (f.status !== 'all' && r.status !== f.status) return false;
    if (f.only === 'yes' && !r.matched) return false; if (f.only === 'no' && r.matched) return false;
    var k = ym(r); if (f.from && (!k || k < f.from)) return false; if (f.to && (!k || k > f.to)) return false;
    if (q && [r.no, r.loc, r.detail, r.req, r.prev, r.cmt, r.cat, r.empId, r.name, r.code, unit(r)].join(' ').toLowerCase().indexOf(q) < 0) return false;
    return true;
  });
}
var LV = { team:'사업팀', site:'그룹', dept:'팀', part:'파트' }, LV_ORDER = ['team','site','dept','part'];
function autoLevel(L){ var f = S.st.f; if (S.st.lv !== 'auto') return S.st.lv;
  var lv = f.dept !== 'all' ? 'part' : f.site !== 'all' ? 'dept' : f.team !== 'all' ? 'site' : 'team';
  /* 한 소속만 있으면 다음 단계로 내려가서 보여줌 (예: 평택그룹 데이터만 → 팀별) */
  L = L || statRows();
  while (lv !== 'part'){ var v = {}; L.forEach(function(r){ v[r[lv] || ''] = 1; }); if (Object.keys(v).length > 1) break; lv = LV_ORDER[LV_ORDER.indexOf(lv) + 1]; }
  return lv; }
function orgKey(r, lv){ var idx = LV_ORDER.indexOf(lv), parts = []; for (var i = 0; i <= idx; i++) parts.push(r[LV_ORDER[i]] || (i === 0 ? '본사' : '(직속)')); return parts.join(' › '); }
function agg(L){ var m = { p:0, r:0, n:0, t:L.length, open:0, done:0, rej:0, ppl:{} };
  L.forEach(function(x){ if (x.type === '개선제안') m.p++; else if (x.type === '위험성평가') m.r++; else if (x.type === '아차사고') m.n++;
    if (isOpen(x.status)) m.open++; else if (isDone(x.status)) m.done++; else if (isRej(x.status)) m.rej++; m.ppl[x.empId || x.code || x.mask] = 1; });
  m.people = Object.keys(m.ppl).length; m.rate = m.t ? Math.round((m.done + m.rej) / m.t * 100) : 0; return m; }
function orgRows(L, lv){ var by = {}; L.forEach(function(r){ var k = orgKey(r, lv); (by[k] = by[k] || []).push(r); });
  return Object.keys(by).map(function(k){ var m = agg(by[k]); m.name = k; return m; }); }
function monthRows(L){ var f = S.st.f, keys = L.map(ym).filter(Boolean).sort(), a = f.from || keys[0], b = f.to || keys[keys.length - 1], out = [];
  if (!a || !b) return out;
  for (var y = +a.slice(0, 4), mo = +a.slice(5); (y + '-' + pad(mo)) <= b && out.length < 240; mo++){ if (mo > 12){ mo = 1; y++; } var k = y + '-' + pad(mo); if (k > b) break;
    var R = L.filter(function(r){ return ym(r) === k; }), m = agg(R); m.name = k; out.push(m); }
  return out; }
function peopleOf(L){
  var by = {};
  L.forEach(function(r){ var k = r.empId || ('code:' + (r.code || '?'));
    var p = by[k] = by[k] || { empId:r.empId, name:r.name, mask:r.mask, code:r.code, unit:unit(r), p:0, r:0, n:0, t:0, comm:0, done:0 };
    if (r.type === '개선제안') p.p++; else if (r.type === '위험성평가') p.r++; else if (r.type === '아차사고') p.n++;
    p.t++; if (/위원회|의결/.test(r.status)) p.comm++; if (/완료/.test(r.status)) p.done++; });
  return Object.keys(by).map(function(k){ return by[k]; }).sort(function(a, b){ return b.t - a.t || (a.name || '').localeCompare(b.name || '', 'ko'); });
}
function mGet(m, k){ return k === 'name' ? m.name : m[k]; }
function pGet(p, k){ return k === 'emp' ? (p.empId || '~' + p.code) : k === 'name' ? (p.name || '~' + (p.mask || '')) : p[k]; }
function setPeriod(kind){ var d = new Date(), y = d.getFullYear(), f = S.st.f;
  if (kind === 'all'){ f.from = ''; f.to = ''; }
  if (kind === 'year'){ f.from = y + '-01'; f.to = y + '-12'; }
  if (kind === 'last'){ f.from = (y - 1) + '-01'; f.to = (y - 1) + '-12'; }
  if (kind === '12m'){ var s = new Date(y, d.getMonth() - 11, 1); f.from = s.getFullYear() + '-' + pad(s.getMonth() + 1); f.to = y + '-' + pad(d.getMonth() + 1); }
  S.st.page = 1; render(); }
function renderStat(){
  var dec = decrypted();
  $('#statLock').classList.toggle('hidden', dec); $('#statMain').classList.toggle('hidden', !dec);
  if (!dec) return;
  var f = S.st.f, R = S.rows;
  opts($('#sTeam'), uniq(R, 'team'), '사업팀', f.team);
  var R1 = R.filter(function(r){ return f.team === 'all' || r.team === f.team; }); opts($('#sSite'), uniq(R1, 'site'), '그룹', f.site);
  var R2 = R1.filter(function(r){ return f.site === 'all' || r.site === f.site; }); opts($('#sDept'), uniq(R2, 'dept'), '팀', f.dept);
  var R3 = R2.filter(function(r){ return f.dept === 'all' || r.dept === f.dept; }); opts($('#sPart'), uniq(R3, 'part'), '파트', f.part);
  opts($('#sStatus'), uniq(R, 'status'), '상태', f.status);
  $('#sType').value = f.type; $('#sOnly').value = f.only; $('#sFrom').value = f.from; $('#sTo').value = f.to; $('#sLv').value = S.st.lv;
  var L = statRows(), m = agg(L), mt = L.filter(function(r){ return r.matched; }).length;
  $('#sCond').textContent = condText();
  $('#statKpis').innerHTML = kpi('조회 건수', m.t, '전체 ' + R.length.toLocaleString() + '건') + kpi('개선제안', m.p, '', 'b') + kpi('위험성평가', m.r, '', 't') + kpi('아차사고', m.n, '', 'o') +
    kpi('처리 완료율', m.rate + '%', '완료 ' + m.done + ' · 반려 ' + m.rej + ' · 대기 ' + m.open, 'g') + kpi('제출 인원', m.people, '실명 확인 ' + (L.length ? Math.round(mt / L.length * 100) : 0) + '%');
  /* 소속별 */
  var lv = autoLevel(L), O = sorted(orgRows(L, lv), S.st.sort.org || { k:'t', dir:-1 }, mGet), tot = agg(L);
  $('#orgTitle').textContent = LV[lv] + '별 현황';
  var orgHead = th('org','name',LV[lv],S.st.sort.org) + th('org','p','개선제안',S.st.sort.org,'num') + th('org','r','위험성평가',S.st.sort.org,'num') + th('org','n','아차사고',S.st.sort.org,'num') +
    th('org','t','합계',S.st.sort.org,'num') + th('org','open','처리대기',S.st.sort.org,'num') + th('org','done','완료',S.st.sort.org,'num') + th('org','rej','반려',S.st.sort.org,'num') + th('org','rate','완료율',S.st.sort.org,'num') + th('org','people','제출 인원',S.st.sort.org,'num');
  var mrow = function(x, cls){ return '<tr' + (cls ? ' class="' + cls + '"' : '') + '><td>' + esc(x.name) + '</td><td class="num">' + x.p + '</td><td class="num">' + x.r + '</td><td class="num">' + x.n + '</td><td class="num"><b>' + x.t + '</b></td><td class="num">' + x.open + '</td><td class="num">' + x.done + '</td><td class="num">' + x.rej + '</td><td class="num">' + x.rate + '%</td><td class="num">' + x.people + '</td></tr>'; };
  tot.name = '합계';
  $('#orgTbl').innerHTML = O.length ? '<table><thead><tr>' + orgHead + '</tr></thead><tbody>' + O.map(function(x){ return mrow(x); }).join('') + mrow(tot, 'tot') + '</tbody></table>' : '<div class="none">조건에 맞는 건이 없습니다</div>';
  /* 월별 */
  var MR = monthRows(L), maxT = Math.max.apply(null, MR.map(function(x){ return x.t; }).concat([1])), MS = sorted(MR, S.st.sort.month, mGet);
  $('#monTbl').innerHTML = MS.length ? '<table><thead><tr>' + th('month','name','월',S.st.sort.month) + th('month','p','개선제안',S.st.sort.month,'num') + th('month','r','위험성평가',S.st.sort.month,'num') + th('month','n','아차사고',S.st.sort.month,'num') + th('month','t','합계',S.st.sort.month,'num') + '<th>추이</th></tr></thead><tbody>' +
    MS.map(function(x){ return '<tr><td class="mono">' + x.name + '</td><td class="num">' + x.p + '</td><td class="num">' + x.r + '</td><td class="num">' + x.n + '</td><td class="num"><b>' + x.t + '</b></td><td class="barc"><div class="sbar"><i class="b" style="width:' + (x.p / maxT * 100) + '%"></i><i class="t" style="width:' + (x.r / maxT * 100) + '%"></i><i class="o" style="width:' + (x.n / maxT * 100) + '%"></i></div></td></tr>'; }).join('') + '</tbody></table>'
    : '<div class="none">기간에 해당하는 건이 없습니다</div>';
  /* 접수 내역 / 제출자별 */
  $$('.subtab').forEach(function(b){ b.classList.toggle('on', b.dataset.sub === S.st.sub); });
  if (S.st.sub === 'list'){
    var LS = sorted(L, S.st.sort.list), pages = Math.max(1, Math.ceil(LS.length / PAGE)); if (S.st.page > pages) S.st.page = pages;
    var P = LS.slice((S.st.page - 1) * PAGE, S.st.page * PAGE);
    $('#stTbl').innerHTML = P.length ? '<table><thead><tr>' + listCols('list', S.st.sort.list) + '</tr></thead><tbody>' + P.map(listRow).join('') + '</tbody></table>' : '<div class="none">조건에 맞는 건이 없습니다</div>';
    $('#stPager').innerHTML = pager(S.st.page, pages, 'st');
  } else {
    var PP = sorted(peopleOf(L), S.st.sort.people, pGet), sp = S.st.sort.people;
    $('#stTbl').innerHTML = PP.length ? '<table><thead><tr><th>순위</th>' + th('people','emp','사번',sp) + th('people','name','성명',sp) + th('people','unit','소속 (제출 당시)',sp) + th('people','p','개선제안',sp,'num') + th('people','r','위험성평가',sp,'num') + th('people','n','아차사고',sp,'num') + th('people','t','합계',sp,'num') + th('people','comm','위원회 의결',sp,'num') + th('people','done','조치·반영 완료',sp,'num') + '</tr></thead><tbody>' +
      PP.map(function(p, i){ return '<tr><td class="num">' + (i + 1) + '</td><td class="mono">' + (p.empId ? esc(p.empId) : '<span class="dim">' + esc(p.code) + '</span>') + '</td><td>' + (p.name ? '<b>' + esc(p.name) + '</b>' : '<span class="dim">' + esc(p.mask || '미확인') + '</span>') + '</td><td class="ell">' + esc(p.unit) + '</td>' +
        '<td class="num">' + p.p + '</td><td class="num">' + p.r + '</td><td class="num">' + p.n + '</td><td class="num"><b>' + p.t + '</b></td><td class="num">' + p.comm + '</td><td class="num">' + p.done + '</td></tr>'; }).join('') + '</tbody></table>'
      : '<div class="none">조건에 맞는 건이 없습니다</div>';
    $('#stPager').innerHTML = '';
  }
}
function condText(){ var f = S.st.f, a = [];
  a.push('유형 ' + (f.type === 'all' ? '전체' : f.type));
  a.push('소속 ' + ([f.team, f.site, f.dept, f.part].filter(function(x){ return x !== 'all'; }).join(' › ') || '전체'));
  a.push('기간 ' + (f.from || f.to ? (f.from || '처음') + ' ~ ' + (f.to || '끝') : '전체'));
  if (f.status !== 'all') a.push('상태 ' + f.status); if (f.only !== 'all') a.push(f.only === 'yes' ? '실명 확인 건' : '미확인 건'); if (f.q) a.push('검색 "' + f.q + '"');
  return a.join(' · '); }

function openDetail(r){
  var kv = [['접수번호', r.no], ['유형', r.type], ['상태', r.status], ['소속 (제출 당시)', unit(r)], ['장소', r.loc], ['사고유형 · 위험요인', r.cat], ['발생일시', r.occ],
    ['제안등급', r.pg], ['결정등급', r.fg], ['위험정도 (제출)', r.rl], ['위험정도 (반영)', r.fr], ['제출일시', r.at], ['종료일시', r.closed],
    ['식별코드', r.code], ['사번', r.empId || '미확인'], ['성명', r.name || r.mask || '미확인']].filter(function(x){ return x[1]; });
  var blk = [['상세 내용 · 상황 설명', r.detail], ['조치 요청사항', r.req], ['재발 방지 의견', r.prev], ['처리 의견', r.cmt]].filter(function(x){ return x[1]; });
  $('#mBody').innerHTML = '<div class="kv">' + kv.map(function(x){ return '<span>' + x[0] + '</span><b>' + esc(x[1]) + '</b>'; }).join('') + '</div>' +
    blk.map(function(x){ return '<div class="blk"><div>' + x[0] + '</div><p>' + esc(x[1]) + '</p></div>'; }).join('');
  $('#mTitle').innerHTML = tagType(r.type) + ' ' + esc(r.no) + ' · ' + esc(r.loc || '');
  $('#modal').classList.add('open');
}

/* ---------- 저장 (복호화 후에만) ---------- */
function sheet(rows){ var ws = XLSX.utils.aoa_to_sheet(rows);
  ws['!cols'] = rows[0].map(function(h, i){ var w = 8; rows.slice(0, 200).forEach(function(r){ var v = String(r[i] == null ? '' : r[i]); var l = 0; for (var k = 0; k < v.length; k++) l += v.charCodeAt(k) > 255 ? 2 : 1; w = Math.max(w, Math.min(60, l + 2)); }); return { wch:w }; });
  if (rows.length > 1) ws['!autofilter'] = { ref: XLSX.utils.encode_range({ s:{ r:0, c:0 }, e:{ r:rows.length - 1, c:rows[0].length - 1 } }) };
  return ws; }
function saveXlsx(){
  if (!decrypted()) return toast('KEY로 복호화한 뒤에 저장할 수 있습니다', true);
  var L = sorted(statRows(), S.st.sort.list); if (!L.length) return toast('저장할 데이터가 없습니다', true);
  var m = agg(L), lv = autoLevel(L), O = sorted(orgRows(L, lv), S.st.sort.org || { k:'t', dir:-1 }, mGet), MR = monthRows(L), P = sorted(peopleOf(L), S.st.sort.people, pGet);
  var mHead = ['개선제안','위험성평가','아차사고','합계','처리대기','완료','반려','완료율(%)','제출인원'], mVals = function(x){ return [x.p, x.r, x.n, x.t, x.open, x.done, x.rej, x.rate, x.people]; };
  var wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, sheet([['항목','값'], ['조회 조건', condText()], ['조회 건수', m.t], ['개선제안', m.p], ['위험성평가', m.r], ['아차사고', m.n], ['처리 완료율(%)', m.rate], ['제출 인원', m.people],
    ['KEY', S.keyMeta ? S.keyMeta.scope + ' (' + (S.keyMeta.created || '') + ' 발급)' : ''], ['저장 시각', new Date().toLocaleString('ko-KR')]]), '조회조건·요약');
  XLSX.utils.book_append_sheet(wb, sheet([[LV[lv]].concat(mHead)].concat(O.map(function(x){ return [x.name].concat(mVals(x)); })).concat([['합계'].concat(mVals(m))])), LV[lv] + '별현황');
  XLSX.utils.book_append_sheet(wb, sheet([['월','개선제안','위험성평가','아차사고','합계']].concat(MR.map(function(x){ return [x.name, x.p, x.r, x.n, x.t]; }))), '월별현황');
  XLSX.utils.book_append_sheet(wb, sheet([['접수번호','유형','상태','사업팀','그룹','팀','파트','장소','사고유형/위험요인','발생일시','제안등급','결정등급','위험정도(제출)','위험정도(반영)','상세내용/상황설명','조치요청사항','재발방지의견','처리의견','식별코드','사번','성명','제출일시','종료일시']]
    .concat(L.map(function(r){ return [r.no, r.type, r.status, r.team, r.site, r.dept, r.part, r.loc, r.cat, r.occ, r.pg, r.fg, r.rl, r.fr, r.detail, r.req, r.prev, r.cmt, r.code, r.empId, r.name, r.at, r.closed]; }))), '접수내역(실명)');
  XLSX.utils.book_append_sheet(wb, sheet([['순위','사번','성명','소속(제출 당시)','개선제안','위험성평가','아차사고','합계','위원회의결','조치·반영완료']]
    .concat(P.map(function(p, i){ return [i + 1, p.empId || '', p.name || p.mask || '', p.unit, p.p, p.r, p.n, p.t, p.comm, p.done]; }))), '제출자별집계');
  XLSX.writeFile(wb, '안전보건제안_데이터현황(실명)_' + today() + '.xlsx');
  toast('데이터 현황 엑셀을 저장했습니다 (시트 5개)');
}
function clearAll(){ S.key = null; S.keyMeta = null; KEYSRC = null; SHARED = null; DUP = 0; $('#keyPick').innerHTML = ''; S.rows = []; S.files = []; S.dec.page = 1; S.st.page = 1; S.view = 'dec';
  $$('.step').forEach(function(c){ c.classList.remove('done'); $('.st', c).innerHTML = c.dataset.ph; }); render(); toast('불러온 내용을 모두 지웠습니다'); }

/* ---------- 이벤트 ---------- */
$('#keyBtn').addEventListener('click', openKey);
$('#keyPw').addEventListener('keydown', function(e){ if (e.key === 'Enter') openKey(); });
$('#dataFile').addEventListener('change', function(){ openData(); });
$('#dataPasteBtn').addEventListener('click', pasteData);
$('#keyFile').addEventListener('change', async function(){ var f = this.files && this.files[0]; this.value = ''; if (f) await setKeySource(f); });
/* 파일을 창 아무 곳에나 끌어다 놓으면 KEY / 데이터를 알아서 구분 */
['dragover','drop'].forEach(function(ev){ document.addEventListener(ev, function(e){ e.preventDefault(); }); });
document.addEventListener('drop', function(e){ var fs = e.dataTransfer && e.dataTransfer.files; if (fs && fs.length) openData(fs); });
$$('.apptab').forEach(function(b){ b.addEventListener('click', function(){
  if (b.dataset.view === 'stat' && !decrypted()) return toast('먼저 ① 복호화에서 데이터와 KEY를 넣어 주세요. 복호화 후에 조회 · 저장할 수 있습니다', true);
  S.view = b.dataset.view; render(); window.scrollTo(0, 0); }); });
document.addEventListener('click', function(e){
  var go = e.target.closest('[data-go]'); if (go){ S.view = go.dataset.go; render(); window.scrollTo(0, 0); return; }
  var h = e.target.closest('th[data-t]'); if (h){ setSort(h.dataset.t, h.dataset.k); return; }
  var pg = e.target.closest('[data-pg]'); if (pg){ if (pg.dataset.pt === 'dec') S.dec.page = +pg.dataset.pg; else S.st.page = +pg.dataset.pg; render(); return; }
  var pr = e.target.closest('[data-period]'); if (pr){ setPeriod(pr.dataset.period); return; }
  var sb = e.target.closest('.subtab'); if (sb){ S.st.sub = sb.dataset.sub; render(); return; }
  var tr = e.target.closest('tr[data-i]'); if (tr){ openDetail(S.rows[+tr.dataset.i]); return; }
});
$('#saveBtn').addEventListener('click', saveXlsx);
$('#clearBtn').addEventListener('click', clearAll);
$('#sReset').addEventListener('click', function(){ S.st.f = { type:'all', team:'all', site:'all', dept:'all', part:'all', status:'all', only:'all', from:'', to:'', q:'' }; S.st.lv = 'auto'; S.st.sort = {}; S.st.page = 1; $('#sQ').value = ''; render(); });
var CH = [['sType','type'],['sTeam','team'],['sSite','site'],['sDept','dept'],['sPart','part'],['sStatus','status'],['sOnly','only'],['sFrom','from'],['sTo','to']];
CH.forEach(function(p){ $('#' + p[0]).addEventListener('change', function(){ var f = S.st.f; f[p[1]] = this.value;
  if (p[1] === 'team'){ f.site = f.dept = f.part = 'all'; } if (p[1] === 'site'){ f.dept = f.part = 'all'; } if (p[1] === 'dept') f.part = 'all';
  S.st.page = 1; render(); }); });
$('#sLv').addEventListener('change', function(){ S.st.lv = this.value; S.st.sort.org = null; render(); });
$('#sQ').addEventListener('input', function(){ S.st.f.q = this.value; S.st.page = 1; render(); });
$('#dQ').addEventListener('input', function(){ S.dec.q = this.value; S.dec.page = 1; render(); });
$('#modal').addEventListener('click', function(e){ if (e.target.id === 'modal' || e.target.closest('[data-close]')) $('#modal').classList.remove('open'); });
document.addEventListener('keydown', function(e){ if (e.key === 'Escape') $('#modal').classList.remove('open'); });
$$('.step').forEach(function(c){ c.dataset.ph = $('.st', c).innerHTML; });
render();
})();
