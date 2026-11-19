import re
import os, sys
HERE=os.path.dirname(os.path.abspath(__file__)); ROOT=os.path.abspath(os.path.join(HERE,'..','..'))
# 사용법: npm i xlsx (아무 폴더) 후  python3 tools/offline/build.py <xlsx.full.min.js 경로>
idx=open(os.path.join(ROOT,'docs','index.html'),encoding='utf-8').read()
logo=re.search(r"var LOGO = '(data:image/png;base64,[^']+)'",idx).group(1)
lib=open(sys.argv[1] if len(sys.argv)>1 else '/tmp/xl/node_modules/xlsx/dist/xlsx.full.min.js',encoding='utf-8').read()
app=open(os.path.join(HERE,'app.js'),encoding='utf-8').read()
html = """<!doctype html>
<html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data: blob:; connect-src 'none'; form-action 'none'; base-uri 'none'">
<title>안전보건 제안 · 오프라인 정리 도구</title>
<style>
*{box-sizing:border-box;margin:0;padding:0}
:root{--ink:#13233F;--soft:#4A6A8F;--faint:#8A9BB3;--line:#DCE5F0;--brand:#0B5FA8;--bg:#EEF3F9;--r:14px}
body{font-family:'Pretendard','Noto Sans KR','Malgun Gothic','맑은 고딕',sans-serif;color:var(--ink);background:var(--bg);font-size:14px;min-width:1100px}
.hidden{display:none!important}
.top{display:flex;align-items:center;gap:16px;padding:0 28px;height:78px;background:linear-gradient(180deg,#fff,#EDF5FD);border-bottom:3px solid transparent;border-image:linear-gradient(90deg,#0B4F96,#1E8BD8,#38BDF8) 1}
.top img{height:46px}
.top h1{font-size:22px;font-weight:900;color:#0B2E5C;letter-spacing:-.6px}
.top p{font-size:12.5px;color:var(--soft);margin-top:2px}
.top .badge{margin-left:auto;display:flex;align-items:center;gap:8px;padding:8px 14px;border-radius:10px;background:#E8F7EE;color:#13693A;font-weight:700;font-size:12.5px;border:1px solid #BFE6CD}
.top .badge i{width:8px;height:8px;border-radius:50%;background:#16A34A}
.wrap{padding:18px 28px 30px}
.steps{display:grid;grid-template-columns:1fr 1.15fr;gap:12px}
.step{background:#fff;border:1px solid var(--line);border-radius:var(--r);padding:14px 16px;position:relative;box-shadow:0 4px 12px rgba(20,40,80,.05)}
.step h3{display:flex;align-items:center;gap:8px;font-size:15px;font-weight:800;margin-bottom:8px}
.step h3 .n{width:24px;height:24px;border-radius:7px;background:#1E8BD8;color:#fff;display:flex;align-items:center;justify-content:center;font-size:13px}
.step.done{border-color:#9ED8B4;background:linear-gradient(180deg,#F4FBF6,#fff)}
.step.done h3 .n{background:#16A34A}
.step.done h3::after{content:"완료";margin-left:auto;font-size:11.5px;font-weight:800;color:#16A34A;background:#E3F5EA;padding:2px 8px;border-radius:6px}
.step .st{font-size:12.5px;color:var(--soft);margin-top:8px;line-height:1.5}
.step .row{display:flex;gap:6px}
.pick{font-size:12.5px;color:#0E6B37;margin-top:6px}.pick:empty{display:none}
details.paste{margin-top:8px;font-size:12.5px;color:var(--soft)}
details.paste summary{cursor:pointer;font-weight:700}
details.paste textarea{width:100%;height:70px;margin-top:6px;font:12px Consolas,monospace;padding:8px;border:1px solid #C9D6E5;border-radius:9px;resize:vertical}
.dim{color:var(--faint)}
input[type=file]{font-size:12.5px;width:100%;padding:7px;border:1px dashed #B9C6D8;border-radius:9px;background:#F7FAFD}
input[type=password],input[type=search],input[type=date],select{font:inherit;font-size:13px;padding:8px 10px;border:1px solid #C9D6E5;border-radius:9px;background:#fff;color:var(--ink)}
input[type=password]{flex:1;min-width:0}
button{font:inherit;cursor:pointer}
.btn{padding:8px 14px;border-radius:9px;border:1px solid #C9D6E5;background:linear-gradient(180deg,#fff,#F1F5FA);font-weight:700;font-size:13px;color:var(--ink);white-space:nowrap}
.btn.pri{color:#fff;border-color:transparent;background:linear-gradient(180deg,#1E9BEA,#0B5FA8)}
.btn:disabled{opacity:.5;cursor:default}
.notice{margin-top:12px;padding:10px 14px;border-radius:11px;background:#FFF7ED;border:1px solid #FCD9B6;color:#7A4A12;font-size:12.5px;line-height:1.6}
#empty{margin-top:16px;padding:46px;text-align:center;background:#fff;border:1px dashed #C9D6E5;border-radius:var(--r);color:var(--soft);line-height:1.8}
#empty b{color:var(--ink)}
.kpis{display:grid;grid-template-columns:repeat(6,1fr);gap:10px;margin-top:16px}
.kpi{background:#fff;border:1px solid var(--line);border-radius:12px;padding:10px 14px}
.kpi span{font-size:12px;color:var(--soft);font-weight:700}
.kpi b{display:block;font-size:24px;font-weight:800;margin-top:2px;font-family:Consolas,monospace}
.kpi small{font-size:11.5px;color:var(--faint)}
.kpi.g b{color:#16A34A}.kpi.o b{color:#E25E07}.kpi.b b{color:#1D4ED8}.kpi.t b{color:#0F766E}
.panel{margin-top:12px;background:#fff;border:1px solid var(--line);border-radius:var(--r);overflow:hidden;box-shadow:0 4px 12px rgba(20,40,80,.05)}
.bar{display:flex;align-items:center;gap:8px;flex-wrap:wrap;padding:10px 14px;border-bottom:1px solid var(--line);background:linear-gradient(180deg,#FBFCFE,#F1F5F9)}
.tabs{display:flex;gap:4px;padding:3px;border-radius:10px;background:#E3EAF3;margin-right:6px}
.tabs button{border:none;background:none;padding:6px 12px;border-radius:8px;font-weight:800;font-size:13px;color:var(--soft)}
.tabs button.on{background:#fff;color:var(--brand);box-shadow:0 1px 3px rgba(0,0,0,.12)}
#fQ{flex:1;min-width:150px}
.bar select{max-width:130px}
.bar .r{margin-left:auto;display:flex;gap:6px}
.tw{max-height:calc(100vh - 360px);min-height:300px;overflow:auto}
table{width:100%;border-collapse:separate;border-spacing:0;font-size:13px}
th{position:sticky;top:0;background:#F3F7FB;color:var(--soft);font-size:12px;font-weight:800;text-align:left;padding:9px 10px;border-bottom:1px solid #CFDBE8;white-space:nowrap;z-index:1}
td{padding:8px 10px;border-bottom:1px solid #EDF1F6;white-space:nowrap;vertical-align:middle}
tbody tr:hover td{background:#F4F9FE}
#tbl tbody tr{cursor:pointer}
td.ell{max-width:180px;overflow:hidden;text-overflow:ellipsis}
td.ell.w{max-width:300px;color:var(--soft)}
td.num{text-align:right;font-family:Consolas,monospace}
.mono{font-family:Consolas,monospace}
.tt{display:inline-block;padding:2px 8px;border-radius:6px;font-size:11.5px;font-weight:800}
.t-p{background:#E7EEFF;color:#1D4ED8}.t-r{background:#E3F6F3;color:#0F766E}.t-n{background:#FFEEDF;color:#E25E07}.t-x{background:#EEF1F5;color:#64748B}
.st{display:inline-block;padding:2px 8px;border-radius:999px;font-size:11.5px;font-weight:700;background:#EEF3F9;color:#334155}
.none{padding:40px;text-align:center;color:var(--faint)}
#pager{display:flex;justify-content:center;align-items:center;gap:4px;padding:8px;border-top:1px solid var(--line)}
#pager:empty{display:none}
#pager span{margin-right:auto;font-size:12px;color:var(--faint)}
#pager button{min-width:32px;height:30px;border-radius:8px;border:1px solid #C9D6E5;background:#fff;font-weight:700}
#pager button.on{background:#0B5FA8;color:#fff;border-color:transparent}
.foot{margin-top:14px;font-size:12px;color:var(--faint);line-height:1.6}
#modal{position:fixed;inset:0;background:rgba(15,25,45,.45);display:none;align-items:center;justify-content:center;padding:24px;z-index:50}
#modal.open{display:flex}
.mbox{width:100%;max-width:760px;max-height:calc(100vh - 48px);overflow:auto;background:#fff;border-radius:16px;box-shadow:0 24px 60px rgba(0,0,0,.3)}
.mh{display:flex;align-items:center;gap:8px;padding:16px 20px;border-bottom:1px solid var(--line);font-size:16px;font-weight:800;position:sticky;top:0;background:#fff}
.mh button{margin-left:auto;border:1px solid #C9D6E5;background:#fff;border-radius:8px;width:32px;height:32px}
#mBody{padding:16px 20px 22px}
.kv{display:grid;grid-template-columns:150px 1fr;border:1px solid var(--line);border-radius:12px;overflow:hidden}
.kv span,.kv b{padding:8px 12px;border-bottom:1px solid #EDF1F6;font-size:13px}
.kv span{background:#F6F9FC;color:var(--soft);font-weight:700}
.kv b{font-weight:600}
.blk{margin-top:12px}
.blk div{font-size:12px;font-weight:800;color:var(--brand);margin-bottom:5px}
.blk p{white-space:pre-wrap;line-height:1.65;padding:10px 12px;border-radius:10px;background:#F6F9FC;border:1px solid var(--line)}
.toast{position:fixed;left:50%;bottom:26px;transform:translate(-50%,20px);opacity:0;transition:all .2s;background:#13233F;color:#fff;padding:11px 18px;border-radius:12px;font-weight:700;font-size:13.5px;z-index:60;pointer-events:none;max-width:80vw}
.toast.show{opacity:1;transform:translate(-50%,0)}
.toast.err{background:#C62828}
@media print{.top .badge,.steps,.bar,.notice,#pager,.foot{display:none!important}.tw{max-height:none}body{min-width:0;background:#fff}}
</style></head><body>
<div class="top"><img src="__LOGO__" alt="로고"><div><h1>안전보건 제안 · 오프라인 정리 도구</h1><p>현장에서 받은 데이터 파일과 본사에서 받은 KEY로 식별코드를 실제 사번 · 성명으로 바꿔 봅니다</p></div>
<div class="badge"><i></i>인터넷 연결 없이 동작 · 불러온 파일은 이 PC 밖으로 나가지 않음</div></div>
<div class="wrap">
 <div class="steps">
  <div class="step" id="c-data"><h3><span class="n">1</span>데이터 파일 넣기</h3>
   <input type="file" id="dataFile" accept=".xlsx,.xls,.csv" multiple>
   <div class="st">휴대폰·PC에서 <b>[내보내기]</b>로 받은 접수목록 엑셀 · CSV (여러 개 선택 가능, 접수번호 기준 중복 제거)</div></div>
  <div class="step" id="c-key"><h3><span class="n">2</span>KEY 넣기</h3>
   <input type="file" id="keyFile">
   <div class="pick" id="keyPick"></div>
   <div class="row" style="margin-top:7px"><input type="password" id="keyPw" placeholder="KEY 비밀번호 (본사에서 따로 안내)" autocomplete="off"><button class="btn pri" id="keyBtn">KEY 열기</button></div>
   <details class="paste"><summary>KEY 파일 대신 KEY 내용을 받았나요? (메일 본문 등)</summary><textarea id="keyText" placeholder='{"format":"ehs-key", … 로 시작하는 내용을 처음부터 끝까지 붙여넣기' spellcheck="false"></textarea></details>
   <div class="st">본사에서 받은 <b>KEY_….ehskey 파일</b> + 따로 받은 비밀번호 → 식별코드를 사번 · 성명으로 바꿉니다</div></div>
 </div>
 <div class="notice"><b>개인정보 안내</b> · 이 화면에는 사번과 실명이 표시됩니다. 불러온 내용은 <b>이 창의 메모리에만</b> 있고, 창을 닫으면 사라집니다. 정리 엑셀은 업무 목적으로만 쓰고 사내 PC에만 보관하세요. <b>KEY 파일과 비밀번호는 같은 곳에 적어 두거나 함께 보내지 마세요.</b></div>
 <div id="empty"><b>1 · 2 단계의 파일을 넣으면</b> 여기에 전체 내용이 표시됩니다. 파일을 이 창에 <b>끌어다 놓아도</b> 데이터/KEY를 알아서 구분합니다.<br>순서는 상관없으며, KEY 없이 데이터만 넣어도 내용을 볼 수 있습니다(이 경우 제출자는 식별코드·가린 성명으로 표시).</div>
 <div id="main" class="hidden">
  <div class="kpis" id="kpis"></div>
  <div class="panel">
   <div class="bar">
    <div class="tabs"><button data-tab="list" class="on">접수 내역</button><button data-tab="people">제출자별 집계</button></div>
    <select id="fType"><option value="all">유형 전체</option><option>개선제안</option><option>위험성평가</option><option>아차사고</option></select>
    <select id="fStatus"></select><select id="fTeam"></select><select id="fSite"></select>
    <input type="date" id="fFrom" title="제출일 시작"><span class="dim">~</span><input type="date" id="fTo" title="제출일 종료">
    <select id="fOnly"><option value="all">실명 확인 전체</option><option value="yes">실명 확인된 건</option><option value="no">미확인 건</option></select>
    <input type="search" id="fQ" placeholder="접수번호 · 장소 · 내용 · 사번 · 성명 검색">
    <div class="r"><button class="btn pri" id="saveBtn">정리 엑셀 저장</button><button class="btn" id="clearBtn">모두 지우기</button></div>
   </div>
   <div id="vList"><div class="tw" id="tbl"></div><div id="pager"></div></div>
   <div id="vPeople" class="hidden"><div class="tw" id="ptbl"></div></div>
  </div>
  <p class="foot">행을 누르면 상세 내용을 볼 수 있습니다. 소속은 제출 당시(최초 등록 부서) 기준입니다. 미확인: KEY 범위 밖 인원(다른 사업장 소속, KEY 발급 이후 신규 인원 등).</p>
 </div>
</div>
<div id="modal"><div class="mbox"><div class="mh"><span id="mTitle"></span><button data-close>✕</button></div><div id="mBody"></div></div></div>
<div class="toast" id="toast"></div>
<script>
__LIB__
</script>
<script>
__APP__
</script>
</body></html>"""
html=html.replace('__LOGO__',logo).replace('__APP__',app).replace('__LIB__',lib)
open('/home/claude/ehs-proposal/docs/ehs-offline.html','w',encoding='utf-8').write(html)
print(len(html)//1024,'KB')
