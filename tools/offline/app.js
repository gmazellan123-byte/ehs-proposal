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

var S = { key:null, keyMeta:null, rows:[], files:[], tab:'list', page:1, sel:null,
  f:{ type:'all', status:'all', team:'all', site:'all', from:'', to:'', q:'', only:'all' } };
var PAGE = 100;
var TYPES = ['개선제안','위험성평가','아차사고'];

/* ---------- 2. KEY 열기 (본사에서 받은 .ehskey + 비밀번호 · 이 PC 메모리에서만 풂) ---------- */
function ub64(s){ var b = atob(s), u = new Uint8Array(b.length); for (var i = 0; i < b.length; i++) u[i] = b.charCodeAt(i); return u; }
/* KEY 원본: 파일 선택 · 끌어다 놓기 · 1번 칸에 잘못 넣은 파일 · 붙여넣은 내용 중 하나 */
var KEYSRC = null;   // { name, text }
function isKeyText(t){ try { var o = JSON.parse(t); return !!o && (o.format === 'ehs-key' || o.format === 'ehs-matchkey'); } catch(e){ return false; } }
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

/* ---------- 엑셀 읽기 공통 ---------- */
async function readSheet(file){
  var wb = XLSX.read(await file.arrayBuffer(), { type:'array' });
  return XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header:1, raw:false, defval:'' });
}
function findHeader(aoa, names){ return aoa.slice(0, 20).findIndex(function(r){ return r.some(function(c){ return names.indexOf(low(c)) > -1; }); }); }
function colOf(head, names){ return head.findIndex(function(h){ return names.indexOf(h) > -1; }); }

/* ---------- 1. 받은 데이터 (모바일·PC에서 내보낸 접수목록 엑셀/CSV, 여러 개 가능) ---------- */
var D_COLS = { no:['접수번호'], type:['유형'], status:['상태'], team:['사업팀'], site:['그룹'], dept:['팀'], part:['파트'], loc:['장소'], pg:['제안등급'], fg:['결정등급'],
  rl:['위험정도(제출)'], fr:['위험정도(반영)'], cat:['사고유형/위험요인','사고유형'], occ:['발생일시'], detail:['상세내용/상황설명','상세내용'], req:['조치요청사항'], prev:['재발방지의견'],
  cmt:['처리의견'], code:['제출자식별코드','식별코드'], mask:['제출자성명(마스킹)','성명(마스킹)'], at:['제출일시'], closed:['종료일시'], empId:['사번'], realName:['성명(실명)'] };
