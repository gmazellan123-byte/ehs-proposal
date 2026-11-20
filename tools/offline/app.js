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
  var wb = XLSX.read(await file.arrayBuffer(), { type:'array', raw:true }), first = null;
  for (var i = 0; i < wb.SheetNames.length; i++){
    var aoa = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[i]], { header:1, raw:false, defval:'' });
    if (!first) first = aoa; if (findHeader(aoa, D_COLS.no) > -1) return aoa;
  }
  return first || [];
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
  cmt:['처리의견'], code:['제출자식별코드','식별코드'], lcode:['대조코드'], mask:['제출자성명(마스킹)','성명(마스킹)'], at:['제출일시'], closed:['종료일시'], empId:['사번'], realName:['성명(실명)','성명'],
  vote:['산안위의결','의결결과'], xg:['최종등급'], vq:['의결회차'] };
function ingest(aoa){
  var hi = findHeader(aoa, D_COLS.no); if (hi < 0) return null;
  var head = aoa[hi].map(low), c = {}; Object.keys(D_COLS).forEach(function(k){ c[k] = colOf(head, D_COLS[k]); });
  var rows = [];
  aoa.slice(hi + 1).forEach(function(r){
    var g = function(k){ return c[k] > -1 ? String(r[c[k]] == null ? '' : r[c[k]]).trim() : ''; };
    var no = g('no'); if (!no) return;
    rows.push({ no:no, type:g('type'), status:g('status'), team:g('team'), site:g('site'), dept:g('dept'), part:g('part'), loc:g('loc'),
      pg:g('pg'), fg:g('fg'), rl:g('rl'), fr:g('fr'), cat:g('cat'), occ:g('occ'), detail:g('detail'), req:g('req'), prev:g('prev'), cmt:g('cmt'),
      code:g('code').toUpperCase(), lcode:g('lcode').toUpperCase(), mask:g('mask'), at:g('at'), closed:g('closed'), fileId:g('empId'), fileName:g('realName'),
      vote:g('vote'), xg:g('xg'), vq:g('vq') });
  });
  return mergeRows(rows);
}
/* 머지: 여러 관리자 · 여러 날짜의 데이터를 접수번호 기준으로 하나로 합침
   같은 건이면 처리가 더 진행된 쪽(검토중 < 결과)의 상태 · 등급 · 의견을 쓰고, 빈 칸은 서로 채움 */
var M_FIELDS = ['type','status','team','site','dept','part','loc','pg','fg','rl','fr','cat','occ','detail','req','prev','cmt','code','lcode','mask','at','closed','fileId','fileName','vote','xg','vq'];
function stRank(s){ return /접수/.test(s || '') ? 0 : /검토/.test(s || '') ? 1 : s ? 2 : -1; }
function mergeRows(list){
  var idx = {}, added = 0, dup = 0, upd = 0; S.rows.forEach(function(r){ idx[r.no] = r; });
  list.forEach(function(n){
    var o = idx[n.no];
    if (!o){ idx[n.no] = n; S.rows.push(n); added++; return; }
    dup++; var ch = false;
    var newer = stRank(n.status) > stRank(o.status) || (stRank(n.status) === stRank(o.status) && (n.closed || '') > (o.closed || ''));
    if (newer) ['status','fg','fr','cmt','closed'].forEach(function(k){ if (n[k] && n[k] !== o[k]){ o[k] = n[k]; ch = true; } });
    M_FIELDS.forEach(function(k){ if (!o[k] && n[k]){ o[k] = n[k]; ch = true; } });
    if (ch) upd++;
  });
  if (added || upd) markDirty();
  return { added:added, dup:dup, upd:upd };
}
var DUP = 0;
async function finishData(){
  S.rows.sort(function(a, b){ return a.at < b.at ? 1 : a.at > b.at ? -1 : 0; });
  setDone('data', '<b>' + S.rows.length.toLocaleString() + '건</b> · ' + S.files.length + '개 묶음' + (DUP ? ' <span class="dim">(같은 접수번호 ' + DUP + '건은 합침)</span>' : ''));
  if (SHARED) await resolveShared(); else rematch();
}
async function openData(list){
  var files = Array.prototype.slice.call(list && list.length ? list : $('#dataFile').files); if (!files.length) return;
  $('#dataFile').value = '';
  var bad = [], any = false;
  for (var fi = 0; fi < files.length; fi++){
    var file = files[fi];
    try {
      if (/\.(ehskey|json|txt|tsv)$/i.test(file.name)){ var tx = await file.text();
        if (isKeyText(tx)){ await setKeySource(file); continue; }
        if (isBackupText(tx)){ if (await loadBackup(tx, file.name)) any = true; continue; }
        if (/\.(ehskey|json)$/i.test(file.name)){ bad.push(file.name); continue; } }
      var res = ingest(await readSheet(file));
      if (!res){ bad.push(file.name); continue; }
      DUP += res.dup; S.files.push(file.name); any = true;
    } catch(e){ bad.push(file.name); }
  }
  if (bad.length) toast('접수목록 · 백업 형식이 아닌 파일은 건너뛰었습니다: ' + bad.join(', '), true);
  if (any) await finishData();
}
async function pasteData(taSel){
  var ta = $(typeof taSel === 'string' ? taSel : '#dataText'), text = ta.value.trim(); if (!text) return toast('붙여넣은 내용이 없습니다. 엑셀에서 전체 선택(Ctrl+A) → 복사(Ctrl+C) 후 이 칸에 붙여넣기(Ctrl+V) 하세요', true);
  if (isKeyText(text)){ KEYSRC = { name:'붙여넣은 KEY', text:text }; ta.value = ''; $('#keyPick').innerHTML = '선택한 KEY: <b>붙여넣은 KEY</b>'; $('#keyPw').focus(); return toast('KEY 내용이라 2번 칸으로 옮겼습니다. 비밀번호를 입력하고 [KEY 열기]를 누르세요'); }
  if (isBackupText(text)){ if (await loadBackup(text, '붙여넣은 백업')){ ta.value = ''; await finishData(); } return; }
  var res = null; try { res = ingest(parseText(text)); } catch(e){}
  if (!res) return toast('접수목록 내용을 찾지 못했습니다. 첫 줄(머리글)에 "접수번호"가 포함되도록 전체를 복사해 주세요', true);
  ta.value = ''; DUP += res.dup; S.files.push('붙여넣기'); toast(res.added.toLocaleString() + '건 추가' + (res.dup ? ' · 같은 접수번호 ' + res.dup + '건 합침' : ''));
  await finishData();
}

/* ---------- 치환: 식별코드 → (KEY) 사번 · 성명 ---------- */
function rematch(){
  S.rows.forEach(function(r){
    var k = S.key && r.code ? S.key[r.code] : null;
    r.empId = k ? k.id : (r.fileId || ''); r.name = k ? k.name : (r.fileName || '');
    r.matched = !!(r.empId && r.name);
  });
  markDirty(); render();
}
function setDone(k, html){ var card = $('#c-' + k); card.classList.add('done'); $('.st', card).innerHTML = html; }
function decrypted(){ return S.rows.some(function(r){ return r.matched; }); }

