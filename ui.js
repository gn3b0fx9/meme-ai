export function page() {
  return `<!doctype html>
<html lang="pt">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<meta name="theme-color" content="#f4f6f8">
<title>Meme AI · V2.7</title>
<style>
:root{
  font-family:Inter,ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;
  color:#f6f7f9;background:#090b10;
  --bg:#090b10;--panel:#11151d;--panel2:#0d1118;--line:#222a36;--muted:#8d96a5;--soft:#c5cad3;
  --green:#77e6a1;--red:#ff7f8b;--yellow:#ffd166;--blue:#8ab4ff;
}
*{box-sizing:border-box;-webkit-tap-highlight-color:transparent}
html{scroll-behavior:smooth;background:var(--bg)}
body{margin:0;background:radial-gradient(circle at 50% -10%,#18202d 0,#0b0e14 38%,var(--bg) 70%);min-height:100vh}
button,select{font:inherit}
button{border:0;cursor:pointer}
button:disabled{opacity:.55;cursor:wait}
a{color:inherit}
.app{max-width:1080px;margin:0 auto;padding:16px 14px calc(100px + env(safe-area-inset-bottom))}
.header{display:flex;align-items:center;justify-content:space-between;gap:12px;margin:2px 0 14px}
.brand{display:flex;align-items:center;gap:10px;min-width:0}
.logo{width:42px;height:42px;border-radius:14px;background:#f5f7fa;color:#0b0d12;display:grid;place-items:center;font-weight:950;font-size:15px;box-shadow:0 10px 30px rgba(0,0,0,.22)}
.brand h1{font-size:22px;line-height:1;margin:0;font-weight:900;letter-spacing:-.03em}
.brand p{margin:5px 0 0;color:var(--muted);font-size:11px}
.status-dot{width:8px;height:8px;border-radius:50%;display:inline-block;background:var(--green);margin-right:5px;box-shadow:0 0 12px rgba(119,230,161,.55)}
.scan-btn{min-width:92px;height:44px;padding:0 16px;border-radius:14px;background:#f5f7fa;color:#0b0d12;font-weight:900;font-size:13px;letter-spacing:.02em}
.hero{border:1px solid var(--line);border-radius:24px;background:linear-gradient(145deg,#151a23,#0f131a);padding:16px;box-shadow:0 18px 50px rgba(0,0,0,.2)}
.hero-top{display:flex;align-items:flex-start;justify-content:space-between;gap:12px}
.kicker{font-size:10px;color:var(--muted);font-weight:850;letter-spacing:.12em;text-transform:uppercase}
.hero h2{margin:5px 0 4px;font-size:27px;letter-spacing:-.04em}
.hero-copy{margin:0;color:var(--muted);font-size:12px;line-height:1.45}
.hero-stats{display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin-top:14px}
.hero-stat{background:rgba(7,9,13,.45);border:1px solid #1d2430;border-radius:14px;padding:10px 11px}
.hero-stat span{display:block;color:var(--muted);font-size:10px}
.hero-stat b{display:block;font-size:19px;margin-top:3px}
.toolbar{display:flex;gap:8px;margin:14px 0;overflow:auto;padding-bottom:2px}
select{appearance:none;background:#121720;color:#e9ecf1;border:1px solid var(--line);border-radius:12px;padding:11px 34px 11px 12px;font-size:12px;font-weight:800;min-width:145px}
.section{display:none;animation:fade .18s ease}
.section.active{display:block}
@keyframes fade{from{opacity:.35;transform:translateY(3px)}to{opacity:1;transform:none}}
.section-head{display:flex;justify-content:space-between;align-items:end;gap:12px;margin:18px 2px 10px}
.section-head h2{font-size:17px;margin:0;letter-spacing:-.02em}
.section-head p{font-size:10px;color:var(--muted);margin:4px 0 0}
.count-pill{background:#151b24;border:1px solid var(--line);border-radius:999px;padding:7px 10px;color:var(--soft);font-size:10px;font-weight:850;white-space:nowrap}
.list{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}
.token{border:1px solid var(--line);border-radius:19px;background:var(--panel);padding:13px;min-width:0;box-shadow:0 8px 24px rgba(0,0,0,.12)}
.token.alert{border-color:#3a3540;box-shadow:0 8px 28px rgba(255,127,139,.05)}
.token-head{display:flex;align-items:flex-start;justify-content:space-between;gap:10px}
.token-main{display:flex;align-items:center;gap:10px;min-width:0}
.rank{width:28px;height:28px;border-radius:10px;background:#1a202a;color:#aeb7c5;display:grid;place-items:center;font-size:10px;font-weight:900;flex:none}
.symbol{font-weight:950;font-size:14px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:170px}
.name{color:var(--muted);font-size:10px;margin-top:2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:190px}
.badges{display:flex;gap:5px;flex-wrap:wrap;margin-top:5px}
.badge{display:inline-flex;align-items:center;border:1px solid #2b3340;background:#151a22;color:#aeb7c5;border-radius:999px;padding:4px 6px;font-size:9px;font-weight:850}
.badge.alert{color:var(--yellow);border-color:#4b4026;background:#1b1810}
.scorebox{text-align:right;flex:none}
.score{font-size:25px;line-height:1;font-weight:950;letter-spacing:-.05em}
.scorelabel{font-size:8px;color:var(--muted);font-weight:800;margin-top:3px}
.scorebar{height:4px;background:#252d38;border-radius:999px;overflow:hidden;margin:12px 0}
.scorebar i{display:block;height:100%;background:#f1f3f5;border-radius:999px}
.forecast-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:6px;margin-top:9px}
.forecast-cell{background:#121720;border:1px solid #252d38;border-radius:10px;padding:8px 7px;min-width:0}
.forecast-cell span{display:block;color:var(--muted);font-size:8px;font-weight:800}
.forecast-cell b{display:block;font-size:12px;margin-top:4px}
.forecast-note{font-size:9px;color:var(--muted);margin-top:6px;line-height:1.4}
.model-signal{display:inline-block;color:#d8ffe5;background:#123321;border:1px solid #28623e;border-radius:999px;padding:3px 7px;font-size:8px;font-weight:900;margin-top:6px}
.open-token-btn{margin-top:8px;padding:9px 12px;border:1px solid #d8e0e8;border-radius:10px;background:#f6f8fb;color:#315d97;font-size:12px;font-weight:750}
.open-token-btn:hover{background:#edf3fc;border-color:#b9cce5}
.social-links{display:flex;gap:7px;flex-wrap:wrap;margin:10px 0 4px}
.social-link{display:inline-flex;align-items:center;gap:6px;padding:7px 10px;border:1px solid #dfe6ee;border-radius:9px;background:#fff;color:#315d97;text-decoration:none;font-size:11px;font-weight:750}
.social-link:hover{background:#edf3fc;border-color:#b9cce5}
.social-link-icon{width:18px;height:18px;border-radius:6px;background:#edf3fc;display:grid;place-items:center;font-size:10px;color:#315d97}
.social-title{font-size:11px;font-weight:800;color:#475569;margin-bottom:6px}
.social-note{font-size:10px;color:#64748b;margin-top:5px}
.quality-pill{display:inline-flex;align-items:center;width:max-content;border:1px solid transparent;border-radius:999px;padding:6px 9px;margin-top:9px;font-size:11px;font-weight:850}
.quality-favorable{background:#eaf6ee;border-color:#cce7d4;color:#17633d}
.quality-caution{background:#fff8e7;border-color:#efdfb3;color:#765600}
.quality-high-risk{background:#fff1f2;border-color:#f1cbd1;color:#a83243}
.quality-learning{background:#edf3fc;border-color:#d5e1f0;color:#315d97}
dialog.risk-dialog{width:min(460px,calc(100% - 28px));border:1px solid #dfe5ec;border-radius:18px;padding:0;color:#1f2937;background:#fff;box-shadow:0 24px 80px rgba(15,23,42,.24)}
dialog.risk-dialog::backdrop{background:rgba(15,23,42,.42);backdrop-filter:blur(3px)}
.risk-dialog-inner{padding:22px}
.risk-dialog h2{font-size:20px;margin:0 0 7px;color:#8b4e00}
.risk-dialog p{font-size:14px;line-height:1.55;color:#526174;margin:8px 0}
.risk-list{padding-left:20px;margin:13px 0;color:#854c00;font-size:13px;line-height:1.55}
.risk-actions{display:flex;justify-content:flex-end;gap:8px;margin-top:18px;flex-wrap:wrap}
.risk-actions button{border-radius:10px;padding:10px 13px;font-size:13px;font-weight:750}
.risk-cancel{background:#f1f4f7;color:#475569}.risk-continue{background:#a45221;color:#fff}
.keygrid{display:grid;grid-template-columns:repeat(4,1fr);gap:6px}
.metric{background:var(--panel2);border-radius:11px;padding:8px;min-width:0}
.metric span{display:block;color:var(--muted);font-size:8px;text-transform:uppercase;letter-spacing:.06em}
.metric b{display:block;font-size:12px;margin-top:3px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.positive{color:var(--green)!important}.negative{color:var(--red)!important}.neutral{color:#e9ecf1!important}
.details{margin-top:9px;border-top:1px solid #202732;padding-top:8px}
.details summary{cursor:pointer;color:#aeb7c5;font-size:10px;font-weight:850;list-style:none;display:flex;justify-content:space-between}
.details summary::-webkit-details-marker{display:none}
.details summary:after{content:"+";font-size:14px}.details[open] summary:after{content:"−"}
.factor-grid{display:grid;grid-template-columns:repeat(2,1fr);gap:6px;margin-top:8px}
.factor{background:#0c1016;border-radius:9px;padding:7px;display:flex;justify-content:space-between;gap:5px;font-size:9px}.factor b{font-size:9px}
.flags{margin-top:7px;color:#c6ccd5;font-size:9px;line-height:1.4}
.address{margin-top:7px;color:#687282;font-size:8px;word-break:break-all}
.warning{background:#2a2412;border:1px solid #5b4b1c;color:#ffd166;padding:12px 14px;border-radius:14px;font-weight:700;margin-bottom:12px}
.error{margin:10px 0;padding:11px 12px;border-radius:13px;background:#1d1115;border:1px solid #3b2027;color:var(--red);font-size:11px}
.empty{border:1px dashed #2b3340;border-radius:17px;padding:28px 18px;text-align:center;color:var(--muted);font-size:12px;background:#0d1117}
.info-card{border:1px solid var(--line);border-radius:19px;background:var(--panel);padding:15px;margin-top:10px}
.info-card h3{margin:0 0 7px;font-size:14px}.info-card p{color:var(--muted);font-size:11px;line-height:1.55;margin:7px 0}
.filters-row{display:flex;gap:8px;overflow:auto;margin:10px 0}
.filters-row select{min-width:160px}
.history-list{display:grid;gap:8px}
.history-card{border:1px solid var(--line);border-radius:16px;background:var(--panel);padding:12px}
.history-head{display:flex;justify-content:space-between;gap:10px;align-items:center}
.history-symbol{font-weight:900;font-size:13px}.history-status{font-size:10px;font-weight:900}
.history-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:6px;margin-top:9px}
.mini{background:var(--panel2);border-radius:9px;padding:7px}.mini span{display:block;color:var(--muted);font-size:8px}.mini b{display:block;font-size:11px;margin-top:2px}
.validation-top{display:grid;grid-template-columns:repeat(3,1fr);gap:8px}
.validation-card{border:1px solid var(--line);background:var(--panel);border-radius:16px;padding:12px}.validation-card span{color:var(--muted);font-size:9px}.validation-card b{display:block;font-size:20px;margin-top:4px}
.identity{display:grid;gap:8px;margin-top:9px}.identity>div{display:grid;gap:3px}.identity span,.data-token-main span,.muted-small{color:var(--muted);font-size:10px}.identity b{font-size:11px}.identity code,.address-block div{display:block;word-break:break-all;font-size:9px;line-height:1.45;color:#dce3ee}.bucket{border-top:1px solid var(--line);padding:12px 0}.bucket:first-child{margin-top:8px}.bucket>summary{list-style:none;cursor:pointer}.bucket>summary::-webkit-details-marker{display:none}.bucket>summary:after{content:"+";float:right;font-size:16px;color:var(--muted)}.bucket[open]>summary:after{content:"−"}.bucket-head{display:flex;justify-content:space-between;font-size:10px;font-weight:900}.bucket-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:6px;margin-top:7px}.data-token-list{display:grid;gap:7px;margin-top:9px}.data-token{border:1px solid var(--line);border-radius:13px;padding:9px;background:rgba(0,0,0,.12)}.data-token-main{display:flex;justify-content:space-between;gap:8px;align-items:center}.data-token-main b{font-size:12px}.data-token-metrics{display:grid;grid-template-columns:repeat(3,1fr);gap:5px;margin-top:7px}.data-token-metrics span{font-size:9px;color:var(--muted)}.data-token-metrics b{display:block;color:var(--text);font-size:10px;margin-top:2px}.address-block{margin-top:7px}.muted-small{margin-top:5px}
.nav{position:fixed;left:0;right:0;bottom:0;z-index:100;padding:8px 10px calc(8px + env(safe-area-inset-bottom));background:rgba(8,10,14,.88);backdrop-filter:blur(20px);border-top:1px solid rgba(55,64,78,.55)}
.nav-inner{max-width:600px;margin:auto;display:grid;grid-template-columns:repeat(4,1fr);gap:5px}
.nav-btn{background:transparent;color:#7f8998;border-radius:14px;padding:8px 5px 7px;font-size:9px;font-weight:850}
.nav-btn.active{background:#171d27;color:#f5f7fa}
.nav-icon{display:block;font-size:17px;line-height:18px;margin-bottom:2px}
.last-scan{color:var(--muted);font-size:9px;margin-top:10px}
@media(max-width:720px){
 .app{padding-left:12px;padding-right:12px}
 .list{grid-template-columns:1fr}
 .hero h2{font-size:24px}
 .hero-stats{grid-template-columns:repeat(2,1fr)}
 .keygrid{grid-template-columns:repeat(4,1fr)}
 .history-grid{grid-template-columns:repeat(3,1fr)}
 .validation-top{grid-template-columns:repeat(2,1fr)}
 .bucket-grid{grid-template-columns:repeat(2,1fr)}
}
@media(max-width:420px){
 .keygrid{grid-template-columns:repeat(2,1fr)}
 .history-grid{grid-template-columns:repeat(2,1fr)}
 .hero-top{align-items:center}
 .brand p{max-width:190px}
 .scan-btn{min-width:82px}
}
/* Comfort pass: calmer light palette, clearer type, softer borders and focus. */
:root{color-scheme:light;color:#1f2937;background:#f4f6f8;--bg:#f4f6f8;--panel:#fff;--panel2:#f7f9fb;--line:#e2e7ed;--muted:#64748b;--soft:#475569;--green:#167a4b;--red:#bd4252;--yellow:#8a6200;--blue:#245bb5}
html,body{background:#f4f6f8;color:#1f2937}
body{background:linear-gradient(180deg,#edf2f7 0,#f7f9fb 260px,#f4f6f8 100%)}
.app{max-width:1160px;padding-top:22px}
.header{margin-bottom:20px}
.logo{background:#dce9fc;color:#244d87;box-shadow:none}
.brand h1{font-size:24px;letter-spacing:-.02em}
.brand p{font-size:13px;color:#64748b}
.status-dot{box-shadow:none}
.scan-btn{background:#245bb5;color:#fff;box-shadow:0 5px 14px rgba(36,91,181,.16);font-size:14px}
.scan-btn:hover{background:#1b4d9c}
.hero{background:linear-gradient(135deg,#fff,#f6f9fd);border-color:#dfe7f0;box-shadow:0 8px 24px rgba(31,41,55,.06);padding:22px}
.kicker{color:#64748b;font-size:11px;letter-spacing:.08em}
.hero h2{font-size:30px;letter-spacing:-.025em}
.hero-copy{font-size:14px;color:#64748b;line-height:1.6}
.hero-stat{background:#fff;border:1px solid #e5eaf0;border-radius:14px;padding:12px 14px}
.hero-stat span{font-size:12px;color:#64748b}
.hero-stat b{font-size:21px;color:#1f2937}
select{background:#fff;color:#263447;border-color:#d9e0e8;border-radius:11px;font-size:13px;padding-top:12px;padding-bottom:12px}
select:focus,button:focus-visible,a:focus-visible,summary:focus-visible{outline:3px solid rgba(36,91,181,.24);outline-offset:2px}
.section-head{margin-top:24px;margin-bottom:13px}
.section-head h2{font-size:20px;letter-spacing:-.015em}
.section-head p{font-size:13px;color:#64748b;line-height:1.5}
.count-pill{background:#fff;border-color:#dce3eb;color:#475569;font-size:12px}
.list{gap:14px}
.token{background:#fff;border-color:#e2e7ed;border-radius:17px;padding:17px;box-shadow:0 5px 18px rgba(31,41,55,.045)}
.token.alert{border-color:#e7d5a5;box-shadow:0 4px 14px rgba(138,98,0,.06)}
.rank{background:#eff3f7;color:#526174}
.symbol{font-size:16px;color:#1f2937}
.name{font-size:12px;color:#64748b}
.badge{background:#f6f8fa;color:#526174;border-color:#e2e7ed;font-size:10px}
.badge.alert{background:#fff8e7;color:#805b00;border-color:#f0dfae}
.score{font-size:27px;color:#1f2937}
.scorelabel{font-size:10px;color:#64748b}
.scorebar{background:#e9edf2}
.scorebar i{background:#4d78b9}
.forecast-cell{background:#f8fafc;border-color:#e4e9ef;border-radius:11px;padding:10px}
.forecast-cell span{color:#64748b;font-size:10px;line-height:1.4}
.forecast-cell b{font-size:14px;color:#263447}
.forecast-note{font-size:11px;color:#64748b;line-height:1.5}
.model-signal{background:#eaf6ee;border-color:#cce7d4;color:#17633d;font-size:10px}
.metric{background:#f7f9fb}
.metric span{font-size:10px;color:#64748b}
.metric b{font-size:13px;color:#27364a}
.positive{color:#18784b!important}.negative{color:#b9384b!important}.neutral{color:#3f4d60!important}
.details{border-color:#e8edf2}
.details summary{color:#475569;font-size:12px}
.factor{background:#f7f9fb;color:#46566b;font-size:11px}
.factor b{font-size:11px}
.flags{color:#526174;font-size:11px}
.address{color:#718096;font-size:10px}
.warning{background:#fff8e7;border-color:#efdfb3;color:#765600}
.error{background:#fff1f2;border-color:#f1cbd1;color:#a83243;font-size:12px}
.empty{background:#fff;border-color:#d8e0e9;color:#64748b;font-size:14px;line-height:1.6}
.info-card,.history-card{background:#fff;border-color:#e2e7ed;border-radius:16px}
.info-card{padding:18px}
.info-card h3{font-size:16px;color:#27364a}
.info-card p{font-size:13px;color:#64748b;line-height:1.65}
.history-status{font-size:12px}
.mini{background:#f7f9fb}
.mini span{font-size:10px;color:#64748b}
.mini b{font-size:12px;color:#27364a}
.validation-card{background:#fff;border-color:#e2e7ed}
.validation-card span{font-size:11px;color:#64748b}
.validation-card b{font-size:22px;color:#263447}
.identity code,.address-block div{color:#40536b}
.bucket{border-color:#e2e7ed}
.data-token{background:#fbfcfd;border-color:#e2e7ed}
.nav{background:rgba(255,255,255,.94);border-color:#dfe5ec;box-shadow:0 -4px 18px rgba(31,41,55,.045)}
.nav-btn{color:#64748b;font-size:11px}
.nav-btn.active{background:#edf3fc;color:#245bb5}
@media(max-width:720px){.app{padding-top:14px}.hero{padding:17px}.hero h2{font-size:25px}.section-head h2{font-size:18px}}
@media(max-width:420px){.forecast-cell{padding:8px 6px}.forecast-cell span{font-size:9px}.forecast-cell b{font-size:12px}.brand p{font-size:11px}}
</style>
</head>
<body>
<div class="app">
<header class="header">
  <div class="brand">
    <div class="logo">MA</div>
    <div><h1>Meme AI</h1><p><span class="status-dot"></span>Aprendizagem ativa · Solana · V2.7</p></div>
  </div>
  <button class="scan-btn" id="scanButton" onclick="runScan()">SCAN</button>
</header>

<section class="hero">
  <div class="hero-top">
    <div>
      <div class="kicker">Mercado agora</div>
      <h2 id="heroTitle">A procurar oportunidades</h2>
      <p class="hero-copy" id="status">A carregar dados do scanner...</p>
      <div class="last-scan" id="lastScan">Último scan: —</div>
    </div>
    <div class="count-pill" id="modePill">LIVE</div>
  </div>
  <div class="hero-stats">
    <div class="hero-stat"><span>Tokens</span><b id="count">—</b></div>
    <div class="hero-stat"><span>Sinais IA</span><b id="alerts">—</b></div>
    <div class="hero-stat"><span>Acompanhados</span><b id="historyCount">0</b></div>
    <div class="hero-stat"><span>+25%</span><b id="wins">0</b></div>
  </div>
</section>

<section id="scanSection" class="section active">
  <div class="section-head"><div><h2>Scanner</h2><p>Previsões por prazo e sinais validados com resultados recentes.</p></div><span class="count-pill" id="scanCountPill">0 tokens</span></div>
  <div class="filters-row">
    <select id="filter" onchange="render()"><option value="all">Todos os tokens</option><option value="ai">Sinais IA validados</option><option value="top">Top oportunidades</option><option value="alerts">Alertas do score</option><option value="lowrisk">Risco ≤35</option><option value="young">Até 30 min</option></select>
    <select id="sort" onchange="render()"><option value="adjusted">Score ajustado</option><option value="opp">Opportunity</option><option value="risk">Menor risk</option><option value="age">Mais novos</option><option value="volume">Volume 1h</option></select>
  </div>
  <div id="scanError"></div>
  <div id="list" class="list"></div>
</section>

<section id="topSection" class="section">
  <div class="section-head"><div><h2>🔥 Top oportunidades</h2><p>Lista curta para leitura rápida.</p></div><span class="count-pill" id="topCount">0</span></div>
  <div class="info-card"><h3>Como entra no Top</h3><p>Score ajustado ≥ <b>55</b> · Risk ≤ <b>55</b> · Liquidez ≥ <b>$10K</b>.</p><p>O motor combina descoberta por perfis, boosts, community takeovers e tokens já acompanhados. Boost é apenas um sinal de descoberta/promoção, não uma indicação de qualidade.</p><p>Score ajustado = Opportunity − (Risk × 0,45). É uma métrica experimental do scanner, não uma previsão de retorno.</p></div>
  <div id="topList" class="list" style="margin-top:10px"></div>
</section>

<section id="historySection" class="section">
  <div class="section-head"><div><h2>Histórico</h2><p>Alertas guardados na D1 e acompanhados ao longo do tempo.</p></div><span class="count-pill" id="historyPill">0</span></div>
  <div class="info-card"><h3>O que estás a ver</h3><p>Um token entra aqui quando <b>Opportunity ≥72</b> e <b>Risk ≤55</b>. O histórico mantém preço inicial, peak, drawdown e marcos de +10%, +25% e -20%.</p></div>
  <div id="history" class="history-list" style="margin-top:10px"></div>
</section>

<section id="dataSection" class="section">
  <div class="section-head"><div><h2>Aprendizagem</h2><p>Modelos supervisionados com resultados observados em 1h, 24h e 7d.</p></div><button class="count-pill" onclick="loadAnalytics()">Atualizar</button></div>
  <div id="analytics"></div>
  <div class="info-card"><h3>Como interpretar</h3><p>As estimativas só aparecem após 100 exemplos completos por prazo. São probabilidades aprendidas de movimentos históricos, não garantias nem instruções automáticas para investir.</p></div>
</section>
</div>

<dialog id="riskDialog" class="risk-dialog" aria-labelledby="riskDialogTitle" aria-describedby="riskDialogMessage">
  <div class="risk-dialog-inner">
    <h2 id="riskDialogTitle">Riscos detetados</h2>
    <p id="riskDialogMessage">Este token apresenta sinais de risco:</p>
    <ul id="riskDialogList" class="risk-list"></ul>
    <p>A app não compra tokens. Continuar apenas abre o gráfico do par no DEX Screener.</p>
    <div class="risk-actions"><button type="button" class="risk-cancel" onclick="closeRiskDialog()">Voltar</button><button type="button" class="risk-continue" onclick="confirmOpenToken()">Abrir gráfico mesmo assim</button></div>
  </div>
</dialog>

<nav class="nav" aria-label="Navegação principal"><div class="nav-inner">
<button class="nav-btn active" data-target="scanSection" onclick="showSection('scanSection',this)"><span class="nav-icon">⌁</span>Scan</button>
<button class="nav-btn" data-target="topSection" onclick="showSection('topSection',this)"><span class="nav-icon">★</span>Top</button>
<button class="nav-btn" data-target="historySection" onclick="showSection('historySection',this)"><span class="nav-icon">◷</span>Histórico</button>
<button class="nav-btn" data-target="dataSection" onclick="showSection('dataSection',this)"><span class="nav-icon">▦</span>Dados</button>
</div></nav>

<script>
let tokens=[];let historyData=[];let analyticsData=null;let activeSection='scanSection';
function num(v,fallback=0){const n=Number(v);return Number.isFinite(n)?n:fallback}
function money(v){const n=Number(v);if(!Number.isFinite(n))return '—';if(n>=1e9)return '$'+(n/1e9).toFixed(2)+'B';if(n>=1e6)return '$'+(n/1e6).toFixed(2)+'M';if(n>=1e3)return '$'+(n/1e3).toFixed(1)+'K';return '$'+n.toFixed(n<1?6:0)}
function age(v){const n=Number(v);if(!Number.isFinite(n))return '—';if(n<60)return Math.max(1,Math.round(n))+'m';if(n<1440)return Math.round(n/60)+'h';return Math.round(n/1440)+'d'}
function esc(v){return String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}
function signedPct(v){const n=num(v);return (n>0?'+':'')+n.toFixed(1)+'%'}
function pctClass(v){const n=num(v);return n>0?'positive':n<0?'negative':'neutral'}
function updateStats(){document.getElementById('historyCount').textContent=historyData.length;document.getElementById('wins').textContent=historyData.filter(x=>x.hit25_at||x.result==='hit25').length;document.getElementById('historyPill').textContent=historyData.length}
function hasAiSignal(x){return Object.values(x?.forecasts||{}).some(f=>f?.ready&&f.validated&&num(f.probabilityUp)>=65&&num(f.expectedReturnPct)>0&&num(x?.risk)<=55&&num(x?.liquidity)>=10000&&num(x?.adjustedScore)>=55)}
function tokenQuality(x){if(hasAiSignal(x))return {label:'Sinal favorável',className:'quality-favorable'};if(num(x?.risk)>55||num(x?.liquidity)<10000||num(x?.adjustedScore)<45)return {label:'Risco elevado',className:'quality-high-risk'};if(!Object.values(x?.forecasts||{}).some(f=>f?.ready&&f.validated))return {label:'A aprender',className:'quality-learning'};return {label:'Atenção',className:'quality-caution'}}
function forecastHtml(x){const fs=x?.forecasts||{},items=[['short','Curto · 1h'],['medium','Médio · 24h'],['long','Longo · 7d']];const cells=items.map(([k,label])=>{const f=fs[k];return '<div class="forecast-cell"><span>'+label+'</span>'+(f?.ready?'<b>Prob. alta '+num(f.probabilityUp)+'%</b><span>Ret. est. '+signedPct(f.expectedReturnPct)+'</span><span>'+num(f.samples)+' amostras</span><span>Validação '+num(f.validationBalancedAccuracy)+'% ('+num(f.validationSamples)+')</span>':'<b>A aprender</b><span>'+num(f?.samples)+' / 100 amostras</span>')+'</div>'}).join('');return '<div class="forecast-grid">'+cells+'</div>'+(hasAiSignal(x)?'<span class="model-signal">SINAL IA · valida também o risco</span>':'')+'<div class="forecast-note">Estimativas supervisionadas: treino nos exemplos mais antigos e validação nos mais recentes. O percentual de subida ainda não está calibrado; não garante retorno.</div>'}
function socialLinksHtml(x){const links=Array.isArray(x?.socialLinks)?x.socialLinks:[];const buttons=links.map(s=>{try{const u=new URL(s.url);if(u.protocol!=='https:')return '';const label=String(s.label||'Social').slice(0,24),icon=label==='Website'?'↗':label==='Telegram'?'➤':label==='X'?'𝕏':label.slice(0,1);return '<a class="social-link" href="'+esc(u.href)+'" target="_blank" rel="noopener noreferrer"><span class="social-link-icon">'+esc(icon)+'</span>'+esc(label)+'<span aria-hidden="true">↗</span></a>'}catch{return ''}}).join('');return buttons?'<div class="social-block"><div class="social-title">Perfis e site</div><div class="social-links">'+buttons+'</div><div class="social-note">Links listados pelo DEX Screener; isto não é análise do que a comunidade diz.</div></div>':''}
let pendingPairUrl='';
function requestOpenToken(address){const x=tokens.find(t=>t?.address===address);if(!x?.url)return;let parsed;try{parsed=new URL(x.url)}catch{return}if(parsed.protocol!=='https:'||!(parsed.hostname==='dexscreener.com'||parsed.hostname.endsWith('.dexscreener.com')))return;const state=tokenQuality(x);if(state.className==='quality-favorable'){window.open(parsed.href,'_blank','noopener,noreferrer');return}const warnings=Array.isArray(x.riskFlags)?[...x.riskFlags]:[];if(num(x.risk)>55)warnings.push('Índice de risco elevado: '+num(x.risk)+'/100.');if(num(x.liquidity)<10000)warnings.push('Liquidez muito baixa: '+money(x.liquidity)+'.');if(num(x.adjustedScore)<45)warnings.push('Score ajustado baixo: '+num(x.adjustedScore)+'/100.');if(!Object.values(x.forecasts||{}).some(f=>f?.ready&&f.validated))warnings.push('Ainda não existe previsão IA validada para este prazo.');else if(!hasAiSignal(x))warnings.push('O modelo não gerou um sinal favorável para este token.');pendingPairUrl=parsed.href;document.getElementById('riskDialogTitle').textContent=state.label+': $'+(x.symbol||'TOKEN');document.getElementById('riskDialogList').innerHTML=[...new Set(warnings)].map(w=>'<li>'+esc(w)+'</li>').join('')||'<li>Os critérios de qualidade do scanner não foram cumpridos.</li>';const dialog=document.getElementById('riskDialog');if(dialog.showModal)dialog.showModal();else if(window.confirm('Sinais de risco: '+warnings.join(' · ')+'\\n\\nAbrir o gráfico?'))confirmOpenToken()}
function closeRiskDialog(){document.getElementById('riskDialog').close();pendingPairUrl=''}
function confirmOpenToken(){const url=pendingPairUrl;document.getElementById('riskDialog').close();pendingPairUrl='';if(url)window.open(url,'_blank','noopener,noreferrer')}
function tokenCard(x,i){
 const adjusted=num(x?.adjustedScore),opp=num(x?.opportunity),risk=num(x?.risk),f=x?.factors||{},flags=Array.isArray(x?.riskFlags)?x.riskFlags:[],quality=tokenQuality(x);
 return '<article class="token '+(x?.alert?'alert':'')+'">'+
  '<div class="token-head"><div class="token-main"><div class="rank">#'+(i+1)+'</div><div><div class="symbol">$'+esc(x?.symbol||'TOKEN')+'</div><div class="name">'+esc(x?.name||'Unknown')+'</div><div class="badges"><span class="badge">'+age(x?.ageMin)+'</span><span class="badge">'+esc(x?.dex||'—')+'</span>'+(x?.discoverySources?.includes('boost')?'<span class="badge">BOOST</span>':'')+(x?.discoverySources?.includes('tracked')?'<span class="badge">TRACKED</span>':'')+(x?.alert?'<span class="badge alert">ALERTA SCORE</span>':'')+(hasAiSignal(x)?'<span class="badge alert">SINAL IA</span>':'')+'</div></div></div><div class="scorebox"><div class="score">'+adjusted+'</div><div class="scorelabel">SCORE</div></div></div>'+
  '<div class="quality-pill '+quality.className+'">'+quality.label+'</div>'+socialLinksHtml(x)+'<div class="scorebar"><i style="width:'+Math.max(0,Math.min(100,adjusted))+'%"></i></div>'+forecastHtml(x)+
  '<div class="keygrid">'+
   '<div class="metric"><span>Liquidity</span><b>'+money(x?.liquidity)+'</b></div>'+
   '<div class="metric"><span>5m</span><b class="'+pctClass(x?.change5m)+'">'+signedPct(x?.change5m)+'</b></div>'+
   '<div class="metric"><span>Buy/Sell</span><b>'+num(x?.buySell).toFixed(2)+'x</b></div>'+
   '<div class="metric"><span>Risk</span><b class="'+(risk<=35?'positive':risk>55?'negative':'neutral')+'">'+risk+'</b></div>'+
  '</div>'+
  '<details class="details"><summary>Ver análise completa</summary><div class="factor-grid">'+
   '<div class="factor"><span>Momentum</span><b>'+num(f.momentum)+'/25</b></div><div class="factor"><span>Liquidez</span><b>'+num(f.liquidity)+'/20</b></div><div class="factor"><span>Atividade</span><b>'+num(f.activity)+'/20</b></div><div class="factor"><span>Fluxo</span><b>'+num(f.flow)+'/20</b></div><div class="factor"><span>Freshness</span><b>'+num(f.freshness)+'/15</b></div><div class="factor"><span>Opportunity</span><b>'+opp+'/100</b></div>'+
  '</div><div class="keygrid" style="margin-top:6px"><div class="metric"><span>Market cap</span><b>'+money(x?.marketCap)+'</b></div><div class="metric"><span>Vol 5m</span><b>'+money(x?.volume5m)+'</b></div><div class="metric"><span>Vol 1h</span><b>'+money(x?.volume1h)+'</b></div><div class="metric"><span>Tx 5m</span><b>'+num(x?.tx5m)+'</b></div><div class="metric"><span>Buys / Sells</span><b>'+num(x?.buys)+' / '+num(x?.sells)+'</b></div></div>'+
  '<div class="flags">'+(flags.length?'⚠ '+esc(flags.join(' · ')):'✓ Sem flags fortes de risco')+'</div><div class="address">'+esc(x?.address||'')+'</div><div style="margin-top:7px"><button type="button" class="open-token-btn" data-token-address="'+esc(x?.address||'')+'">Abrir par no DEX Screener ↗</button></div></details></article>'
}
function filtered(list){let a=[...list],f=document.getElementById('filter')?.value||'all';if(f==='ai')a=a.filter(hasAiSignal);if(f==='top')a=a.filter(x=>num(x?.adjustedScore)>=55&&num(x?.risk)<=55&&num(x?.liquidity)>=10000);if(f==='alerts')a=a.filter(x=>x?.alert);if(f==='lowrisk')a=a.filter(x=>num(x?.risk)<=35);if(f==='young')a=a.filter(x=>num(x?.ageMin,999999)<=30);let s=document.getElementById('sort')?.value||'adjusted';if(s==='adjusted')a.sort((x,y)=>num(y?.adjustedScore)-num(x?.adjustedScore));if(s==='opp')a.sort((x,y)=>num(y?.opportunity)-num(x?.opportunity));if(s==='risk')a.sort((x,y)=>num(x?.risk)-num(y?.risk));if(s==='age')a.sort((x,y)=>num(x?.ageMin,999999)-num(y?.ageMin,999999));if(s==='volume')a.sort((x,y)=>num(y?.volume1h)-num(x?.volume1h));return a}
function wireTokenButtons(root){root.querySelectorAll('[data-token-address]').forEach(b=>b.addEventListener('click',()=>requestOpenToken(b.dataset.tokenAddress)))}
function render(){const a=filtered(tokens),list=document.getElementById('list');document.getElementById('scanCountPill').textContent=a.length+' tokens';list.innerHTML=a.length?a.map(tokenCard).join(''):'<div class="empty">Sem resultados para este filtro.<br><br>Tenta outro filtro ou faz um novo scan.</div>';wireTokenButtons(list);renderTop()}
function renderTop(){const a=[...tokens].filter(x=>num(x?.adjustedScore)>=55&&num(x?.risk)<=55&&num(x?.liquidity)>=10000).sort((x,y)=>num(y?.adjustedScore)-num(x?.adjustedScore)),list=document.getElementById('topList');document.getElementById('topCount').textContent=a.length+' tokens';list.innerHTML=a.length?a.slice(0,20).map(tokenCard).join(''):'<div class="empty">Ainda não existem tokens que cumpram os critérios do Top.</div>';wireTokenButtons(list)}
function resultLabel(x){if(x?.hit25_at||x?.result==='hit25')return ['🎯 +25%','positive'];if(x?.hit10_at||x?.result==='hit10')return ['🟢 +10%','positive'];if(x?.stop20_at||x?.result==='stop20')return ['🔴 -20%','negative'];return ['🟡 A acompanhar','neutral']}
function minsLabel(first,at){if(!first||!at)return '—';const m=Math.max(0,(num(at)-num(first))/60000);if(m<60)return Math.round(m)+' min';if(m<1440)return (m/60).toFixed(1)+' h';return (m/1440).toFixed(1)+' d'}
function historyCard(x){const initial=num(x?.initial_price),current=num(x?.current_price),initialMcap=num(x?.initial_mcap),currentMcap=num(x?.current_mcap),priceChange=initial>0?((current-initial)/initial)*100:0,mcapChange=initialMcap>0?((currentMcap-initialMcap)/initialMcap)*100:0;const r=resultLabel(x);return '<article class="history-card"><div class="history-head"><div><div class="history-symbol">$'+esc(x?.symbol||'TOKEN')+'</div><div class="name">'+esc(x?.name||'')+' · '+(x?.first_seen?new Date(num(x.first_seen)).toLocaleString('pt-PT'):'—')+'</div></div><div class="history-status '+r[1]+'">'+r[0]+'</div></div><div class="history-grid"><div class="mini"><span>MC guardada</span><b>'+money(initialMcap)+'</b></div><div class="mini"><span>MC atual</span><b>'+money(currentMcap)+'</b></div><div class="mini"><span>Δ MC</span><b class="'+pctClass(mcapChange)+'">'+signedPct(mcapChange)+'</b></div><div class="mini"><span>Preço atual</span><b>'+money(current)+'</b></div><div class="mini"><span>Δ preço</span><b class="'+pctClass(priceChange)+'">'+signedPct(priceChange)+'</b></div><div class="mini"><span>Score inicial</span><b>'+num(x?.initial_adjusted_score)+'</b></div><div class="mini"><span>Risk inicial</span><b>'+num(x?.initial_risk)+'</b></div><div class="mini"><span>Peak</span><b class="positive">'+signedPct(x?.peak_pct)+'</b></div><div class="mini"><span>Drawdown</span><b class="negative">'+signedPct(x?.max_drawdown_pct)+'</b></div><div class="mini"><span>+10%</span><b>'+minsLabel(x?.first_seen,x?.hit10_at)+'</b></div><div class="mini"><span>+25%</span><b>'+minsLabel(x?.first_seen,x?.hit25_at)+'</b></div><div class="mini"><span>-20%</span><b>'+minsLabel(x?.first_seen,x?.stop20_at)+'</b></div></div><details class="details"><summary>Ver identidade e endereço</summary><div class="identity"><div><span>Nome</span><b>'+esc(x?.name||'—')+'</b></div><div><span>Endereço</span><code>'+esc(x?.address||'—')+'</code></div><div><span>Última atualização</span><b>'+(x?.last_seen?new Date(num(x.last_seen)).toLocaleString('pt-PT'):'—')+'</b></div></div></details></article>'}
function renderHistory(){document.getElementById('history').innerHTML=historyData.length?historyData.slice(0,60).map(historyCard).join(''):'<div class="empty">Ainda não há alertas guardados.</div>'}
function time(v){if(v===null||v===undefined)return '—';const n=num(v);if(n<60)return Math.round(n)+'m';if(n<1440)return (n/60).toFixed(1)+'h';return (n/1440).toFixed(1)+'d'}
function analyticsBucketHtml(name,b){b=b||{};const total=num(b.total),items=Array.isArray(b.tokens)?b.tokens:[];const list=items.map(x=>'<div class="data-token"><div class="data-token-main"><b>$'+esc(x.symbol||'TOKEN')+'</b><span>'+esc(x.name||'')+'</span></div><div class="data-token-metrics"><span>Score <b>'+num(x.score)+'</b></span><span>Risk <b>'+num(x.risk)+'</b></span><span>MC <b>'+money(x.currentMcap)+'</b></span></div><details class="details"><summary>Ver endereço</summary><div class="address-block"><div>'+esc(x.address||'—')+'</div><div class="muted-small">Entrada: '+money(x.initialMcap)+' · Agora: '+money(x.currentMcap)+'</div></div></details></div>').join('');return '<details class="bucket"><summary><div class="bucket-head"><span>Score ajustado '+esc(name)+'</span><span>'+total+' tokens</span></div></summary><div class="bucket-grid"><div class="mini"><span>+10%</span><b>'+num(b.hit10)+' · '+(total?(num(b.hit10)/total*100).toFixed(1):'0.0')+'%</b></div><div class="mini"><span>+25%</span><b>'+num(b.hit25)+' · '+(total?(num(b.hit25)/total*100).toFixed(1):'0.0')+'%</b></div><div class="mini"><span>-20%</span><b>'+num(b.stop20)+' · '+(total?(num(b.stop20)/total*100).toFixed(1):'0.0')+'%</b></div><div class="mini"><span>Peak médio</span><b>'+num(b.avgPeak).toFixed(1)+'%</b></div></div><div class="data-token-list">'+(list||'<div class="empty">Sem tokens nesta faixa.</div>')+'</div></details>'}
function renderAnalytics(){const el=document.getElementById('analytics');const a=analyticsData;if(!a){el.innerHTML='<div class="empty">Sem dados de validação.</div>';return}const r=a.rates||{},av=a.averages||{},names=['<45','45-54','55-64','65-74','75-84','85+'];el.innerHTML='<div class="validation-top"><div class="validation-card"><span>Acompanhados</span><b>'+num(a.tracked)+'</b></div><div class="validation-card"><span>+10%</span><b>'+num(a.hit10)+' · '+num(r.hit10).toFixed(1)+'%</b></div><div class="validation-card"><span>+25%</span><b>'+num(a.hit25)+' · '+num(r.hit25).toFixed(1)+'%</b></div><div class="validation-card"><span>-20%</span><b>'+num(a.stop20)+' · '+num(r.stop20).toFixed(1)+'%</b></div><div class="validation-card"><span>Sem marco</span><b>'+num(a.tracking)+'</b></div><div class="validation-card"><span>Peak médio</span><b>'+num(av.peakPct).toFixed(1)+'%</b></div><div class="validation-card"><span>Observações</span><b>'+num(a.observations)+'</b></div></div><div class="info-card"><h3>Tempos médios</h3><div class="history-grid"><div class="mini"><span>Até +10%</span><b>'+time(av.minutesTo10)+'</b></div><div class="mini"><span>Até +25%</span><b>'+time(av.minutesTo25)+'</b></div><div class="mini"><span>Até -20%</span><b>'+time(av.minutesToStop20)+'</b></div><div class="mini"><span>Drawdown</span><b>'+num(av.maxDrawdownPct).toFixed(1)+'%</b></div></div></div><div class="info-card"><h3>Resultados por faixa de score</h3>'+names.map(n=>analyticsBucketHtml(n,(a.buckets||{})[n])).join('')+'</div>'}
function showSection(id,button){activeSection=id;document.querySelectorAll('.section').forEach(s=>s.classList.remove('active'));const el=document.getElementById(id);if(el)el.classList.add('active');document.querySelectorAll('.nav-btn').forEach(b=>b.classList.remove('active'));if(button)button.classList.add('active');window.scrollTo({top:0,behavior:'smooth'});if(id==='topSection')renderTop();if(id==='historySection')renderHistory();if(id==='dataSection'&&!analyticsData)loadAnalytics()}
async function loadScan(){const status=document.getElementById('status'),error=document.getElementById('scanError');status.textContent='A fazer scan...';error.innerHTML='';document.getElementById('heroTitle').textContent='A atualizar mercado';const controller=new AbortController();const timer=setTimeout(()=>controller.abort(),10000);try{const r=await fetch('/api/scan',{cache:'no-store',signal:controller.signal});const data=await r.json().catch(()=>null);if(!r.ok)throw new Error(data?.error||('HTTP '+r.status));tokens=Array.isArray(data?.tokens)?data.tokens:[];document.getElementById('count').textContent=num(data?.count);document.getElementById('alerts').textContent=num(data?.alerts);const stamp=data?.at?new Date(data.at):new Date();document.getElementById('lastScan').textContent='Último scan: '+stamp.toLocaleTimeString('pt-PT');const ss=data?.sourceStatus||{},partial=data?.batchesFailed>0||Object.values(ss).includes('partial');status.textContent=tokens.length?('Scan concluído · '+num(data?.discovered)+' candidatos · '+(partial?'parcial · ':'')+'ordenado por score ajustado'):(Object.values(ss).includes('error')?'Scan parcial · algumas fontes indisponíveis':'Sem tokens encontrados');document.getElementById('heroTitle').textContent=tokens.length?(num(data?.alerts)+' alertas · '+tokens.length+' tokens'):'Nenhuma oportunidade agora';if(partial||Object.values(ss).includes('error')){const details=[];if(ss.profiles==='error')details.push('Profiles indisponível');if(ss.boosts==='error')details.push('Boosts indisponível');if(ss.community==='error')details.push('Community indisponível');if(data?.batchesFailed)details.push(num(data.batchesFailed)+' lote(s) de pares falharam');error.innerHTML='<div class="warning">⚠️ Scan parcial'+(details.length?' · '+esc(details.join(' · ')):'')+'</div>'}render()}catch(err){console.error(err);document.getElementById('heroTitle').textContent='Scan interrompido';status.textContent=err?.name==='AbortError'?'O scan excedeu 10s e foi interrompido.':'O scanner não conseguiu concluir o pedido.';error.innerHTML='<div class="error">Erro no scan: '+esc(err?.message||err)+'</div>'}finally{clearTimeout(timer)}}
async function loadHistory(){try{const r=await fetch('/api/history',{cache:'no-store'});if(!r.ok)throw new Error('HTTP '+r.status);const data=await r.json();historyData=Array.isArray(data)?data:[];updateStats();renderHistory()}catch(err){console.error('history',err)}}
async function loadAnalytics(){const el=document.getElementById('analytics');el.innerHTML='<div class="empty">A calcular validação...</div>';try{const r=await fetch('/api/analytics',{cache:'no-store'});if(!r.ok)throw new Error('HTTP '+r.status);analyticsData=await r.json();renderAnalytics()}catch(err){console.error('analytics',err);el.innerHTML='<div class="error">Erro ao carregar dados: '+esc(err?.message||err)+'</div>'}}
async function runScan(){const button=document.getElementById('scanButton');if(button){button.disabled=true;button.textContent='A SCAN...'}try{await loadScan();await loadHistory();await loadAnalytics()}finally{if(button){button.disabled=false;button.textContent='SCAN'}}}
async function boot(){await Promise.all([loadScan(),loadHistory(),loadAnalytics()])}
setInterval(async()=>{await loadScan();await loadHistory();await loadAnalytics()},300000);boot();
</script>
</body>
</html>`;
}