async function openData(list){
  var files = Array.prototype.slice.call(list && list.length ? list : $('#dataFile').files); if (!files.length) return;
  var keys = files.filter(function(f){ return /\.(ehskey|json|txt)$/i.test(f.name); });
  if (keys.length){ files = files.filter(function(f){ return keys.indexOf(f) < 0; }); await setKeySource(keys[0]); }
  if (!files.length){ $('#dataFile').value = ''; return; }
  var added = 0, dup = 0, bad = [];
  for (var fi = 0; fi < files.length; fi++){
    var file = files[fi];
    try {
      var aoa = await readSheet(file), hi = findHeader(aoa, D_COLS.no);
      if (hi < 0){ bad.push(file.name); continue; }
      var head = aoa[hi].map(low), c = {}; Object.keys(D_COLS).forEach(function(k){ c[k] = colOf(head, D_COLS[k]); });
      var seen = {}; S.rows.forEach(function(r){ seen[r.no] = 1; });
      aoa.slice(hi + 1).forEach(function(r){
        var g = function(k){ return c[k] > -1 ? String(r[c[k]] == null ? '' : r[c[k]]).trim() : ''; };
        var no = g('no'); if (!no) return; if (seen[no]){ dup++; return; } seen[no] = 1;
        S.rows.push({ no:no, type:g('type'), status:g('status'), team:g('team'), site:g('site'), dept:g('dept'), part:g('part'), loc:g('loc'),
          pg:g('pg'), fg:g('fg'), rl:g('rl'), fr:g('fr'), cat:g('cat'), occ:g('occ'), detail:g('detail'), req:g('req'), prev:g('prev'), cmt:g('cmt'),
          code:g('code').toUpperCase(), mask:g('mask'), at:g('at'), closed:g('closed'), fileId:g('empId'), fileName:g('realName') });
        added++;
      });
      S.files.push(file.name);
    } catch(e){ bad.push(file.name); }
  }
  $('#dataFile').value = '';
  if (bad.length) toast('접수목록 형식이 아닌 파일은 건너뛰었습니다: ' + bad.join(', '), true);
  S.rows.sort(function(a, b){ return a.at < b.at ? 1 : a.at > b.at ? -1 : 0; });
  setDone('data', '<b>' + S.rows.length.toLocaleString() + '건</b> · 파일 ' + S.files.length + '개' + (dup ? ' <span class="dim">(중복 ' + dup + '건 제외)</span>' : ''));
  rematch();
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

/* ---------- 필터 ---------- */
function filtered(){
  var f = S.f, q = f.q.trim().toLowerCase(), from = f.from ? f.from.replace(/-/g, '.') : '', to = f.to ? f.to.replace(/-/g, '.') + ' 99' : '';
  return S.rows.filter(function(r){
    if (f.type !== 'all' && r.type !== f.type) return false;
    if (f.status !== 'all' && r.status !== f.status) return false;
    if (f.team !== 'all' && r.team !== f.team) return false;
    if (f.site !== 'all' && r.site !== f.site) return false;
    if (from && r.at < from) return false; if (to && r.at > to) return false;
    if (f.only === 'yes' && !r.matched) return false; if (f.only === 'no' && r.matched) return false;
    if (q && [r.no, r.loc, r.detail, r.req, r.prev, r.cmt, r.cat, r.empId, r.name, r.code, r.dept, r.part, r.site].join(' ').toLowerCase().indexOf(q) < 0) return false;
    return true;
  });
}
function opts(sel, vals, label, cur){ sel.innerHTML = '<option value="all">' + label + ' 전체</option>' + vals.map(function(v){ return '<option' + (v === cur ? ' selected' : '') + '>' + esc(v) + '</option>'; }).join(''); }
function uniq(rows, k){ var v = []; rows.forEach(function(r){ if (r[k] && v.indexOf(r[k]) < 0) v.push(r[k]); }); return v.sort(function(a, b){ return a.localeCompare(b, 'ko', { numeric:true }); }); }

/* ---------- 화면 ---------- */
function tagType(t){ var c = t === '개선제안' ? 'p' : t === '위험성평가' ? 'r' : t === '아차사고' ? 'n' : 'x'; return '<span class="tt t-' + c + '">' + esc(t || '-') + '</span>'; }
function tagSt(s){ return '<span class="st">' + esc(s || '-') + '</span>'; }
function grade(r){ if (r.type === '개선제안') return (r.pg ? '제안 ' + esc(r.pg) : '') + (r.fg ? ' · 결정 <b>' + esc(r.fg) + '</b>' : '');
  if (r.type === '위험성평가') return (r.rl ? '제출 ' + esc(r.rl) : '') + (r.fr ? ' · 반영 <b>' + esc(r.fr) + '</b>' : ''); return ''; }
function unit(r){ return [r.team, r.site, r.dept, r.part].filter(Boolean).join(' › '); }
function render(){
  var has = S.rows.length;
  $('#main').classList.toggle('hidden', !has); $('#empty').classList.toggle('hidden', !!has);
  if (!has) return;
  var f = S.f;
  opts($('#fTeam'), uniq(S.rows, 'team'), '사업팀', f.team);
  opts($('#fSite'), uniq(S.rows.filter(function(r){ return f.team === 'all' || r.team === f.team; }), 'site'), '그룹', f.site);
  opts($('#fStatus'), uniq(S.rows, 'status'), '상태', f.status);
  var L = filtered(), m = L.filter(function(r){ return r.matched; }).length;
  var cnt = function(t){ return L.filter(function(r){ return r.type === t; }).length; };
  $('#kpis').innerHTML = kpi('조회', L.length, '전체 ' + S.rows.length.toLocaleString() + '건') + kpi('실명 확인', m, L.length ? Math.round(m / L.length * 100) + '%' : '-', 'g') +
    kpi('미확인', L.length - m, !S.key ? 'KEY를 열어주세요' : 'KEY 범위 밖 인원', L.length - m ? 'o' : '') +
    kpi('개선제안', cnt('개선제안'), '', 'b') + kpi('위험성평가', cnt('위험성평가'), '', 't') + kpi('아차사고', cnt('아차사고'), '', 'o');
  $$('.tabs button').forEach(function(b){ b.classList.toggle('on', b.dataset.tab === S.tab); });
  $('#vList').classList.toggle('hidden', S.tab !== 'list'); $('#vPeople').classList.toggle('hidden', S.tab !== 'people');
  if (S.tab === 'list') renderList(L); else renderPeople(L);
}
function kpi(k, v, s, c){ return '<div class="kpi ' + (c || '') + '"><span>' + k + '</span><b>' + Number(v).toLocaleString() + '</b><small>' + esc(s || '') + '</small></div>'; }
function renderList(L){
  var pages = Math.max(1, Math.ceil(L.length / PAGE)); if (S.page > pages) S.page = pages;
  var P = L.slice((S.page - 1) * PAGE, S.page * PAGE);
  $('#tbl').innerHTML = P.length ? '<table><thead><tr><th>접수번호</th><th>유형</th><th>상태</th><th>소속 (제출 당시)</th><th>장소</th><th>등급 · 위험정도</th><th>내용</th><th>사번</th><th>성명</th><th>제출일시</th></tr></thead><tbody>' +
    P.map(function(r, i){ return '<tr data-i="' + S.rows.indexOf(r) + '"><td class="mono">' + esc(r.no) + '</td><td>' + tagType(r.type) + '</td><td>' + tagSt(r.status) + '</td><td class="ell">' + esc(unit(r)) + '</td><td class="ell">' + esc(r.loc) + '</td><td>' + grade(r) + '</td>' +
      '<td class="ell w">' + esc(r.detail) + '</td><td class="mono">' + (r.empId ? esc(r.empId) : '<span class="dim">' + esc(r.code || '-') + '</span>') + '</td><td>' + (r.name ? '<b>' + esc(r.name) + '</b>' : '<span class="dim">' + esc(r.mask || '미확인') + '</span>') + '</td><td class="mono">' + esc(r.at) + '</td></tr>'; }).join('') + '</tbody></table>'
    : '<div class="none">조건에 맞는 건이 없습니다</div>';
  var a = []; for (var p = 1; p <= pages; p++) if (p === 1 || p === pages || Math.abs(p - S.page) <= 3) a.push('<button data-pg="' + p + '"' + (p === S.page ? ' class="on"' : '') + '>' + p + '</button>');
  $('#pager').innerHTML = pages > 1 ? '<span>' + S.page + ' / ' + pages + ' 페이지</span>' + a.join('') : '';
}
function peopleOf(L){
  var by = {};
  L.forEach(function(r){ var k = r.empId || ('code:' + (r.code || '?'));
    var p = by[k] = by[k] || { empId:r.empId, name:r.name, mask:r.mask, code:r.code, unit:unit(r), p:0, r:0, n:0, t:0, comm:0, done:0 };
    if (r.type === '개선제안') p.p++; else if (r.type === '위험성평가') p.r++; else if (r.type === '아차사고') p.n++;
    p.t++; if (/위원회/.test(r.status)) p.comm++; if (/완료/.test(r.status)) p.done++; });
  return Object.keys(by).map(function(k){ return by[k]; }).sort(function(a, b){ return b.t - a.t || (a.name || '').localeCompare(b.name || '', 'ko'); });
}
function renderPeople(L){
  var P = peopleOf(L);
  $('#ptbl').innerHTML = P.length ? '<table><thead><tr><th>순위</th><th>사번</th><th>성명</th><th>소속 (제출 당시)</th><th>개선제안</th><th>위험성평가</th><th>아차사고</th><th>합계</th><th>위원회 의결</th><th>조치·반영 완료</th></tr></thead><tbody>' +
    P.map(function(p, i){ return '<tr><td class="num">' + (i + 1) + '</td><td class="mono">' + (p.empId ? esc(p.empId) : '<span class="dim">' + esc(p.code) + '</span>') + '</td><td>' + (p.name ? '<b>' + esc(p.name) + '</b>' : '<span class="dim">' + esc(p.mask || '미확인') + '</span>') + '</td><td class="ell">' + esc(p.unit) + '</td>' +
      '<td class="num">' + p.p + '</td><td class="num">' + p.r + '</td><td class="num">' + p.n + '</td><td class="num"><b>' + p.t + '</b></td><td class="num">' + p.comm + '</td><td class="num">' + p.done + '</td></tr>'; }).join('') + '</tbody></table>'
    : '<div class="none">조건에 맞는 건이 없습니다</div>';
}
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

/* ---------- 정리 엑셀 저장 ---------- */
function saveXlsx(){
  var L = filtered(); if (!L.length) return toast('저장할 데이터가 없습니다', true);
  var rows = [['접수번호','유형','상태','사업팀','그룹','팀','파트','장소','사고유형/위험요인','발생일시','제안등급','결정등급','위험정도(제출)','위험정도(반영)','상세내용/상황설명','조치요청사항','재발방지의견','처리의견','식별코드','사번','성명','제출일시','종료일시']]
    .concat(L.map(function(r){ return [r.no, r.type, r.status, r.team, r.site, r.dept, r.part, r.loc, r.cat, r.occ, r.pg, r.fg, r.rl, r.fr, r.detail, r.req, r.prev, r.cmt, r.code, r.empId, r.name, r.at, r.closed]; }));
  var P = peopleOf(L), prow = [['순위','사번','성명','소속(제출 당시)','개선제안','위험성평가','아차사고','합계','위원회의결','조치·반영완료']]
    .concat(P.map(function(p, i){ return [i + 1, p.empId || '', p.name || p.mask || '', p.unit, p.p, p.r, p.n, p.t, p.comm, p.done]; }));
  var wb = XLSX.utils.book_new();
  [['접수내역(실명)', rows], ['제출자별집계', prow]].forEach(function(s){ var ws = XLSX.utils.aoa_to_sheet(s[1]);
    ws['!cols'] = s[1][0].map(function(h, i){ var w = 8; s[1].slice(0, 200).forEach(function(r){ var v = String(r[i] == null ? '' : r[i]); var l = 0; for (var k = 0; k < v.length; k++) l += v.charCodeAt(k) > 255 ? 2 : 1; w = Math.max(w, Math.min(60, l + 2)); }); return { wch:w }; });
    ws['!autofilter'] = { ref: XLSX.utils.encode_range({ s:{ r:0, c:0 }, e:{ r:s[1].length - 1, c:s[1][0].length - 1 } }) };
    XLSX.utils.book_append_sheet(wb, ws, s[0]); });
  XLSX.writeFile(wb, '안전보건제안_정리(실명)_' + today() + '.xlsx');
  toast('정리 엑셀을 저장했습니다');
}
function clearAll(){ S.key = null; S.keyMeta = null; KEYSRC = null; $('#keyPick').innerHTML = ''; S.rows = []; S.files = []; S.page = 1;
  $$('.step').forEach(function(c){ c.classList.remove('done'); $('.st', c).innerHTML = c.dataset.ph; }); render(); toast('불러온 내용을 모두 지웠습니다'); }

/* ---------- 이벤트 ---------- */
$('#keyBtn').addEventListener('click', openKey);
$('#keyPw').addEventListener('keydown', function(e){ if (e.key === 'Enter') openKey(); });
$('#dataFile').addEventListener('change', function(){ openData(); });
$('#keyFile').addEventListener('change', async function(){ var f = this.files && this.files[0]; this.value = ''; if (f) await setKeySource(f); });
/* 파일을 창 아무 곳에나 끌어다 놓으면 KEY / 데이터를 알아서 구분 */
['dragover','drop'].forEach(function(ev){ document.addEventListener(ev, function(e){ e.preventDefault(); }); });
document.addEventListener('drop', function(e){ var fs = e.dataTransfer && e.dataTransfer.files; if (fs && fs.length) openData(fs); });
$('#saveBtn').addEventListener('click', saveXlsx);
$('#clearBtn').addEventListener('click', clearAll);
$$('.tabs button').forEach(function(b){ b.addEventListener('click', function(){ S.tab = b.dataset.tab; render(); }); });
[['fType','type'],['fStatus','status'],['fTeam','team'],['fSite','site'],['fFrom','from'],['fTo','to'],['fOnly','only']].forEach(function(p){
  $('#' + p[0]).addEventListener('change', function(){ S.f[p[1]] = this.value; if (p[1] === 'team') S.f.site = 'all'; S.page = 1; render(); }); });
$('#fQ').addEventListener('input', function(){ S.f.q = this.value; S.page = 1; render(); });
$('#pager').addEventListener('click', function(e){ var b = e.target.closest('[data-pg]'); if (!b) return; S.page = +b.dataset.pg; render(); $('#tbl').scrollTop = 0; });
$('#tbl').addEventListener('click', function(e){ var tr = e.target.closest('tr[data-i]'); if (tr) openDetail(S.rows[+tr.dataset.i]); });
$('#modal').addEventListener('click', function(e){ if (e.target.id === 'modal' || e.target.closest('[data-close]')) $('#modal').classList.remove('open'); });
document.addEventListener('keydown', function(e){ if (e.key === 'Escape') $('#modal').classList.remove('open'); });
$$('.step').forEach(function(c){ c.dataset.ph = $('.st', c).innerHTML; });
render();
})();