/* ---------- 공통 ---------- */
function opts(sel, vals, label, cur){ sel.innerHTML = '<option value="all">' + label + ' 전체</option>' + vals.map(function(v){ return '<option' + (v === cur ? ' selected' : '') + '>' + esc(v) + '</option>'; }).join(''); if (cur !== 'all' && vals.indexOf(cur) < 0) sel.value = 'all'; }
function uniq(rows, k){ var v = []; rows.forEach(function(r){ if (r[k] && v.indexOf(r[k]) < 0) v.push(r[k]); }); return v.sort(function(a, b){ return a.localeCompare(b, 'ko', { numeric:true }); }); }
function tagType(t){ var c = t === '개선제안' ? 'p' : t === '위험성평가' ? 'r' : t === '아차사고' ? 'n' : 'x'; return '<span class="tt t-' + c + '">' + esc(t || '-') + '</span>'; }
function tagSt(s){ return '<span class="st' + (/^산안위/.test(s || '') ? ' sv' : '') + '">' + esc(s || '-') + '</span>'; }
/* 개선제안 등급: 제안등급 → 결정등급(1 · 2차 결재) → 최종등급(산안위 의결) */
var VOTES = ['원안 의결','수정 의결','부결','보류'];
function voted(r){ return !!r.vote && r.vote !== '보류'; }
function stDisp(r){ return r.type === '개선제안' && voted(r) ? '산안위 ' + r.vote : (r.status || ''); }
function gradeTxt(r){ return [r.pg ? '제안 ' + r.pg : '', r.fg ? '결정 ' + r.fg : '', voted(r) ? '최종 ' + (r.xg || (r.vote === '부결' ? '부결' : '-')) : ''].filter(Boolean).join(' → '); }
function grade(r){ if (r.type === '개선제안') return [r.pg ? '제안 ' + esc(r.pg) : '', r.fg ? '결정 ' + esc(r.fg) : '', voted(r) ? '최종 <b class="xg">' + esc(r.xg || (r.vote === '부결' ? '부결' : '-')) + '</b>' : ''].filter(Boolean).join(' → ');
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
    case 'no': var mm = /^(.+)-(\d{2})-(\d{4})$/.exec(r.no || ''); return mm ? 'B|' + mm[1] + '|' + mm[2] + '|' + mm[3] : 'A|' + String(+String(r.no).replace(/\D/g, '') || 0).padStart(9, '0');
    case 'status': return stDisp(r);
    case 'unit': return unit(r); case 'grade': return RANK[(voted(r) && r.xg) || r.fg || r.fr || r.pg || r.rl] || 9;
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
  $('#vDec').classList.toggle('hidden', S.view !== 'dec'); $('#vStat').classList.toggle('hidden', S.view !== 'stat'); $('#vCom').classList.toggle('hidden', S.view !== 'com');
  storeUi();
  if (S.view === 'dec') renderDec(); else if (S.view === 'stat') renderStat(); else renderCom();
}

/* ---------- ① 복호화 탭: 넣은 데이터 확인 (저장 없음) ---------- */
function decRows(){ var q = S.dec.q.trim().toLowerCase();
  return S.rows.filter(function(r){ return !q || [r.no, r.loc, r.detail, r.cat, r.empId, r.name, r.code, r.mask, unit(r)].join(' ').toLowerCase().indexOf(q) > -1; }); }
function listCols(t, st){ return th(t,'no','접수번호',st) + th(t,'type','유형',st) + th(t,'status','상태',st) + th(t,'unit','소속 (제출 당시)',st) + th(t,'loc','장소',st) + th(t,'grade','등급 · 위험정도',st) +
  th(t,'detail','내용',st) + th(t,'code','식별코드',st) + th(t,'emp','사번',st) + th(t,'name','성명',st) + th(t,'at','제출일시',st); }
