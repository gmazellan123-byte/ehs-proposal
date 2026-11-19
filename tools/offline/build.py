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
body{font-family:'Pretendard','Noto Sans KR','Malgun Gothic','맑은 고딕',sans-serif;color:var(--ink);background:var(--bg);font-size:14px;min-width:1180px}
.hidden{display:none!important}
.top{display:flex;align-items:center;gap:16px;padding:0 28px;height:78px;background:linear-gradient(180deg,#fff,#EDF5FD);border-bottom:3px solid transparent;border-image:linear-gradient(90deg,#0B4F96,#1E8BD8,#38BDF8) 1}
.top img{height:46px}
.top h1{font-size:22px;font-weight:900;color:#0B2E5C;letter-spacing:-.6px}
.top p{font-size:12.5px;color:var(--soft);margin-top:2px}
.top .badge{margin-left:auto;display:flex;align-items:center;gap:8px;padding:8px 14px;border-radius:10px;background:#E8F7EE;color:#13693A;font-weight:700;font-size:12.5px;border:1px solid #BFE6CD}
.top .badge i{width:8px;height:8px;border-radius:50%;background:#16A34A}
.wrap{padding:18px 24px 30px}
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
.apptabs{display:flex;gap:6px;margin-left:24px;padding:4px;border-radius:12px;background:#E3EAF3}
.apptab{display:flex;align-items:center;gap:7px;border:0;background:none;padding:9px 16px;border-radius:9px;font-weight:800;font-size:14px;color:var(--soft)}
.apptab .n{width:20px;height:20px;border-radius:6px;background:#B9C6D8;color:#fff;font-size:12px;display:flex;align-items:center;justify-content:center}
.apptab.on{background:#fff;color:var(--brand);box-shadow:0 1px 4px rgba(0,0,0,.14)}.apptab.on .n{background:#1E8BD8}
.apptab .lk{font-style:normal;font-size:12px;display:none}.apptab.locked .lk{display:inline}.apptab.locked{opacity:.75}
.top .badge{margin-left:auto}
.kpis.k3{grid-template-columns:repeat(3,1fr)}
.cta{margin-top:12px;padding:12px 16px;border-radius:12px;background:#F3F6FA;border:1px solid var(--line);font-size:13.5px;color:var(--soft);display:flex;align-items:center;gap:10px;flex-wrap:wrap}
.cta b{color:var(--ink)}.cta.ok{background:#EEF9F2;border-color:#BFE6CD;color:#245B3A}.cta .btn{margin-left:auto}
.pt{font-size:14px;font-weight:800;color:var(--ink);margin-right:6px}
.bar input[type=search]{flex:1;min-width:160px}
.pagerx{display:flex;justify-content:center;align-items:center;gap:4px;padding:8px;border-top:1px solid var(--line)}
.pagerx:empty{display:none}.pagerx span{margin-right:auto;font-size:12px;color:var(--faint)}
.pagerx button{min-width:32px;height:30px;border-radius:8px;border:1px solid #C9D6E5;background:#fff;font-weight:700}
.pagerx button.on{background:#0B5FA8;color:#fff;border-color:transparent}
th.srt{cursor:pointer;user-select:none}th.srt:hover{color:var(--brand)}
th.srt.asc::after{content:" ▲";font-size:9px;color:var(--brand)}th.srt.desc::after{content:" ▼";font-size:9px;color:var(--brand)}
th.num{text-align:right}
tr.tot td{font-weight:800;background:#EEF6FD;color:var(--brand);position:sticky;bottom:0}
.lock{margin-top:30px;padding:50px;text-align:center;background:#fff;border:1px dashed #C9D6E5;border-radius:var(--r)}
.lock b{font-size:18px}.lock p{color:var(--soft);margin:10px 0 18px}
.filt .bar{border-bottom:0}.filt .b2{padding-top:0}.filt .lb{font-size:12.5px;font-weight:800;color:var(--soft)}
.qbtns{display:flex;gap:4px}.btn.sm{padding:6px 10px;font-size:12px}
.cond{padding:8px 14px 12px;font-size:12.5px;color:var(--soft);border-top:1px dashed var(--line)}
.grid2{display:grid;grid-template-columns:1.25fr 1fr;gap:12px}
.tw.s{max-height:380px;min-height:0}
.barc{width:34%}.sbar{display:flex;height:12px;border-radius:6px;overflow:hidden;background:#EEF2F7}
.sbar i{display:block;height:100%}.sbar .b,.lg .b{background:#3B82F6}.sbar .t,.lg .t{background:#14B8A6}.sbar .o,.lg .o{background:#F97316}
.lg{font-size:12px;color:var(--soft);display:flex;align-items:center;gap:4px;margin-left:auto}.lg i{display:inline-block;width:10px;height:10px;border-radius:3px;margin-left:6px}
ol.how{margin:8px 0 6px 18px;font-size:12.5px;line-height:1.7;color:var(--soft)}
details.paste .btn{margin-top:6px}
.shell{display:grid;grid-template-columns:220px 1fr;min-height:100vh}
.side{position:sticky;top:0;height:100vh;display:flex;flex-direction:column;padding:18px 14px;color:#fff;background:linear-gradient(185deg,#0A2F63 0%,#0B4F96 55%,#1673C4 100%)}
.brand{display:flex;align-items:center;gap:10px;padding:2px 6px 18px;border-bottom:1px solid rgba(255,255,255,.16)}
.brand img{height:40px;filter:drop-shadow(0 2px 4px rgba(0,0,0,.25))}.brand b{display:block;font-size:17px;font-weight:900;letter-spacing:-.4px}.brand span{font-size:11.5px;opacity:.8}
.snav{display:flex;flex-direction:column;gap:8px;margin-top:18px}
.apptab{display:flex;align-items:center;gap:10px;width:100%;border:0;text-align:left;padding:12px 12px;border-radius:12px;background:rgba(255,255,255,.07);color:#fff;font-weight:800;font-size:15px}
.apptab:hover{background:rgba(255,255,255,.14)}
.apptab .n{width:26px;height:26px;flex:none;border-radius:8px;background:rgba(255,255,255,.18);display:flex;align-items:center;justify-content:center;font-size:13px}
.apptab .tx small{display:block;font-size:11px;font-weight:600;opacity:.75;margin-top:1px}
.apptab.on{background:#fff;color:#0B4F96;box-shadow:0 6px 16px rgba(0,0,0,.18)}.apptab.on .n{background:#1E8BD8;color:#fff}
.sfoot{margin-top:auto;display:flex;flex-direction:column;gap:8px}
.sfoot .badge{display:flex;align-items:center;gap:7px;padding:8px 10px;border-radius:9px;background:rgba(255,255,255,.1);font-size:12px;font-weight:700}
.sfoot .badge i{width:8px;height:8px;border-radius:50%;background:#4ADE80}
.sfoot .btn.ghost{background:rgba(255,255,255,.1);border-color:rgba(255,255,255,.25);color:#fff}
.sfoot p{font-size:11px;opacity:.7;line-height:1.5}
.mainc{min-width:0}
.ph{display:flex;align-items:baseline;gap:12px;margin-bottom:12px}.ph h1{font-size:21px;font-weight:900;color:#0B2E5C;letter-spacing:-.5px}.ph p{color:var(--soft);font-size:13px}
.decgrid{display:grid;grid-template-columns:1.55fr 1fr;gap:14px;align-items:stretch}
.decgrid .steps{display:flex;flex-direction:column;gap:12px}
.decgrid .steps .step{flex:1;display:flex;flex-direction:column}.decgrid .steps .dz{flex:1}
.step h3 em{font-style:normal;font-size:12px;font-weight:600;color:var(--faint);margin-left:4px}
.dz{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:5px;min-height:96px;padding:14px;border:2px dashed #A9C3E3;border-radius:12px;background:linear-gradient(180deg,#F7FBFF,#EDF5FD);cursor:pointer;text-align:center;transition:.15s}
.dz:hover,.dz.over{border-color:#1E8BD8;background:#E6F1FC}
.dz b{font-size:15px;color:#0B4F96}.dz span{font-size:12px;color:var(--soft)}
.dz input{display:none}
.step.done .dz{min-height:64px;border-color:#9ED8B4;background:#F4FBF6}
.guidep{background:#fff;border:1px solid var(--line);border-radius:var(--r);padding:16px 18px;box-shadow:0 4px 12px rgba(20,40,80,.05);word-break:keep-all}
.guidep h3{font-size:14.5px;font-weight:800;margin-bottom:10px}.guidep h3+*{margin-bottom:14px}
.flow{list-style:none;display:flex;flex-direction:column;gap:8px}
.flow li{display:flex;gap:10px;align-items:flex-start;padding:9px 10px;border-radius:10px;background:#F4F8FC;border:1px solid #E1EAF4}
.flow li>span{width:22px;height:22px;flex:none;border-radius:50%;background:linear-gradient(180deg,#1E9BEA,#0B5FA8);color:#fff;font-weight:800;font-size:12px;display:flex;align-items:center;justify-content:center}
.flow b{font-size:13.5px}.flow p{font-size:12.5px;color:var(--soft);margin-top:1px;line-height:1.5}
.ways{list-style:none;display:flex;flex-direction:column;gap:5px;font-size:12.5px;color:var(--soft)}.ways b{color:var(--ink);margin-right:6px}
.guidep .notice{margin-top:0}
.warnbar{margin-bottom:12px;padding:10px 14px;border-radius:11px;background:#FFF7ED;border:1px solid #FCD9B6;color:#7A4A12;font-size:13px;display:flex;align-items:center;gap:10px}
.warnbar .btn{margin-left:auto}
#saveBtn:disabled{opacity:.45;cursor:not-allowed}
.sstore{margin-top:14px;padding:9px 11px;border-radius:10px;background:rgba(255,255,255,.08);font-size:12px;line-height:1.5}.sstore i{display:inline-block;width:8px;height:8px;border-radius:50%;background:#94A3B8;margin-right:6px}.sstore i.on{background:#4ADE80}.sstore small{opacity:.75}
.ph .acts{margin-left:auto;display:flex;gap:6px}#storeBtn.on{background:#EEF9F2;border-color:#9ED8B4;color:#166534}
.savedbar{display:flex;align-items:center;gap:10px;margin-bottom:12px;padding:10px 14px;border-radius:11px;background:#EFF6FF;border:1px solid #BFDBFE;font-size:13px}.savedbar .r{margin-left:auto;display:flex;gap:6px}
.mm{position:fixed;inset:0;background:rgba(15,25,45,.45);display:none;align-items:center;justify-content:center;padding:24px;z-index:60}.mm.open{display:flex}
.mmbox{width:640px;max-width:96vw;background:#fff;border-radius:16px;box-shadow:0 20px 50px rgba(0,0,0,.3);overflow:hidden}.mmbox.sm{width:420px}
.mmb{padding:16px 20px 20px;font-size:13.5px;line-height:1.6;color:var(--soft)}.mmb p{margin-bottom:10px}.mmb b{color:var(--ink)}
.mmb input[type=password]{width:100%;margin-top:8px}.mmf{display:flex;justify-content:flex-end;gap:6px;margin-top:14px}
.mmb .dz{margin:10px 0}.mmb textarea{width:100%;height:90px;margin-top:6px;font:12px Consolas,monospace;padding:8px;border:1px solid #C9D6E5;border-radius:9px}
.bkc{display:grid;gap:10px}.bk{display:grid;grid-template-columns:1fr auto;gap:4px 12px;align-items:center;padding:12px 14px;border:1px solid var(--line);border-radius:12px}
.bk b{font-size:14.5px}.bk em{font-style:normal;font-size:11.5px;color:#0B5FA8;margin-left:6px}.bk span{grid-column:1;font-size:12.5px}.bk input{grid-column:1}.bk .btn{grid-column:2;grid-row:1 / span 3}
.mmb .warn{margin-top:12px;color:#9A3412;font-size:12.5px}
.comgrid{display:grid;grid-template-columns:250px 1fr;gap:14px;align-items:start}
.ctrl{position:sticky;top:12px;background:#fff;border:1px solid var(--line);border-radius:var(--r);padding:14px 14px 16px;box-shadow:0 4px 12px rgba(20,40,80,.05)}
.ctrl h4{font-size:12.5px;color:var(--soft);margin:12px 0 6px}.ctrl h4:first-child{margin-top:0}
.tgs{display:flex;flex-wrap:wrap;gap:5px}.tg{border:1px solid #C9D6E5;background:#fff;border-radius:9px;padding:7px 11px;font-weight:700;font-size:13px;color:var(--soft)}
.tg.on{background:linear-gradient(180deg,#1E8BD8,#0B5FA8);border-color:transparent;color:#fff}
.chkl{display:flex;align-items:center;gap:7px;margin-top:12px;font-size:13px;font-weight:700}
.ccount{margin:12px 0 8px;font-size:13px;color:var(--soft)}.ccount b{color:var(--brand);font-size:16px}
.btn.big{width:100%;padding:12px;font-size:14.5px}.btn:disabled{opacity:.45;cursor:not-allowed}
.ctrl .hint{font-size:11.5px;color:var(--faint);margin-top:8px;line-height:1.5}
.cview{display:flex;flex-direction:column;gap:12px;min-width:0}.cview .panel{margin-top:0}.kpis.k4{grid-template-columns:repeat(4,1fr)}
.qcell{cursor:pointer}.qcell:hover{background:#EEF6FD}.qcell.on{background:#DBEAFE;font-weight:800}
.pv{padding:12px;background:#E9EEF5;min-height:120px}.pvwrap{display:flex;flex-direction:column;align-items:center;gap:12px}.pvbox{overflow:hidden;box-shadow:0 4px 16px rgba(0,0,0,.18);background:#fff}.pvbox .agpage{transform-origin:0 0}
/* ---- 의안 보고서 (A4 가로 · PT) ---- */
.agpage{width:297mm;height:210mm;padding:11mm 13mm 9mm;background:#fff;display:flex;flex-direction:column;font-family:'Pretendard','Noto Sans KR','Malgun Gothic',sans-serif;color:#13233F;box-sizing:border-box;overflow:hidden}
.agpage header{display:flex;align-items:center;justify-content:space-between;padding-bottom:4mm;border-bottom:1.2mm solid #0B4F96;margin-bottom:5mm}
.agpage header b{font-size:17pt;font-weight:900;letter-spacing:-.3px;margin-left:3mm}.pbadge{display:inline-block;padding:1.2mm 3mm;border-radius:2mm;background:#0B4F96;color:#fff;font-size:10pt;font-weight:800}
.pno{font-size:11pt;color:#64748B;font-weight:700}
.agpage .items{flex:1;display:grid;gap:5mm;min-height:0}.pt1 .items{grid-template-columns:1fr}.pt2 .items{grid-template-columns:1fr 1fr}.pt4 .items{grid-template-columns:1fr 1fr;grid-template-rows:1fr 1fr}
.agpage footer{display:flex;justify-content:space-between;margin-top:4mm;font-size:8.5pt;color:#94A3B8}
.ag>*{flex-shrink:0}.ag{display:flex;flex-direction:column;border:.4mm solid #CBD5E1;border-radius:3mm;padding:4.5mm 5mm;min-height:0;overflow:hidden;background:linear-gradient(180deg,#FBFDFF,#fff)}
.ag-h{display:flex;align-items:center;justify-content:space-between;margin-bottom:2mm}.ano{font-size:12pt;font-weight:900;color:#fff;background:linear-gradient(90deg,#EA580C,#F97316);padding:1mm 3.5mm;border-radius:1.5mm}
.grd{font-size:10pt;color:#475569}.grd b{font-size:13pt;color:#C2410C}
.ag h3{font-size:15pt;font-weight:900;margin:1mm 0 2mm;letter-spacing:-.3px}
.meta{display:flex;flex-wrap:wrap;gap:1mm 5mm;font-size:9.5pt;color:#475569;padding-bottom:2.5mm;border-bottom:.3mm dashed #CBD5E1;margin-bottom:2.5mm}.meta b{color:#13233F}.meta i{font-style:normal;color:#64748B;font-family:Consolas,monospace}
.ab{margin-bottom:2mm;min-height:0}.ab label{display:block;font-size:9pt;font-weight:800;color:#0B4F96;margin-bottom:.8mm}.ab p{font-size:11pt;line-height:1.55;white-space:pre-wrap;overflow:hidden;display:-webkit-box;-webkit-box-orient:vertical}
.pt1 .ab.main p{-webkit-line-clamp:12;font-size:12.5pt}.pt1 .ab p{-webkit-line-clamp:4}.pt2 .ab.main p{-webkit-line-clamp:10}.pt2 .ab p{-webkit-line-clamp:3}
.pt4 .ab.main p{-webkit-line-clamp:3;font-size:10pt}.pt4 .ab p{-webkit-line-clamp:1;font-size:9.5pt}.pt4 .ab{margin-bottom:1mm}.pt4 .ab.cmt{display:none}.pt4 .ag{padding:3mm 4mm}.pt4 .ag-h{margin-bottom:1mm}.pt4 .ano{font-size:10pt}.pt4 .grd{font-size:9pt}.pt4 .grd b{font-size:11pt}.pt4 .ag h3{font-size:12pt;margin:.5mm 0 1mm}.pt4 .meta{font-size:8pt;padding-bottom:1.5mm;margin-bottom:1.5mm}.pt4 .ab label{font-size:8pt;margin-bottom:.3mm}.pt4 .vote{padding-top:1.5mm;font-size:9pt}.pt4 .items{gap:4mm}.pt4 .ag h3{font-size:12.5pt}.pt4 .meta{font-size:8.5pt}
.vote{margin-top:auto;display:flex;align-items:center;gap:5mm;padding-top:2.5mm;border-top:.3mm solid #CBD5E1;font-size:10pt;font-weight:700}.vote label{color:#fff;background:#13233F;padding:.8mm 2.5mm;border-radius:1.2mm;font-size:9pt}.vote em{margin-left:auto;font-style:normal;color:#94A3B8;border-bottom:.3mm solid #CBD5E1;min-width:40mm}
/* ---- 데이터 현황 보고서 (A4 세로) ---- */
#printArea{display:none}
.rp{font-family:'Pretendard','Noto Sans KR','Malgun Gothic',sans-serif;color:#13233F;font-size:9.5pt}
.rp-h{display:flex;align-items:center;gap:4mm;padding-bottom:3mm;border-bottom:1mm solid #0B4F96;margin-bottom:4mm}.rp-h img{height:13mm}.rp-h h1{font-size:19pt;font-weight:900;letter-spacing:-.4px}.rp-h p{font-size:9pt;color:#475569;margin-top:1mm}.rp-d{margin-left:auto;font-size:8.5pt;color:#64748B}
.rp-k{display:grid;grid-template-columns:repeat(6,1fr);gap:2.5mm;margin-bottom:5mm}.rp-k div{border:.3mm solid #CBD5E1;border-radius:2mm;padding:2.5mm 3mm}.rp-k span{display:block;font-size:8pt;color:#64748B}.rp-k b{font-size:15pt;font-weight:900}
.rp-k .b b{color:#2563EB}.rp-k .t b{color:#0F766E}.rp-k .o b{color:#EA580C}.rp-k .g b{color:#16A34A}
.rp h2{font-size:11.5pt;font-weight:900;margin:5mm 0 2mm;padding-left:2.5mm;border-left:1.2mm solid #1E8BD8}.rp h2 small{font-weight:600;color:#64748B;font-size:8.5pt}
.rp table{width:100%;border-collapse:collapse;font-size:8.8pt}.rp th{background:#EEF4FB;font-weight:800;padding:1.6mm 2mm;border:.25mm solid #CBD5E1}.rp td{padding:1.4mm 2mm;border:.25mm solid #DCE3EC;text-align:center}.rp td.l{text-align:left}
.rp tr.tot td{background:#F1F7FE;font-weight:800}.rp .list td{font-size:8pt}.rp tr{page-break-inside:avoid}
.rp .sbar{display:flex;height:3mm;border-radius:1mm;overflow:hidden;background:#EEF2F7}.rp .sbar i{display:block;height:100%}.rp .sbar .b{background:#3B82F6}.rp .sbar .t{background:#14B8A6}.rp .sbar .o{background:#F97316}
.rp-f{margin-top:5mm;padding-top:2mm;border-top:.3mm solid #CBD5E1;font-size:8pt;color:#94A3B8;text-align:center}
@media print{body.printing>*:not(#printArea){display:none!important}body.printing{background:#fff;min-width:0}body.printing #printArea{display:block}
 #printArea.land .agpage{page-break-after:always;break-after:page}#printArea.land .agpage:last-child{page-break-after:auto}
 *{-webkit-print-color-adjust:exact;print-color-adjust:exact}}
.toast{position:fixed;left:50%;bottom:26px;transform:translate(-50%,20px);opacity:0;transition:all .2s;background:#13233F;color:#fff;padding:11px 18px;border-radius:12px;font-weight:700;font-size:13.5px;z-index:60;pointer-events:none;max-width:80vw}
.toast.show{opacity:1;transform:translate(-50%,0)}
.toast.err{background:#C62828}
@media print{.side,.steps,.guidep,.bar,.notice,.pagerx,.foot{display:none!important}.shell{display:block}.tw{max-height:none}body{min-width:0;background:#fff}}
</style></head><body>
<div class="shell">
<aside class="side">
 <div class="brand"><img src="__LOGO__" alt="로고"><div><b>안전보건 제안</b><span>오프라인 정리 도구</span></div></div>
 <nav class="snav">
  <button class="apptab on" data-view="dec"><span class="n">1</span><span class="tx">복호화<small>데이터 · KEY 넣기</small></span></button>
  <button class="apptab" id="tabStat" data-view="stat"><span class="n">2</span><span class="tx">데이터 현황<small>조회 · 백업 · 보고서</small></span></button>
  <button class="apptab" id="tabCom" data-view="com"><span class="n">3</span><span class="tx">산안위 의결<small>분기별 의안 · PDF</small></span></button>
 </nav>
 <div class="sstore" id="sideStore"></div>
 <div class="sfoot"><div class="badge"><i></i>인터넷 연결 없이 동작</div><button class="btn ghost" id="clearBtn" title="불러온 내용을 모두 지움">모두 지우기</button>
  <p>넣은 파일은 이 창의 메모리에만 있습니다. 계속 쓰려면 [데이터 현황]에서 브라우저 저장 · 백업을 이용하세요.</p></div>
</aside>
<main class="mainc">
<div class="wrap">
<section id="vDec">
 <div class="ph"><h1>① 복호화</h1><p>현장 데이터의 식별코드를 본사 KEY로 사번 · 성명으로 바꿉니다</p></div>
 <div class="savedSlot"></div>
 <div class="decgrid">
  <div class="steps">
   <div class="step" id="c-data"><h3><span class="n">1</span>데이터 넣기 <em>휴대폰 · PC [내보내기] 접수목록 파일</em></h3>
    <label class="dz" id="dzData"><input type="file" id="dataFile" accept=".xlsx,.xls,.csv,.txt,.tsv" multiple><b>📄 데이터 파일을 끌어다 놓거나 눌러서 선택</b><span>엑셀 · CSV · 여러 개 가능 (접수번호 기준 중복 제거)</span></label>
    <details class="paste"><summary>파일을 올릴 수 없나요? → 엑셀·메모장에서 복사해 붙여넣기</summary>
     <textarea id="dataText" placeholder="파일을 엑셀(또는 메모장)로 열고 Ctrl+A → Ctrl+C 한 뒤, 여기에 Ctrl+V" spellcheck="false"></textarea>
     <button class="btn pri" id="dataPasteBtn" type="button">붙여넣은 내용 넣기</button></details>
    <div class="st">아직 넣지 않았습니다</div></div>
   <div class="step" id="c-key"><h3><span class="n">2</span>KEY 넣기 <em>본사에서 받은 KEY 파일 + 비밀번호</em></h3>
    <label class="dz" id="dzKey"><input type="file" id="keyFile"><b>🔑 KEY 파일을 끌어다 놓거나 눌러서 선택</b><span>KEY_….ehskey (이름이 바뀌어도 내용으로 확인)</span></label>
    <div class="pick" id="keyPick"></div>
    <div class="row" style="margin-top:8px"><input type="password" id="keyPw" placeholder="KEY 비밀번호 (본사에서 문자 등으로 따로 안내)" autocomplete="off"><button class="btn pri" id="keyBtn">KEY 열기</button></div>
    <details class="paste"><summary>파일을 올릴 수 없나요? → KEY를 메모장으로 열어 붙여넣기</summary>
     <textarea id="keyText" placeholder='KEY 파일을 메모장으로 열고(오른쪽 클릭 → 연결 프로그램 → 메모장) Ctrl+A → Ctrl+C 한 뒤, 여기에 Ctrl+V' spellcheck="false"></textarea></details>
    <div class="st">아직 넣지 않았습니다</div></div>
  </div>
  <div class="guidep">
   <h3>사용 방법</h3>
   <ol class="flow">
    <li><span>1</span><div><b>데이터 넣기</b><p>휴대폰 접수목록 [내보내기]로 받은 파일을 1번 칸에 넣습니다.</p></div></li>
    <li><span>2</span><div><b>KEY 넣기</b><p>본사 KEY 파일을 2번 칸에 넣고, 따로 받은 비밀번호를 입력합니다.</p></div></li>
    <li><span>3</span><div><b>복호화 확인</b><p>식별코드가 사번 · 성명으로 바뀌었는지 아래 표에서 확인합니다.</p></div></li>
    <li><span>4</span><div><b>데이터 현황 · 저장</b><p>왼쪽 [데이터 현황]에서 조회하고 엑셀로 저장합니다.</p></div></li>
   </ol>
   <h3>넣는 방법 3가지</h3>
   <ul class="ways"><li><b>파일 선택</b> 칸을 눌러 고르기</li><li><b>끌어다 놓기</b> 창 어디에 놓아도 자동 구분</li><li><b>붙여넣기</b> 파일 업로드가 막혔을 때</li></ul>
   <div class="notice"><b>개인정보 안내</b> · 이 화면에는 사번과 실명이 표시됩니다. 저장한 엑셀은 업무 목적으로만 쓰고 사내 PC에만 보관하세요. KEY 파일과 비밀번호는 함께 보관하거나 함께 보내지 마세요.</div>
  </div>
 </div>
 <div id="empty"><b>1 · 2번 칸에 넣으면</b> 여기에 내용이 표시됩니다. 순서는 상관없습니다.</div>
 <div id="decMain" class="hidden">
  <div class="kpis k3" id="decKpis"></div>
  <div id="decCta"></div>
  <div class="panel">
   <div class="bar"><b class="pt">넣은 데이터 확인</b><span class="dim">머리글을 누르면 정렬 · 행을 누르면 상세</span><input type="search" id="dQ" placeholder="접수번호 · 장소 · 내용 · 사번 · 성명 검색"></div>
   <div class="tw" id="decTbl"></div><div id="decPager" class="pagerx"></div>
  </div>
 </div>
</section>
<section id="vStat" class="hidden">
 <div class="ph"><h1>② 데이터 현황</h1><p>조회 · 현황 · 백업 · 보고서</p>
  <div class="acts"><button class="btn" id="ioBtn">📥 불러오기 · 머지</button><button class="btn" id="bkBtn">📤 백업 내보내기</button><button class="btn" id="storeBtn">💾 브라우저 저장</button><button class="btn sm" id="saveNowBtn" title="지금 저장">지금 저장</button></div></div>
 <div class="savedSlot"></div>
 <div id="statLock" class="lock"><b>아직 넣은 데이터가 없습니다</b><p>① 복호화 탭에서 데이터 파일을 넣으면 여기에서 유형 · 소속 · 기간별 현황을 볼 수 있습니다.</p><button class="btn pri" data-go="dec">① 복호화로 가기</button></div>
 <div id="statMain" class="hidden">
  <div id="statWarn"></div>
  <div class="panel filt">
   <div class="bar">
    <select id="sType"><option value="all">유형 전체</option><option>개선제안</option><option>위험성평가</option><option>아차사고</option></select>
    <select id="sTeam"></select><select id="sSite"></select><select id="sDept"></select><select id="sPart"></select>
    <select id="sStatus"></select>
    <select id="sOnly"><option value="all">실명 확인 전체</option><option value="yes">실명 확인 건</option><option value="no">미확인 건</option></select>
   </div>
   <div class="bar b2">
    <span class="lb">기간(제출월)</span><input type="month" id="sFrom"><span class="dim">~</span><input type="month" id="sTo">
    <span class="qbtns"><button class="btn sm" data-period="year">올해</button><button class="btn sm" data-period="last">작년</button><button class="btn sm" data-period="12m">최근 12개월</button><button class="btn sm" data-period="all">전체</button></span>
    <input type="search" id="sQ" placeholder="장소 · 내용 · 사번 · 성명 검색">
    <div class="r"><button class="btn" id="sReset">조건 초기화</button><button class="btn" id="reportBtn">🖨 보고서 출력</button><button class="btn pri" id="saveBtn">엑셀 저장</button></div>
   </div>
   <div class="cond" id="sCond"></div>
  </div>
  <div class="kpis" id="statKpis"></div>
  <div class="grid2">
   <div class="panel"><div class="bar"><b class="pt" id="orgTitle">소속별 현황</b><span class="dim">단위</span><select id="sLv"><option value="auto">자동</option><option value="team">사업팀</option><option value="site">그룹</option><option value="dept">팀</option><option value="part">파트</option></select></div><div class="tw s" id="orgTbl"></div></div>
   <div class="panel"><div class="bar"><b class="pt">월별 현황</b><span class="lg"><i class="b"></i>개선제안 <i class="t"></i>위험성평가 <i class="o"></i>아차사고</span></div><div class="tw s" id="monTbl"></div></div>
  </div>
  <div class="panel">
   <div class="bar"><div class="tabs"><button class="subtab on" data-sub="list">접수 내역</button><button class="subtab" data-sub="people">제출자별 집계</button></div><span class="dim">머리글을 누르면 정렬 · 저장 엑셀에도 같은 순서로 들어갑니다</span></div>
   <div class="tw" id="stTbl"></div><div id="stPager" class="pagerx"></div>
  </div>
  <p class="foot">소속은 제출 당시(최초 등록 부서) 기준입니다. 완료 = 조치완료 · 반영 완료 · 위원회 의결. 미확인 = KEY 범위 밖 인원(KEY 발급 이후 신규 인원 등).</p>
 </div>
</section>
</div>
<section id="vCom" class="hidden">
 <div class="ph"><h1>③ 산안위 의결</h1><p>위원회 의결예정 개선제안 · 연도 · 분기별 현황과 의안 보고서(가로 PDF)</p></div>
 <div class="comgrid">
  <aside class="ctrl">
   <h4>연도</h4><div class="tgs" id="comYears"></div>
   <h4>분기</h4><div class="tgs" id="comQs"><button class="tg" data-cq="all">전체</button><button class="tg" data-cq="1">1분기</button><button class="tg" data-cq="2">2분기</button><button class="tg" data-cq="3">3분기</button><button class="tg" data-cq="4">4분기</button></div>
   <h4>분기 기준</h4><div class="tgs" id="comBasis"><button class="tg" data-cb="closed">의결예정 결정일</button><button class="tg" data-cb="at">제출일</button></div>
   <h4>한 페이지에</h4><div class="tgs" id="comPer"><button class="tg" data-cp="1">1건</button><button class="tg" data-cp="2">2건</button><button class="tg" data-cp="4">4건</button></div>
   <label class="chkl"><input type="checkbox" id="comNames" checked> 제안자 실명 · 사번 표시</label>
   <h4>안건 선택</h4><div class="tgs"><button class="tg" id="comSelAll">전체 선택</button><button class="tg" id="comSelNone">선택 해제</button></div>
   <div class="ccount" id="comCount"></div>
   <button class="btn pri big" id="comPrint" disabled>🖨 의안 보고서 PDF 출력</button>
   <p class="hint">A4 가로 · PT 형식 · 순번(의안 제N호) · 인쇄 창에서 <b>PDF로 저장</b>을 고르세요.</p>
  </aside>
  <div class="cview">
   <div id="comSum"></div>
   <div class="panel"><div class="bar"><b class="pt">의결 안건 목록</b><span class="dim">체크한 안건이 아래 미리보기 · 출력에 들어갑니다 · 행을 누르면 상세</span></div><div class="tw s" id="comList"></div></div>
   <div class="panel"><div class="bar"><b class="pt">의안 보고서 미리보기</b><span class="dim">A4 가로</span></div><div id="comPreview" class="pv"></div></div>
  </div>
 </div>
</section>
</div>
</main>
</div>
<div id="printArea"></div><style id="pageStyle"></style>
<div id="pwModal" class="mm"><div class="mmbox sm"><div class="mh"><span id="pwTitle"></span></div><div class="mmb"><p id="pwDesc"></p>
 <input type="password" id="pwIn" placeholder="비밀번호 (6자 이상)" autocomplete="off"><input type="password" id="pwIn2" class="hidden" placeholder="비밀번호 확인" autocomplete="off">
 <div class="mmf"><button class="btn" id="pwCancel">취소</button><button class="btn pri" id="pwOk">확인</button></div></div></div></div>
<div id="ioModal" class="mm"><div class="mmbox"><div class="mh"><span>📥 불러오기 · 머지</span><button data-close>✕</button></div><div class="mmb">
 <p>여러 관리자가 휴대폰에서 내보낸 데이터, 이전 백업(JSON · 엑셀 · TXT), 저장한 정리 엑셀을 <b>접수번호 기준으로 합칩니다</b>. 같은 건은 처리가 더 진행된 내용으로 갱신되고, 새 건은 추가됩니다. KEY가 열려 있으면 새로 들어온 건도 바로 사번 · 성명으로 바뀝니다.</p>
 <label class="dz" id="dzIo"><input type="file" id="ioFile" multiple accept=".xlsx,.xls,.csv,.txt,.tsv,.json"><b>📄 파일을 끌어다 놓거나 눌러서 선택 (여러 개 가능)</b><span>엑셀 · CSV · TXT · 백업 JSON</span></label>
 <details class="paste" open><summary>또는 내용 붙여넣기 (엑셀 Ctrl+A → Ctrl+C / 메모장으로 연 TXT · JSON)</summary><textarea id="ioText" placeholder="여기에 Ctrl+V" spellcheck="false"></textarea><button class="btn pri" id="ioPaste" type="button">붙여넣은 내용 합치기</button></details>
</div></div></div>
<div id="bkModal" class="mm"><div class="mmbox"><div class="mh"><span>📤 백업 내보내기</span><button data-close>✕</button></div><div class="mmb">
 <p>지금 불러온 전체 데이터(사번 · 성명 포함)를 파일로 내보냅니다. 다른 PC나 나중에 <b>[불러오기 · 머지]</b>로 다시 넣을 수 있습니다.</p>
 <div class="bkc"><div class="bk"><b>JSON <em>복원용 · 권장</em></b><span>비밀번호를 정하면 암호화해서 저장합니다</span><input type="password" id="bkPw" placeholder="백업 비밀번호 (권장 · 6자 이상)" autocomplete="off"><button class="btn pri" data-bk="json">JSON 내보내기</button></div>
 <div class="bk"><b>엑셀</b><span>엑셀에서 바로 열어 보기 · 다시 불러오기 가능</span><button class="btn" data-bk="xlsx">엑셀 내보내기</button></div>
 <div class="bk"><b>TXT <em>탭 구분</em></b><span>메모장으로 열어 복사 · 붙여넣기로 옮길 때</span><button class="btn" data-bk="txt">TXT 내보내기</button></div></div>
 <p class="warn">엑셀 · TXT와 비밀번호 없는 JSON은 실명이 그대로 담깁니다. 사내 PC에만 보관하세요.</p>
</div></div></div>
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