function listRow(r){ return '<tr data-i="' + S.rows.indexOf(r) + '"><td class="mono">' + esc(r.no) + '</td><td>' + tagType(r.type) + '</td><td>' + tagSt(stDisp(r)) + '</td><td class="ell">' + esc(unit(r)) + '</td><td class="ell">' + esc(r.loc) + '</td><td>' + grade(r) + '</td>' +
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
    if (f.status !== 'all' && stDisp(r) !== f.status) return false;
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
function agg(L){ var m = { p:0, r:0, n:0, t:L.length, open:0, done:0, rej:0, ppl:{}, vote:0 };
  L.forEach(function(x){ if (voted(x)) m.vote++; if (x.type === '개선제안') m.p++; else if (x.type === '위험성평가') m.r++; else if (x.type === '아차사고') m.n++;
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
    p.t++; if (/위원회|의결/.test(r.status) || voted(r)) p.comm++; if (/완료/.test(r.status)) p.done++; });
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
  var dec = decrypted(), has = S.rows.length > 0;
  $('#statLock').classList.toggle('hidden', has); $('#statMain').classList.toggle('hidden', !has);
  if (!has) return;
  $('#statWarn').innerHTML = dec ? '' : '<div class="warnbar"><span><b>복호화 전</b> · 제출자는 식별코드 · 가린 성명으로 표시됩니다. <b>엑셀 저장은 KEY로 복호화한 뒤</b>에 할 수 있습니다.</span><button class="btn pri" data-go="dec">KEY 넣으러 가기</button></div>';
  $('#saveBtn').disabled = !dec; $('#saveBtn').title = dec ? '' : 'KEY로 복호화한 뒤 저장할 수 있습니다';
  var f = S.st.f, R = S.rows;
  opts($('#sTeam'), uniq(R, 'team'), '사업팀', f.team);
  var R1 = R.filter(function(r){ return f.team === 'all' || r.team === f.team; }); opts($('#sSite'), uniq(R1, 'site'), '그룹', f.site);
  var R2 = R1.filter(function(r){ return f.site === 'all' || r.site === f.site; }); opts($('#sDept'), uniq(R2, 'dept'), '팀', f.dept);
  var R3 = R2.filter(function(r){ return f.dept === 'all' || r.dept === f.dept; }); opts($('#sPart'), uniq(R3, 'part'), '파트', f.part);
  opts($('#sStatus'), uniq(R.map(function(r){ return { s:stDisp(r) }; }), 's'), '상태', f.status);
  $('#sType').value = f.type; $('#sOnly').value = f.only; $('#sFrom').value = f.from; $('#sTo').value = f.to; $('#sLv').value = S.st.lv;
  var L = statRows(), m = agg(L), mt = L.filter(function(r){ return r.matched; }).length;
  $('#sCond').textContent = condText();
  $('#statKpis').innerHTML = kpi('조회 건수', m.t, '전체 ' + R.length.toLocaleString() + '건') + kpi('개선제안', m.p, m.vote ? '산안위 의결 ' + m.vote + '건' : '', 'b') + kpi('위험성평가', m.r, '', 't') + kpi('아차사고', m.n, '', 'o') +
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
  var kv = [['접수번호', r.no], ['유형', r.type], ['상태', stDisp(r)], ['소속 (제출 당시)', unit(r)], ['장소', r.loc], ['사고유형 · 위험요인', r.cat], ['발생일시', r.occ],
    ['제안등급', r.pg], ['결정등급', r.fg], ['산안위 의결', r.vote ? r.vote + (r.vq ? ' (' + r.vq + ')' : '') : ''], ['최종등급', voted(r) ? (r.xg || '-') : ''], ['위험정도 (제출)', r.rl], ['위험정도 (반영)', r.fr], ['제출일시', r.at], ['종료일시', r.closed],
    ['식별코드', r.code], ['사번', r.empId || '미확인'], ['성명', r.name || r.mask || '미확인']].filter(function(x){ return x[1]; });
  var blk = [['상세 내용 · 상황 설명', r.detail], ['조치 요청사항', r.req], ['재발 방지 의견', r.prev], ['처리 의견', r.cmt]].filter(function(x){ return x[1]; });
  $('#mBody').innerHTML = '<div class="kv">' + kv.map(function(x){ return '<span>' + x[0] + '</span><b>' + esc(x[1]) + '</b>'; }).join('') + '</div>' +
    blk.map(function(x){ return '<div class="blk"><div>' + x[0] + '</div><p>' + esc(x[1]) + '</p></div>'; }).join('');
  $('#mTitle').innerHTML = tagType(r.type) + ' ' + esc(r.no) + ' · ' + esc(r.loc || '');
  $('#modal').classList.add('open');
}

/* ---------- 저장 (복호화 후에만) ---------- */
function sheet(rows){ var ws = XLSX.utils.aoa_to_sheet(rows);
  var nc = Math.max.apply(null, rows.map(function(r){ return r.length; }));
  ws['!cols'] = Array.apply(null, Array(nc)).map(function(h, i){ var w = 8; rows.slice(0, 200).forEach(function(r){ var v = String(r[i] == null ? '' : r[i]); var l = 0; for (var k = 0; k < v.length; k++) l += v.charCodeAt(k) > 255 ? 2 : 1; w = Math.max(w, Math.min(60, l + 2)); }); return { wch:w }; });
  if (rows.length > 1) ws['!autofilter'] = { ref: XLSX.utils.encode_range({ s:{ r:0, c:0 }, e:{ r:rows.length - 1, c:rows[0].length - 1 } }) };
  return ws; }
function saveXlsx(){
  if (!decrypted()) return toast('KEY로 복호화한 뒤에 저장할 수 있습니다', true);
  var L = sorted(statRows(), S.st.sort.list); if (!L.length) return toast('저장할 데이터가 없습니다', true);
  var m = agg(L), lv = autoLevel(L), O = sorted(orgRows(L, lv), S.st.sort.org || { k:'t', dir:-1 }, mGet), MR = monthRows(L), P = sorted(peopleOf(L), S.st.sort.people, pGet);
  var mHead = ['개선제안','위험성평가','아차사고','합계','처리대기','완료','반려','완료율(%)','제출인원'], mVals = function(x){ return [x.p, x.r, x.n, x.t, x.open, x.done, x.rej, x.rate, x.people]; };
  var wb = XLSX.utils.book_new(), TITLE = '안전보건 개선제안 현황';
  wb.Props = { Title:TITLE, Subject:TITLE, CreatedDate:new Date() };
  var sum = sheet([[TITLE], [], ['항목','값'], ['조회 조건', condText()], ['조회 건수', m.t], ['개선제안', m.p], ['위험성평가', m.r], ['아차사고', m.n], ['처리 완료율(%)', m.rate], ['제출 인원', m.people],
    ['KEY', S.keyMeta ? S.keyMeta.scope + ' (' + (S.keyMeta.created || '') + ' 발급)' : ''], ['저장 시각', new Date().toLocaleString('ko-KR')]]);
  sum['!merges'] = [{ s:{ r:0, c:0 }, e:{ r:0, c:1 } }]; delete sum['!autofilter'];
  XLSX.utils.book_append_sheet(wb, sum, '현황 요약');
  XLSX.utils.book_append_sheet(wb, sheet([[LV[lv]].concat(mHead)].concat(O.map(function(x){ return [x.name].concat(mVals(x)); })).concat([['합계'].concat(mVals(m))])), LV[lv] + '별현황');
  XLSX.utils.book_append_sheet(wb, sheet([['월','개선제안','위험성평가','아차사고','합계']].concat(MR.map(function(x){ return [x.name, x.p, x.r, x.n, x.t]; }))), '월별현황');
  XLSX.utils.book_append_sheet(wb, sheet([['접수번호','유형','상태','사업팀','그룹','팀','파트','장소','사고유형/위험요인','발생일시','제안등급','결정등급','산안위의결','최종등급','의결회차','위험정도(제출)','위험정도(반영)','상세내용/상황설명','조치요청사항','재발방지의견','처리의견','식별코드','사번','성명','제출일시','종료일시']]
    .concat(L.map(function(r){ return [r.no, r.type, stDisp(r), r.team, r.site, r.dept, r.part, r.loc, r.cat, r.occ, r.pg, r.fg, r.vote, voted(r) ? r.xg : '', r.vq, r.rl, r.fr, r.detail, r.req, r.prev, r.cmt, r.code, r.empId, r.name, r.at, r.closed]; }))), '접수내역(실명)');
  XLSX.utils.book_append_sheet(wb, sheet([['순위','사번','성명','소속(제출 당시)','개선제안','위험성평가','아차사고','합계','위원회의결','조치·반영완료']]
    .concat(P.map(function(p, i){ return [i + 1, p.empId || '', p.name || p.mask || '', p.unit, p.p, p.r, p.n, p.t, p.comm, p.done]; }))), '제출자별집계');
  XLSX.writeFile(wb, TITLE + '_' + today() + '.xlsx');
  toast('데이터 현황 엑셀을 저장했습니다 (시트 5개)');
}
function clearAll(){ STORE.on = false; STORE.pw = null; S.com.sel = {}; S.key = null; S.keyMeta = null; KEYSRC = null; SHARED = null; DUP = 0; $('#keyPick').innerHTML = ''; S.rows = []; S.files = []; S.dec.page = 1; S.st.page = 1; S.view = 'dec';
  $$('.step').forEach(function(c){ c.classList.remove('done'); $('.st', c).innerHTML = c.dataset.ph; }); render(); toast('불러온 내용을 모두 지웠습니다'); }


/* ===================== 백업 · 브라우저 저장 ===================== */
function nowText(){ var d = new Date(); return d.getFullYear() + '.' + pad(d.getMonth() + 1) + '.' + pad(d.getDate()) + ' ' + pad(d.getHours()) + ':' + pad(d.getMinutes()); }
function B64(buf){ var u = new Uint8Array(buf), s = ''; for (var i = 0; i < u.length; i += 0x8000) s += String.fromCharCode.apply(null, u.subarray(i, i + 0x8000)); return btoa(s); }
function rowOut(r){ return { no:r.no, type:r.type, status:r.status, team:r.team, site:r.site, dept:r.dept, part:r.part, loc:r.loc, pg:r.pg, fg:r.fg, rl:r.rl, fr:r.fr, cat:r.cat, occ:r.occ,
  detail:r.detail, req:r.req, prev:r.prev, cmt:r.cmt, code:r.code, lcode:r.lcode, mask:r.mask, at:r.at, closed:r.closed, empId:r.empId || r.fileId || '', name:r.name || r.fileName || '',
  vote:r.vote || '', xg:r.xg || '', vq:r.vq || '' }; }
function rowIn(o){ var r = { no:String(o.no) }; M_FIELDS.forEach(function(k){ r[k] = o[k] == null ? '' : String(o[k]); }); r.fileId = o.empId || ''; r.fileName = o.name || ''; return r; }
function isBackupText(t){ try { var o = JSON.parse(t); return !!o && o.format === 'ehs-offline-backup'; } catch(e){ return false; } }
async function pwKey(pw, salt, iter){ var base = await crypto.subtle.importKey('raw', new TextEncoder().encode(pw), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey({ name:'PBKDF2', hash:'SHA-256', salt:salt, iterations:iter }, base, { name:'AES-GCM', length:256 }, false, ['encrypt', 'decrypt']); }
/* 백업 묶음: 비밀번호가 있으면 AES-256-GCM으로 잠금 */
async function packRows(rows, pw){
  var body = { rows:rows.map(rowOut), keyMeta:S.keyMeta || null };
  var p = { format:'ehs-offline-backup', v:1, saved:nowText(), count:rows.length, enc:!!pw };
  if (!pw){ p.data = body; return p; }
  var salt = crypto.getRandomValues(new Uint8Array(16)), iv = crypto.getRandomValues(new Uint8Array(12)), iter = 200000;
  var ct = await crypto.subtle.encrypt({ name:'AES-GCM', iv:iv }, await pwKey(pw, salt, iter), new TextEncoder().encode(JSON.stringify(body)));
  p.kdf = { iter:iter, salt:B64(salt) }; p.iv = B64(iv); p.ct = B64(ct); return p;
}
async function unpack(p, pw){
  if (!p.enc) return p.data;
  var pt = await crypto.subtle.decrypt({ name:'AES-GCM', iv:ub64(p.iv) }, await pwKey(pw, ub64(p.kdf.salt), p.kdf.iter), ub64(p.ct));
  return JSON.parse(new TextDecoder().decode(pt));
}
async function loadBackup(text, name){
  var p = JSON.parse(text), data;
  try {
    if (p.enc){ var pw = await askPw('백업 열기', '"' + name + '" (' + (p.saved || '') + ' 저장 · ' + (p.count || 0) + '건)은 비밀번호로 잠겨 있습니다.', false); if (pw == null) return false; data = await unpack(p, pw); }
    else data = p.data;
  } catch(e){ toast('비밀번호가 올바르지 않거나 백업 파일이 손상되었습니다', true); return false; }
  var res = mergeRows((data.rows || []).filter(function(o){ return o && o.no; }).map(rowIn));
  if (data.keyMeta && !S.keyMeta) S.keyMeta = data.keyMeta;
  DUP += res.dup; S.files.push(name); toast(name + ' · ' + res.added.toLocaleString() + '건 추가' + (res.dup ? ' · 같은 접수번호 ' + res.dup + '건 합침' : ''));
  return true;
}
var BK_HEAD = ['접수번호','유형','상태','사업팀','그룹','팀','파트','장소','제안등급','결정등급','위험정도(제출)','위험정도(반영)','사고유형/위험요인','발생일시','상세내용/상황설명','조치요청사항','재발방지의견','처리의견','제출자식별코드','대조코드','제출자성명(마스킹)','제출일시','종료일시','사번','성명(실명)','산안위의결','최종등급','의결회차'];
function bkRow(r){ var o = rowOut(r); return [o.no, o.type, o.status, o.team, o.site, o.dept, o.part, o.loc, o.pg, o.fg, o.rl, o.fr, o.cat, o.occ, o.detail, o.req, o.prev, o.cmt, o.code, o.lcode, o.mask, o.at, o.closed, o.empId, o.name, o.vote, o.xg, o.vq]; }
function download(name, blob){ var a = document.createElement('a'), u = URL.createObjectURL(blob); a.href = u; a.download = name; document.body.appendChild(a); a.click(); setTimeout(function(){ URL.revokeObjectURL(u); a.remove(); }, 3000); }
async function exportBackup(kind){
  if (!S.rows.length) return toast('내보낼 데이터가 없습니다', true);
  var d = new Date(), base = '안전보건 개선제안 현황_백업_' + today() + '_' + pad(d.getHours()) + pad(d.getMinutes());
  if (kind === 'json'){ var pw = $('#bkPw').value; if (pw && pw.length < 6) return toast('백업 비밀번호는 6자 이상으로 정해 주세요', true);
    download(base + '.json', new Blob([JSON.stringify(await packRows(S.rows, pw || null))], { type:'application/json' })); $('#bkPw').value = ''; }
  if (kind === 'xlsx'){ var wb = XLSX.utils.book_new(); wb.Props = { Title:'안전보건 개선제안 현황 백업' }; XLSX.utils.book_append_sheet(wb, sheet([BK_HEAD].concat(S.rows.map(bkRow))), '백업'); XLSX.writeFile(wb, base + '.xlsx'); }
  if (kind === 'txt'){ var tsv = [BK_HEAD].concat(S.rows.map(bkRow)).map(function(r){ return r.map(function(v){ v = String(v == null ? '' : v); return /[\t\n\r"]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; }).join('\t'); }).join('\r\n');
    download(base + '.txt', new Blob(['﻿' + tsv], { type:'text/plain;charset=utf-8' })); }
  $('#bkModal').classList.remove('open'); toast('백업을 내보냈습니다 (' + S.rows.length.toLocaleString() + '건)');
}

/* 브라우저 저장: 이 PC의 브라우저 저장소(IndexedDB)에 보관 (비밀번호 없음) · 켜 두면 3분마다 자동 저장
   예전 버전에서 비밀번호로 잠가 저장한 데이터는 불러올 때 한 번만 비밀번호를 묻고, 이후에는 비밀번호 없이 저장 */
var STORE = { on:false, pw:null, last:null, dirty:false, timer:null, saved:null };
function markDirty(){ STORE.dirty = true; }
var IDB = null;
function idb(){ return new Promise(function(res, rej){ if (IDB) return res(IDB); try { var q = indexedDB.open('ehs-offline', 1);
  q.onupgradeneeded = function(){ q.result.createObjectStore('kv'); }; q.onsuccess = function(){ IDB = q.result; res(IDB); }; q.onerror = function(){ rej(q.error); }; } catch(e){ rej(e); } }); }
async function stPut(v){
  try { var db = await idb(); await new Promise(function(res, rej){ var t = db.transaction('kv', 'readwrite'); t.objectStore('kv').put(v, 'data'); t.oncomplete = res; t.onerror = function(){ rej(t.error); }; }); return true; }
  catch(e){ try { localStorage.setItem('ehs-offline-data', JSON.stringify(v)); return true; } catch(_){ return false; } } }
async function stGet(){
  try { var db = await idb(); var v = await new Promise(function(res, rej){ var t = db.transaction('kv', 'readonly'), q = t.objectStore('kv').get('data'); q.onsuccess = function(){ res(q.result); }; q.onerror = function(){ rej(q.error); }; }); if (v) return v; } catch(e){}
  try { var x = localStorage.getItem('ehs-offline-data'); return x ? JSON.parse(x) : null; } catch(_){ return null; } }
async function stDel(){
  try { var db = await idb(); await new Promise(function(res){ var t = db.transaction('kv', 'readwrite'); t.objectStore('kv').delete('data'); t.oncomplete = res; t.onerror = res; }); } catch(e){}
  try { localStorage.removeItem('ehs-offline-data'); } catch(_){} }
async function saveNow(silent){
  if (!STORE.on || !S.rows.length) return;
  if (await stPut(await packRows(S.rows, null))){ STORE.last = nowText(); STORE.dirty = false; STORE.saved = { saved:STORE.last, count:S.rows.length }; storeUi(); if (!silent) toast('브라우저에 저장했습니다 (' + S.rows.length.toLocaleString() + '건)'); }
  else toast('브라우저 저장에 실패했습니다. [백업 내보내기]를 이용해 주세요', true);
}
function startAuto(){ if (!STORE.timer) STORE.timer = setInterval(function(){ if (STORE.on && STORE.dirty) saveNow(true); }, 180000); }
async function toggleStore(){
  if (STORE.on){ await saveNow(true); STORE.on = false; storeUi(); return toast('자동 저장을 껐습니다. 저장된 데이터는 남아 있습니다'); }
  if (!S.rows.length) return toast('저장할 데이터가 없습니다. 먼저 데이터를 넣어 주세요', true);
  STORE.on = true; startAuto(); await saveNow();
  toast('브라우저 저장을 켰습니다 · 3분마다 자동 저장 (공용 PC에서는 사용하지 마세요)');
}
async function restoreStore(){
  var p = await stGet(); if (!p) return toast('저장된 데이터가 없습니다', true);
  var data;
  if (p.enc){ var pw = await askPw('브라우저 저장 불러오기', p.saved + ' 저장 · ' + (p.count || 0) + '건 · 예전 버전에서 비밀번호로 잠근 데이터입니다. 저장할 때 정한 비밀번호를 입력하세요. (이후에는 비밀번호 없이 저장됩니다)', false); if (pw == null) return;
    try { data = await unpack(p, pw); } catch(e){ return toast('저장 비밀번호가 올바르지 않습니다', true); } }
  else data = p.data || {};
  var res = mergeRows((data.rows || []).map(rowIn)); if (data.keyMeta && !S.keyMeta) S.keyMeta = data.keyMeta;
  DUP += res.dup; S.files.push('브라우저 저장(' + p.saved + ')');
  STORE.on = true; STORE.last = p.saved; startAuto(); STORE.dirty = !!p.enc;   /* 잠긴 저장본은 다음 자동 저장 때 비밀번호 없는 형식으로 바뀜 */
  toast('저장된 데이터 ' + res.added.toLocaleString() + '건을 불러왔습니다' + (res.dup ? ' · ' + res.dup + '건 합침' : '') + ' · 자동 저장 켜짐');
  await finishData();
}
async function deleteStore(){
  if (!STORE.saved && !STORE.on) return toast('이 브라우저에 저장된 데이터가 없습니다', true);
  if (!confirm('이 PC 브라우저에 저장된 데이터' + (STORE.saved ? ' ' + (STORE.saved.count || 0).toLocaleString() + '건(' + (STORE.saved.saved || '') + ' 저장)' : '') + '를 삭제할까요?\n\n· 자동 저장도 꺼집니다\n· 지금 화면의 데이터와 내보낸 백업 파일은 그대로입니다\n· 삭제 후에는 되돌릴 수 없습니다')) return;
  await stDel(); STORE.on = false; STORE.saved = null; STORE.last = null; STORE.dirty = false; storeUi(); toast('브라우저에 저장한 데이터를 삭제했습니다 · 자동 저장 꺼짐');
}
function storeUi(){
  var b = $('#storeBtn'); if (b){ b.classList.toggle('on', STORE.on); b.innerHTML = STORE.on ? '💾 자동 저장 켜짐' + (STORE.last ? ' · ' + STORE.last.slice(11) : '') : '💾 브라우저 저장'; }
  var side = $('#sideStore'); if (side) side.innerHTML = STORE.on ? '<i class="on"></i>자동 저장 켜짐 · 3분마다' + (STORE.last ? '<br><small>마지막 ' + esc(STORE.last) + '</small>' : '') : STORE.saved ? '<i></i>저장된 데이터 있음' : '<i></i>브라우저 저장 꺼짐';
  var bn = STORE.saved && !STORE.on ? '<div class="savedbar">💾 이 브라우저에 저장된 데이터 <b>' + (STORE.saved.count || 0).toLocaleString() + '건</b> (' + esc(STORE.saved.saved || '') + ' 저장)<span class="r"><button class="btn pri sm" data-store="load">불러오기</button><button class="btn sm" data-store="del">저장 삭제</button></span></div>' : '';
  $$('.savedSlot').forEach(function(el){ el.innerHTML = bn; });
  var db = $('#storeDelBtn'); if (db) db.classList.toggle('hidden', !(STORE.saved || STORE.on));
}
/* 비밀번호 입력 창 */
function askPw(title, desc, confirmMode){
  return new Promise(function(resolve){
    var m = $('#pwModal'); $('#pwTitle').textContent = title; $('#pwDesc').innerHTML = desc; $('#pwIn').value = ''; $('#pwIn2').value = '';
    $('#pwIn2').classList.toggle('hidden', !confirmMode); m.classList.add('open'); setTimeout(function(){ $('#pwIn').focus(); }, 50);
    var done = function(v){ m.classList.remove('open'); $('#pwOk').onclick = $('#pwCancel').onclick = null; $('#pwIn').onkeydown = $('#pwIn2').onkeydown = null; resolve(v); };
    var ok = function(){ var a = $('#pwIn').value;
      if (a.length < 6) return toast('비밀번호는 6자 이상으로 입력해 주세요', true);
      if (confirmMode && a !== $('#pwIn2').value) return toast('두 비밀번호가 다릅니다', true);
      done(a); };
    $('#pwOk').onclick = ok; $('#pwCancel').onclick = function(){ done(null); };
    $('#pwIn').onkeydown = $('#pwIn2').onkeydown = function(e){ if (e.key === 'Enter') ok(); if (e.key === 'Escape') done(null); };
  });
}

/* ===================== 인쇄 (보고서 · 의안) ===================== */
var LOGO = '';
function printWith(html, landscape, title){
  $('#pageStyle').textContent = '@page{size:A4 ' + (landscape ? 'landscape' : 'portrait') + ';margin:' + (landscape ? '0' : '12mm 11mm') + '}';
  $('#printArea').innerHTML = html; $('#printArea').className = landscape ? 'land' : 'port';
  document.body.classList.add('printing'); var old = document.title; document.title = title || old;
  setTimeout(function(){ window.print(); setTimeout(function(){ document.title = old; }, 500); }, 80);
}
window.addEventListener('afterprint', function(){ document.body.classList.remove('printing'); $('#printArea').innerHTML = ''; });

/* 데이터 현황 보고서 (A4 세로) */
function reportHtml(){
  var L = statRows(), m = agg(L), lv = autoLevel(L), O = sorted(orgRows(L, lv), { k:'t', dir:-1 }, mGet), MR = monthRows(L), maxT = Math.max.apply(null, MR.map(function(x){ return x.t; }).concat([1]));
  var ST = {}; L.forEach(function(r){ var t = r.type || '-', st = stDisp(r) || '-'; (ST[t] = ST[t] || {})[st] = (ST[t][st] || 0) + 1; });
  var sts = uniq(L.map(function(r){ return { s:stDisp(r) || '-' }; }), 's');
  var LS = L.slice().sort(function(a, b){ return a.at < b.at ? 1 : -1; });
  return '<div class="rp">' +
    '<div class="rp-h">' + (LOGO ? '<img src="' + LOGO + '">' : '') + '<div><h1>안전보건 개선제안 현황</h1><p>' + esc(condText()) + '</p></div><div class="rp-d">출력 ' + esc(nowText()) + '</div></div>' +
    '<div class="rp-k"><div><span>조회 건수</span><b>' + m.t + '</b></div><div class="b"><span>개선제안</span><b>' + m.p + '</b></div><div class="t"><span>위험성평가</span><b>' + m.r + '</b></div><div class="o"><span>아차사고</span><b>' + m.n + '</b></div><div class="g"><span>처리 완료율</span><b>' + m.rate + '%</b></div><div><span>제출 인원</span><b>' + m.people + '</b></div></div>' +
    '<h2>' + LV[lv] + '별 현황</h2><table><thead><tr><th>' + LV[lv] + '</th><th>개선제안</th><th>위험성평가</th><th>아차사고</th><th>합계</th><th>처리대기</th><th>완료</th><th>반려</th><th>완료율</th></tr></thead><tbody>' +
      O.map(function(x){ return '<tr><td class="l">' + esc(x.name) + '</td><td>' + x.p + '</td><td>' + x.r + '</td><td>' + x.n + '</td><td><b>' + x.t + '</b></td><td>' + x.open + '</td><td>' + x.done + '</td><td>' + x.rej + '</td><td>' + x.rate + '%</td></tr>'; }).join('') +
      '<tr class="tot"><td class="l">합계</td><td>' + m.p + '</td><td>' + m.r + '</td><td>' + m.n + '</td><td><b>' + m.t + '</b></td><td>' + m.open + '</td><td>' + m.done + '</td><td>' + m.rej + '</td><td>' + m.rate + '%</td></tr></tbody></table>' +
    '<h2>월별 현황</h2><table><thead><tr><th>월</th><th>개선제안</th><th>위험성평가</th><th>아차사고</th><th>합계</th><th style="width:38%">추이</th></tr></thead><tbody>' +
      MR.map(function(x){ return '<tr><td>' + x.name + '</td><td>' + x.p + '</td><td>' + x.r + '</td><td>' + x.n + '</td><td><b>' + x.t + '</b></td><td><div class="sbar"><i class="b" style="width:' + (x.p / maxT * 100) + '%"></i><i class="t" style="width:' + (x.r / maxT * 100) + '%"></i><i class="o" style="width:' + (x.n / maxT * 100) + '%"></i></div></td></tr>'; }).join('') + '</tbody></table>' +
    '<h2>유형별 처리 상태</h2><table><thead><tr><th>유형</th>' + sts.map(function(x){ return '<th>' + esc(x) + '</th>'; }).join('') + '<th>합계</th></tr></thead><tbody>' +
      Object.keys(ST).map(function(t){ var tt = 0; return '<tr><td class="l">' + esc(t) + '</td>' + sts.map(function(x){ var v = ST[t][x] || 0; tt += v; return '<td>' + v + '</td>'; }).join('') + '<td><b>' + tt + '</b></td></tr>'; }).join('') + '</tbody></table>' +
    '<h2>접수 내역 <small>(' + LS.length + '건' + (LS.length > 300 ? ', 최근 300건 표시' : '') + ')</small></h2><table class="list"><thead><tr><th>접수번호</th><th>유형</th><th>소속</th><th>장소</th><th>내용</th><th>상태</th><th>제출자</th><th>제출일</th></tr></thead><tbody>' +
      LS.slice(0, 300).map(function(r){ return '<tr><td>' + esc(r.no) + '</td><td>' + esc(r.type) + '</td><td class="l">' + esc([r.site, r.dept, r.part].filter(Boolean).join(' › ') || r.team) + '</td><td class="l">' + esc(r.loc) + '</td><td class="l">' + esc((r.detail || '').slice(0, 60)) + ((r.detail || '').length > 60 ? '…' : '') + '</td><td>' + esc(stDisp(r)) + '</td><td>' + esc(r.name || r.mask || '') + '</td><td>' + esc((r.at || '').slice(0, 10)) + '</td></tr>'; }).join('') + '</tbody></table>' +
    '<div class="rp-f">㈜휴먼티에스에스 · 안전보건 제안 시스템 · 소속은 제출 당시(최초 등록 부서) 기준 · 대외비</div></div>';
}
function printReport(){
  if (!statRows().length) return toast('조회 조건에 맞는 데이터가 없습니다', true);
  printWith(reportHtml(), false, '안전보건 개선제안 현황_' + today());
  toast('인쇄 창에서 "PDF로 저장"을 고르면 PDF 파일로 저장됩니다');
}

/* ===================== ③ 산안위 의결 ===================== */
S.com = { year:0, qs:{ 1:1, 2:1, 3:1, 4:1 }, basis:'closed', per:2, names:true, sel:{} };
function comBase(){ return S.rows.filter(function(r){ return r.type === '개선제안' && (/위원회|의결/.test(r.status || '') || !!r.vote); }); }
function qAll(){ return [1, 2, 3, 4].every(function(q){ return S.com.qs[q]; }); }
function qList(){ return [1, 2, 3, 4].filter(function(q){ return S.com.qs[q]; }); }
function qOf(r){ var d = S.com.basis === 'closed' ? (r.closed || r.at) : r.at, m = /^(\d{4})[.\-\/](\d{1,2})/.exec(d || ''); return m ? { y:+m[1], q:Math.ceil(+m[2] / 3), d:d } : null; }
function comRows(){ var c = S.com; return comBase().filter(function(r){ var k = qOf(r); return k && k.y === c.year && !!c.qs[k.q]; })
  .sort(function(a, b){ var x = qOf(a).d, y = qOf(b).d; return x < y ? -1 : x > y ? 1 : cmp(a.no, b.no); }); }
function qText(){ return qAll() ? '' : qList().join('·') + '분기 '; }
function comTitle(){ return S.com.year + '년 ' + qText() + '산업안전보건위원회'; }
function gradeOf(r){ return r.fg || r.pg || '-'; }
function renderCom(){
  var B = comBase(), c = S.com, years = {}; B.forEach(function(r){ var k = qOf(r); if (k) years[k.y] = 1; });
  var Y = Object.keys(years).map(Number).sort(function(a, b){ return b - a; }); if (!Y.length) Y = [new Date().getFullYear()];
  if (!c.year || Y.indexOf(c.year) < 0) c.year = Y[0];
  $('#comYears').innerHTML = Y.map(function(y){ return '<button class="tg' + (y === c.year ? ' on' : '') + '" data-cy="' + y + '">' + y + '</button>'; }).join('');
  $$('#comQs .tg').forEach(function(b){ b.classList.toggle('on', !!c.qs[b.dataset.cq]); });
  $$('#comBasis .tg').forEach(function(b){ b.classList.toggle('on', b.dataset.cb === c.basis); });
  $$('#comPer .tg').forEach(function(b){ b.classList.toggle('on', +b.dataset.cp === c.per); });
  $('#comNames').checked = c.names;
  var L = comRows(), sel = L.filter(function(r){ return c.sel[r.no]; });
  $('#comCount').innerHTML = '선택 <b>' + sel.length + '</b>건 / ' + L.length + '건';
  $('#comPrint').disabled = !sel.length; $('#comVoteAll').disabled = !sel.length;
  var vd = L.filter(voted).length, vh = L.filter(function(r){ return r.vote === '보류'; }).length;
  /* 연도 × 분기 현황 */
  var mx = {}; B.forEach(function(r){ var k = qOf(r); if (!k) return; var row = mx[k.y] = mx[k.y] || [0, 0, 0, 0]; row[k.q - 1]++; });
  var gr = { '가':0, '나':0, '다':0 }, byTeam = {}; L.forEach(function(r){ var g = gradeOf(r); if (gr[g] != null) gr[g]++; var t = r.team || '본사'; byTeam[t] = (byTeam[t] || 0) + 1; });
  var vc = {}; L.forEach(function(r){ if (r.vote) vc[r.vote] = (vc[r.vote] || 0) + 1; });
  $('#comSum').innerHTML =
    '<div class="kpis k4">' + kpi(comTitle().replace(' 산업안전보건위원회', '') + ' 의결 안건', L.length, c.basis === 'closed' ? '의결예정 결정일 기준' : '제출일 기준', 'b') +
      kpi('의결 완료', vd, VOTES.slice(0, 3).map(function(v){ return v.replace(' 의결', '') + ' ' + (vc[v] || 0); }).join(' · '), 'g') + kpi('미의결', L.length - vd, vh ? '보류 ' + vh + '건 포함' : '의결 결과 입력 대기', L.length - vd ? 'o' : '') +
      kpi('결정 등급', gr['가'] + gr['나'] + gr['다'], '가 ' + gr['가'] + ' · 나 ' + gr['나'] + ' · 다 ' + gr['다'], 't') + '</div>' +
    '<div class="grid2"><div class="panel"><div class="bar"><b class="pt">연도 · 분기별 의결 안건</b><span class="dim">칸을 누르면 그 분기로 이동</span></div><div class="tw s"><table><thead><tr><th>연도</th><th class="num">1분기</th><th class="num">2분기</th><th class="num">3분기</th><th class="num">4분기</th><th class="num">합계</th></tr></thead><tbody>' +
      Object.keys(mx).sort().reverse().map(function(y){ var row = mx[y]; return '<tr><td class="mono"><b>' + y + '</b></td>' + row.map(function(v, i){ return '<td class="num qcell' + (+y === c.year && !qAll() && qList().length === 1 && qList()[0] === i + 1 ? ' on' : '') + '" data-cy="' + y + '" data-qone="' + (i + 1) + '">' + (v || '-') + '</td>'; }).join('') + '<td class="num"><b>' + row.reduce(function(a, b){ return a + b; }, 0) + '</b></td></tr>'; }).join('') +
      (Object.keys(mx).length ? '' : '<tr><td colspan="6" class="none">위원회 의결예정 건이 없습니다</td></tr>') + '</tbody></table></div></div>' +
    '<div class="panel"><div class="bar"><b class="pt">사업팀별 (선택 기간)</b></div><div class="tw s"><table><thead><tr><th>사업팀</th><th class="num">안건</th></tr></thead><tbody>' +
      Object.keys(byTeam).sort().map(function(t){ return '<tr><td>' + esc(t) + '</td><td class="num"><b>' + byTeam[t] + '</b></td></tr>'; }).join('') + (L.length ? '' : '<tr><td colspan="2" class="none">-</td></tr>') + '</tbody></table></div></div></div>';
  $('#comList').innerHTML = L.length ? '<table><thead><tr><th style="width:34px"><input type="checkbox" id="comAll"' + (sel.length && sel.length === L.length ? ' checked' : '') + '></th><th>순번</th><th>접수번호</th><th>소속</th><th>장소</th><th>내용</th><th>제안 → 결정</th><th>의결 결과</th><th>최종등급</th><th>제안자</th><th>' + (c.basis === 'closed' ? '의결예정 결정일' : '제출일') + '</th></tr></thead><tbody>' +
    L.map(function(r, i){ var vi = S.rows.indexOf(r);
      return '<tr data-i="' + vi + '" class="' + (voted(r) ? 'vdone' : '') + '"><td><input type="checkbox" class="comChk" data-no="' + esc(r.no) + '"' + (c.sel[r.no] ? ' checked' : '') + '></td><td class="num">' + (i + 1) + '</td><td class="mono">' + esc(r.no) + '</td><td class="ell" title="' + esc(unit(r)) + '">' + esc([r.site, r.dept, r.part].filter(Boolean).join(' › ') || r.team) + '</td><td class="ell">' + esc(r.loc) + '</td><td class="ell w">' + esc(r.detail) + '</td><td style="white-space:nowrap">' + esc(r.pg || '-') + ' → <b>' + esc(r.fg || '-') + '</b></td>' +
        '<td><select class="vsel" data-vi="' + vi + '" data-vk="vote"><option value="">미입력</option>' + VOTES.map(function(v){ return '<option' + (r.vote === v ? ' selected' : '') + '>' + v + '</option>'; }).join('') + '</select></td>' +
        '<td><select class="vsel xg" data-vi="' + vi + '" data-vk="xg"' + (voted(r) && r.vote !== '부결' ? '' : ' disabled') + '><option value="">-</option>' + ['가','나','다','라'].map(function(g){ return '<option' + (r.xg === g ? ' selected' : '') + '>' + g + '</option>'; }).join('') + '</select></td><td>' + (r.name ? '<b>' + esc(r.name) + '</b>' : '<span class="dim">' + esc(r.mask || '-') + '</span>') + '</td><td class="mono">' + esc((qOf(r).d || '').slice(0, 10)) + '</td></tr>'; }).join('') + '</tbody></table>'
    : '<div class="none">' + comTitle() + ' 의결예정 개선제안이 없습니다. 연도 · 분기를 바꿔 보세요.</div>';
  var pv = $('#comPreview');
  if (!sel.length){ pv.innerHTML = '<div class="none">목록에서 체크한 안건이 여기에 의안 보고서(가로 · PT 형식)로 미리 보입니다.</div>'; return; }
  pv.innerHTML = '<div class="pvwrap">' + comPages(sel, c.per) + '</div>';
  var w = pv.clientWidth - 24, sc = Math.min(1, w / 1123);
  $$('.agpage', pv).forEach(function(p){ var box = document.createElement('div'); box.className = 'pvbox'; box.style.height = (794 * sc) + 'px'; box.style.width = (1123 * sc) + 'px'; p.parentNode.insertBefore(box, p); box.appendChild(p); p.style.transform = 'scale(' + sc + ')'; });
}
function comPages(list, per){
  var pages = []; for (var i = 0; i < list.length; i += per) pages.push(list.slice(i, i + per));
  return pages.map(function(items, pi){
    return '<section class="agpage pt' + per + '"><header><div><span class="pbadge">산업안전보건위원회 의안</span><b>' + esc(comTitle()) + ' · 안전 개선제안 의결 안건</b></div><span class="pno">' + (pi + 1) + ' / ' + pages.length + '</span></header>' +
      '<div class="items">' + items.map(function(r, j){ return agendaHtml(r, pi * per + j + 1); }).join('') + '</div>' +
      '<footer><span>㈜휴먼티에스에스 · 안전보건 제안 시스템</span><span>대외비 · 출력 ' + esc(nowText()) + '</span></footer></section>';
  }).join('');
}
function agendaHtml(r, no){
  var nm = S.com.names ? (r.name || r.mask || '-') : (r.mask || '-');
  var box = function(v){ return '<span class="' + (r.vote === v ? 'on' : '') + '">' + (r.vote === v ? '☑' : '□') + ' ' + v + '</span>'; };
  return '<article class="ag"><div class="ag-h"><span class="ano">의안 제' + no + '호</span><span class="grd">제안 ' + esc(r.pg || '-') + ' → 결정 <b>' + esc(r.fg || '-') + '</b> → 최종 <b class="fx">' + esc(voted(r) ? (r.xg || (r.vote === '부결' ? '부결' : '-')) : '　') + '</b></span></div>' +
    '<h3>' + esc(r.loc || '(장소 미기재)') + '</h3>' +
    '<div class="meta"><span>소속 <b>' + esc(unit(r) || '-') + '</b></span><span>제안자 <b>' + esc(nm) + '</b>' + (S.com.names && r.empId ? ' <i>' + esc(r.empId) + '</i>' : '') + '</span><span>접수 <b>' + esc(r.no) + '</b> · ' + esc((r.at || '').slice(0, 10)) + '</span></div>' +
    '<div class="ab main"><label>제안 내용</label><p>' + esc(r.detail || '-') + '</p></div>' +
    (r.req ? '<div class="ab"><label>조치 요청사항</label><p>' + esc(r.req) + '</p></div>' : '') +
    '<div class="vote"><label>의결</label>' + box('원안 의결') + box('수정 의결') + box('부결') + '<em>최종등급 <b>' + esc(voted(r) ? (r.xg || '') : '') + '</b></em></div></article>';
}
/* 의결 결과 입력: 원안 의결 → 최종등급 = 결정등급 / 수정 의결 → 최종등급 직접 선택 / 부결 → 최종등급 없음 / 보류 → 다음 회차 */
function setVote(r, k, v){
  if (k === 'vote'){ r.vote = v;
    if (!v || v === '보류'){ r.xg = ''; r.vq = v ? qOfText(r) : ''; }
    else { r.vq = qOfText(r); if (v === '부결') r.xg = ''; else if (v === '원안 의결' || !r.xg) r.xg = r.fg || r.pg || ''; } }
  else r.xg = v;
  markDirty(); }
function qOfText(r){ var k = qOf(r); return k ? k.y + '년 ' + k.q + '분기' : S.com.year + '년'; }
function printCom(){
  var L = comRows().filter(function(r){ return S.com.sel[r.no]; });
  if (!L.length) return toast('출력할 안건을 체크해 주세요', true);
  printWith(comPages(L, S.com.per), true, '산안위 의안 보고서_' + S.com.year + (qAll() ? '' : '_' + qList().join('·') + '분기'));
  toast('인쇄 창에서 "PDF로 저장" · 용지 방향 가로로 저장됩니다');
}

/* ---------- 이벤트 ---------- */
$('#keyBtn').addEventListener('click', openKey);
$('#keyPw').addEventListener('keydown', function(e){ if (e.key === 'Enter') openKey(); });
$('#dataFile').addEventListener('change', function(){ openData(); });
$('#dataPasteBtn').addEventListener('click', pasteData);
$('#keyFile').addEventListener('change', async function(){ var f = this.files && this.files[0]; this.value = ''; if (f) await setKeySource(f); });
/* 파일을 창 아무 곳에나 끌어다 놓으면 KEY / 데이터를 알아서 구분 */
['dragover','drop'].forEach(function(ev){ document.addEventListener(ev, function(e){ e.preventDefault(); }); });
document.addEventListener('drop', function(e){ var fs = e.dataTransfer && e.dataTransfer.files; if (fs && fs.length) openData(fs); });
[['dzData', function(fs){ openData(fs); }], ['dzKey', function(fs){ setKeySource(fs[0]); }]].forEach(function(z){ var el = $('#' + z[0]);
  el.addEventListener('dragover', function(e){ e.preventDefault(); el.classList.add('over'); });
  el.addEventListener('dragleave', function(){ el.classList.remove('over'); });
  el.addEventListener('drop', function(e){ e.preventDefault(); e.stopPropagation(); el.classList.remove('over'); var fs = e.dataTransfer && e.dataTransfer.files; if (fs && fs.length) z[1](fs); }); });
$$('.apptab').forEach(function(b){ b.addEventListener('click', function(){
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
$('#reportBtn').addEventListener('click', printReport);
$('#storeBtn').addEventListener('click', toggleStore);
$('#storeDelBtn').addEventListener('click', deleteStore);
$('#saveNowBtn').addEventListener('click', function(){ if (!STORE.on) return toggleStore(); saveNow(); });
$('#bkBtn').addEventListener('click', function(){ if (!S.rows.length) return toast('내보낼 데이터가 없습니다', true); $('#bkModal').classList.add('open'); });
$('#ioBtn').addEventListener('click', function(){ $('#ioModal').classList.add('open'); });
$('#ioFile').addEventListener('change', async function(){ var fs = this.files; if (fs && fs.length){ $('#ioModal').classList.remove('open'); await openData(fs); } this.value = ''; });
$('#ioPaste').addEventListener('click', async function(){ $('#ioModal').classList.remove('open'); await pasteData('#ioText'); });
['bkModal','ioModal'].forEach(function(id){ $('#' + id).addEventListener('click', function(e){ if (e.target.id === id || e.target.closest('[data-close]')) this.classList.remove('open');
  var k = e.target.closest('[data-bk]'); if (k) exportBackup(k.dataset.bk); }); });
(function(){ var el = $('#dzIo');
  el.addEventListener('dragover', function(e){ e.preventDefault(); el.classList.add('over'); }); el.addEventListener('dragleave', function(){ el.classList.remove('over'); });
  el.addEventListener('drop', function(e){ e.preventDefault(); e.stopPropagation(); el.classList.remove('over'); var fs = e.dataTransfer && e.dataTransfer.files; if (fs && fs.length){ $('#ioModal').classList.remove('open'); openData(fs); } }); })();
$('#comPrint').addEventListener('click', printCom);
$('#comNames').addEventListener('change', function(){ S.com.names = this.checked; render(); });
document.addEventListener('change', function(e){
  if (e.target.id === 'comAll'){ var on = e.target.checked; comRows().forEach(function(r){ if (on) S.com.sel[r.no] = 1; else delete S.com.sel[r.no]; }); render(); }
  if (e.target.classList.contains('vsel')){ var vr = S.rows[+e.target.dataset.vi]; if (vr){ setVote(vr, e.target.dataset.vk, e.target.value); render(); toast(vr.no + ' · ' + (vr.vote ? stDisp(vr) + (voted(vr) && vr.xg ? ' · 최종 ' + vr.xg + '등급' : '') : '의결 결과를 지웠습니다')); } return; }
  if (e.target.classList.contains('comChk')){ if (e.target.checked) S.com.sel[e.target.dataset.no] = 1; else delete S.com.sel[e.target.dataset.no]; render(); }
});
document.addEventListener('click', function(e){
  var t = e.target;
  if (t.closest('.comChk') || t.id === 'comAll' || t.closest('.vsel')){ e.stopPropagation(); return; }
  var y = t.closest('[data-cy]'); if (y){ S.com.year = +y.dataset.cy; if (y.dataset.qone){ S.com.qs = {}; S.com.qs[y.dataset.qone] = 1; } render(); return; }
  if (t.closest('#comQAll')){ S.com.qs = { 1:1, 2:1, 3:1, 4:1 }; render(); return; }
  var q = t.closest('[data-cq]'); if (q){ var k = q.dataset.cq;
    if (S.com.qs[k]){ if (qList().length === 1) return toast('분기는 하나 이상 선택해야 합니다', true); delete S.com.qs[k]; } else S.com.qs[k] = 1; render(); return; }
  if (t.closest('#comVoteAll')){ var VS = comRows().filter(function(r){ return S.com.sel[r.no]; }); VS.forEach(function(r){ setVote(r, 'vote', '원안 의결'); }); render(); toast('선택 안건 ' + VS.length + '건을 원안 의결로 입력했습니다'); return; }
  var bs = t.closest('[data-cb]'); if (bs){ S.com.basis = bs.dataset.cb; render(); return; }
  var pp = t.closest('[data-cp]'); if (pp){ S.com.per = +pp.dataset.cp; render(); return; }
  if (t.closest('#comSelAll')){ comRows().forEach(function(r){ S.com.sel[r.no] = 1; }); render(); return; }
  if (t.closest('#comSelNone')){ S.com.sel = {}; render(); return; }
  var st = t.closest('[data-store]'); if (st){ if (st.dataset.store === 'load') restoreStore(); else deleteStore(); return; }
}, true);
window.addEventListener('resize', function(){ if (S.view === 'com') renderCom(); });
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
LOGO = ($('.brand img') || {}).src || '';
render();
stGet().then(function(p){ if (p && p.format === 'ehs-offline-backup'){ STORE.saved = { saved:p.saved, count:p.count }; storeUi(); } });
})();
