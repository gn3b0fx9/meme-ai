import { attachForecasts, saveForecastSamples, pendingSampleAddresses } from "./forecast.js";
import { page } from "./ui.js";

const DEX = "https://api.dexscreener.com";
const securityReports = new Map();
let schemaReady = false;
let persistQueue = Promise.resolve();

function enqueuePersist(db, tokens) {
  const next = persistQueue.then(() => persistScan(db, tokens));
  persistQueue = next.catch(err => {
    console.error("persist queue", err);
  });
  return next;
}

function hasValidPrice(x) {
  return num(x?.priceUsd) > 0;
}

function shouldTrack(x) {
  if (!x?.address || !hasValidPrice(x)) return false;
  if (x.alert) return true;
  return num(x.adjustedScore) >= 55 && num(x.risk) <= 55 && num(x.liquidity) >= 10000;
}

function trackingResult(hit10At, hit25At, stop20At) {
  const hit = hit25At ? "hit25" : hit10At ? "hit10" : null;
  const stop = stop20At ? "stop20" : null;
  if (hit && stop) return hit + "_" + stop;
  return hit || stop || "tracking";
}

function resultFlags(result) {
  const value = String(result || "");
  return {
    hit25: value.includes("hit25"),
    hit10: value.includes("hit10") || value.includes("hit25"),
    stop20: value.includes("stop20")
  };
}

async function allSettledPool(items, concurrency, fn) {
  const results = new Array(items.length);
  let next = 0;
  async function worker() {
    while (next < items.length) {
      const i = next++;
      try {
        results[i] = { status: "fulfilled", value: await fn(items[i], i) };
      } catch (reason) {
        results[i] = { status: "rejected", reason };
      }
    }
  }
  await Promise.all(Array.from({ length: Math.max(1, Math.min(concurrency, items.length || 1)) }, worker));
  return results;
}

function rotateSlice(list, size, periodMs = 300000) {
  if (list.length <= size) return list;
  const start = (Math.floor(Date.now() / periodMs) * size) % list.length;
  const out = [];
  for (let i = 0; i < size; i++) out.push(list[(start + i) % list.length]);
  return out;
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store"
    }
  });
}

function esc(v) {
  return String(v ?? "").replace(/[&<>"']/g, c => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;",
    '"': "&quot;", "'": "&#39;"
  }[c]));
}

function num(v, fallback = 0) {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function money(v) {
  const n = Number(v);
  if (!Number.isFinite(n)) return "—";
  if (n >= 1e9) return "$" + (n / 1e9).toFixed(2) + "B";
  if (n >= 1e6) return "$" + (n / 1e6).toFixed(2) + "M";
  if (n >= 1e3) return "$" + (n / 1e3).toFixed(1) + "K";
  return "$" + n.toFixed(n < 1 ? 6 : 0);
}

function age(min) {
  const n = Number(min);
  if (!Number.isFinite(n)) return "—";
  if (n < 60) return Math.max(1, Math.round(n)) + "m";
  if (n < 1440) return Math.round(n / 60) + "h";
  return Math.round(n / 1440) + "d";
}

function socialLinks(info, extraLinks = []) {
  const links = [];
  const roots = { twitter: "https://x.com/", x: "https://x.com/", telegram: "https://t.me/",
    instagram: "https://instagram.com/", tiktok: "https://www.tiktok.com/@", youtube: "https://youtube.com/@" };
  const labels = { twitter: "X", x: "X", telegram: "Telegram", instagram: "Instagram",
    tiktok: "TikTok", youtube: "YouTube", discord: "Discord", reddit: "Reddit", facebook: "Facebook" };
  const add = (item, website = false) => {
    const platform = String(item?.platform || "").toLowerCase();
    const handle = String(item?.handle || "").replace(/^@/, "").trim();
    let rawUrl = String(item?.url || "").trim();
    if (!rawUrl && roots[platform] && /^[\w.-]{1,100}$/.test(handle)) rawUrl = roots[platform] + encodeURIComponent(handle);
    try {
      const parsed = new URL(rawUrl);
      if (parsed.protocol !== "https:") return;
      const label = website ? (item?.label || "Website") : (labels[platform] || item?.label || item?.platform || item?.type || "Social");
      if (!links.some(x => x.url === parsed.href)) links.push({ label: String(label).slice(0, 24), url: parsed.href });
    } catch {}
  };
  for (const website of (Array.isArray(info?.websites) ? info.websites : [])) add(website, true);
  for (const social of (Array.isArray(info?.socials) ? info.socials : [])) add(social);
  for (const link of extraLinks) add(link, String(link?.type || "").toLowerCase() === "website");
  return links.slice(0, 6);
}

function buildDecisionMetrics({ mcap, liq, vol1h, vol5m, buys, sells, tx5, ratio, change5, change1h, ageMin, acceleration, opportunity, risk, adjustedScore, discovery }) {
  const liqRatio = mcap > 0 ? (liq / mcap) * 100 : 0;
  let liqHealth = "unknown";
  let liqHealthLabel = "—";
  if (mcap > 0) {
    if (liqRatio < 6) {
      liqHealth = "danger";
      liqHealthLabel = "Perigosa (<6%) · Alto risco de slippage";
    } else if (liqRatio < 12) {
      liqHealth = "caution";
      liqHealthLabel = "Baixa (6-12%) · Pouca profundidade";
    } else if (liqRatio < 25) {
      liqHealth = "good";
      liqHealthLabel = "Saudável (12-25%) · Boa sustentação";
    } else {
      liqHealth = "excellent";
      liqHealthLabel = "Sólida (>25%) · Forte piso de liquidez";
    }
  }

  const volMcapRatio = mcap > 0 ? (vol1h / mcap) * 100 : 0;

  let stage;
  if (ageMin != null && ageMin < 45) {
    stage = {
      key: "sniping",
      name: "Fase 1 · Lançamento / Sniping",
      badge: "LANÇAMENTO",
      badgeClass: "stage-sniping",
      risk: "Extremo",
      desc: "Token muito jovem (<45m). Altíssima volatilidade e risco de dump dos criadores ou snipers."
    };
  } else if (mcap < 350000 || (ageMin != null && ageMin < 720)) {
    stage = {
      key: "traction",
      name: "Fase 2 · Tração / Breakout",
      badge: "TRAÇÃO",
      badgeClass: "stage-traction",
      risk: "Alto",
      desc: "Fase de consolidação ($60K-$350K MC). Ponto onde se define se vira comunidade ou morre."
    };
  } else {
    stage = {
      key: "runner",
      name: "Fase 3 · Runner / Consolidada",
      badge: "RUNNER",
      badgeClass: "stage-runner",
      risk: "Moderado",
      desc: "MarketCap acima de $350K. Menor risco de rug súbito, mas precisa de volume constante para subir."
    };
  }

  const pros = [];
  const cons = [];

  if (liq >= 30000 && liqRatio >= 12) {
    pros.push(`Liquidez expressiva: ${money(liq)} (${liqRatio.toFixed(1)}% do MC), o que amortece vendas grandes.`);
  } else if (liq >= 15000) {
    pros.push(`Pool de liquidez acima do mínimo de segurança (${money(liq)}).`);
  }
  if (liqRatio < 6 && mcap >= 50000) {
    cons.push(`Liquidez fina (${liqRatio.toFixed(1)}% do MC): qualquer ordem de venda média derrete o preço.`);
  } else if (liq < 10000) {
    cons.push(`Liquidez muito reduzida (${money(liq)}): risco extremo de manipulação e falta de saída.`);
  }

  if (ratio >= 1.5 && tx5 >= 25) {
    pros.push(`Forte pressão compradora: ${buys} compras vs ${sells} vendas nos últimos 5m (${ratio.toFixed(1)}x a favor).`);
  } else if (ratio >= 1.1 && tx5 >= 15) {
    pros.push(`Fluxo comprador superior às vendas (${buys} compras vs ${sells} vendas nos 5m).`);
  }
  if (sells > buys && tx5 >= 15) {
    cons.push(`Pressão vendedora dominante: ${sells} vendas vs ${buys} compras nos últimos 5m.`);
  } else if (sells === 0 && buys > 10) {
    cons.push(`Compras sem nenhuma venda nos últimos 5m (verificar se o token permite vender).`);
  }

  if (volMcapRatio >= 60 && mcap > 0) {
    pros.push(`Volume 1h muito ativo: ${money(vol1h)} representa ${volMcapRatio.toFixed(0)}% do MarketCap total.`);
  }
  if (acceleration >= 2.0 && vol1h > 5000) {
    pros.push(`Aceleração de volume detetada: ${acceleration.toFixed(1)}x acima do ritmo da última hora.`);
  }
  if (vol1h < 3000 && ageMin != null && ageMin > 60) {
    cons.push(`Volume 1h em queda (${money(vol1h)}): token a perder tração e liquidez de negociação.`);
  }

  if (change1h > 15 && change1h < 120 && change5 > 0) {
    pros.push(`Tendência de alta estável: +${change1h.toFixed(1)}% na última hora sem pump parabólico irracional.`);
  }
  if (change5 < -20) {
    cons.push(`Queda acentuada de curto prazo: ${change5.toFixed(1)}% nos últimos 5 minutos.`);
  } else if (change5 > 100) {
    cons.push(`Subida vertical parabólica (+${change5.toFixed(0)}% em 5m): alto risco de correção imediata.`);
  }

  if (ageMin != null && ageMin >= 180) {
    pros.push(`Sobreviveu à fase inicial de lançamento (${age(ageMin)} de vida).`);
  }
  if (discovery?.communityTakeover) {
    pros.push(`Projeto assumido pela comunidade (CTO / Community Takeover).`);
  }
  if (num(discovery?.boostTotal) >= 10) {
    pros.push(`Comunidade a impulsionar ativamente com ${num(discovery.boostTotal)} boosts.`);
  }

  let verdict = "";
  if (pros.length >= 3 && cons.length <= 1 && adjustedScore >= 55) {
    verdict = "Tese Favorável: Boa estrutura de liquidez e volume com pressão compradora real. Candidato interessante para entrada escalonada com stop definido.";
  } else if (stage.key === "sniping") {
    verdict = "Especulação Sniping: Moeda em nascimento. Apenas para posições pequenas e rápidas; proteja o capital contra despejo inicial.";
  } else if (cons.length >= 2 || risk > 55) {
    verdict = "Alerta de Cautela: Existem fragilidades evidentes (liquidez fina ou pressão de venda). Não recomendado entrar antes de estabilizar.";
  } else if (adjustedScore >= 45) {
    verdict = "Fase de Monitorização: O token tem atividade, mas ainda não confirmou volume suficiente para justificar uma tese forte de compra.";
  } else {
    verdict = "Baixa Convicção: Risco elevado em relação ao potencial atual. Manter sob observação.";
  }

  const targets = [];
  let support = null;

  if (mcap > 0) {
    const steps = [60000, 150000, 300000, 600000, 1200000, 2500000, 5000000, 10000000, 25000000, 50000000];
    const higherSteps = steps.filter(s => s > mcap * 1.25);
    const chosenTargets = higherSteps.slice(0, 3);
    if (chosenTargets.length < 3) {
      if (!chosenTargets.length) {
        chosenTargets.push(Math.round(mcap * 2), Math.round(mcap * 5), Math.round(mcap * 10));
      } else if (chosenTargets.length === 1) {
        chosenTargets.push(Math.round(chosenTargets[0] * 2.5), Math.round(chosenTargets[0] * 5));
      } else if (chosenTargets.length === 2) {
        chosenTargets.push(Math.round(chosenTargets[1] * 2.5));
      }
    }

    const labels = ["Alvo Conservador", "Alvo Médio (Runner)", "Alvo Otimista (Moon)"];
    for (let i = 0; i < chosenTargets.length; i++) {
      const tgtMcap = chosenTargets[i];
      const multiple = tgtMcap / mcap;
      const gainPct = (multiple - 1) * 100;
      targets.push({
        label: labels[i] || `Alvo ${i + 1}`,
        targetMcap: tgtMcap,
        multiple: Number(multiple.toFixed(1)),
        gainPct: Math.round(gainPct)
      });
    }

    const suppMcap = Math.max(1000, Math.round(mcap * 0.65));
    support = {
      supportMcap: suppMcap,
      downsidePct: -35
    };
  }

  return {
    liqRatio: Number(liqRatio.toFixed(1)),
    liqHealth,
    liqHealthLabel,
    volMcapRatio: Number(volMcapRatio.toFixed(1)),
    stage,
    conviction: {
      pros,
      cons,
      verdict
    },
    targets,
    support
  };
}

function scorePair(pair, discovery = {}) {
  const liq = num(pair?.liquidity?.usd);
  const vol1h = num(pair?.volume?.h1);
  const vol5m = num(pair?.volume?.m5);
  const buys = num(pair?.txns?.m5?.buys);
  const sells = num(pair?.txns?.m5?.sells);
  const tx5 = buys + sells;
  const change5 = num(pair?.priceChange?.m5);
  const change1h = num(pair?.priceChange?.h1);
  const created = num(pair?.pairCreatedAt);
  const ageMin = created ? Math.max(0, (Date.now() - created) / 60000) : null;
  const ratio = sells > 0 ? buys / sells : 0;
  const expected5m = vol1h > 0 ? vol1h / 12 : 0;
  const acceleration = expected5m > 0 ? vol5m / expected5m : 0;

  // Keep the core Opportunity formula stable while we collect the richer
  // data. Acceleration is stored as a separate feature for V2.7 backtesting.
  const momentum = Math.max(0, Math.min(25, 12.5 + change5 * 0.75));
  const liquidity = Math.max(0, Math.min(20, Math.log10(Math.max(liq, 100)) * 4.2 - 7));
  const activity = Math.max(0, Math.min(20, Math.log10(Math.max(tx5, 1)) * 8 - 2));
  const flow = sells === 0 && buys > 0
    ? 8
    : Math.max(0, Math.min(20, ratio >= 1 ? 10 + Math.min(10, (ratio - 1) * 6) : ratio * 10));
  const freshness = ageMin == null ? 6
    : ageMin <= 5 ? 15 : ageMin <= 15 ? 13 : ageMin <= 30 ? 11 : ageMin <= 60 ? 8 : ageMin <= 180 ? 5 : 2;
  const opportunity = Math.max(0, Math.min(100, Math.round(momentum + liquidity + activity + flow + freshness)));

  const mcap = num(pair?.marketCap || pair?.fdv);
  const liqRatio = mcap > 0 ? (liq / mcap) * 100 : 0;

  let risk = 10;
  const flags = [];
  if (liq < 10000) { risk += 20; flags.push("liquidez baixa"); }
  else if (liq < 25000) { risk += 10; flags.push("liquidez limitada"); }
  if (liq > 0 && vol1h / liq > 15) { risk += 18; flags.push("volume/liquidez extremo"); }
  if (Math.abs(change5) > 80) { risk += 18; flags.push("movimento 5m extremo"); }
  if (tx5 < 40) { risk += 12; flags.push("atividade baixa"); }
  if (sells === 0 && buys > 0) { risk += 8; flags.push("compras sem vendas"); }
  else if (ratio < 0.7) { risk += 15; flags.push("mais vendas"); }
  if (ageMin != null && ageMin < 15 && liq < 25000) { risk += 12; flags.push("muito novo + pouca liquidez"); }
  if (acceleration > 8 && liq < 15000) { risk += 8; flags.push("aceleração com pouca liquidez"); }

  // Armadilhas de liquidez relativa ao MarketCap
  if (mcap >= 50000 && liqRatio < 5) {
    risk += 25;
    flags.push("armadilha de liquidez: <5% do MC");
  } else if (mcap >= 40000 && liqRatio < 8) {
    risk += 16;
    flags.push("liquidez rasa para o MC (<8%)");
  }

  // Falta de volume pós-lançamento
  if (ageMin != null && ageMin > 90 && vol1h < 1500) {
    risk += 14;
    flags.push("volume em colapso (<$1.5k/h)");
  }

  // Market cap residual / moeda abandonada
  if (ageMin != null && ageMin > 60 && mcap > 0 && mcap < 15000) {
    risk += 14;
    flags.push("market cap residual (<$15k)");
  }

  risk = Math.max(0, Math.min(100, Math.round(risk)));
  const adjustedScore = Math.max(0, Math.min(100, Math.round(opportunity - risk * 0.45)));

  const decision = buildDecisionMetrics({
    mcap, liq, vol1h, vol5m, buys, sells, tx5, ratio, change5, change1h,
    ageMin, acceleration, opportunity, risk, adjustedScore, discovery
  });

  return {
    address: pair?.baseToken?.address || "", symbol: pair?.baseToken?.symbol || "TOKEN",
    name: pair?.baseToken?.name || "Unknown", url: pair?.url || "", pairAddress: String(pair?.pairAddress || ""), dex: pair?.dexId || "—",
    imageUrl: /^https:\/\/cdn\.dexscreener\.com\//i.test(String(pair?.info?.imageUrl || "")) ? pair.info.imageUrl : "",
    priceUsd: num(pair?.priceUsd), marketCap: mcap, liquidity: liq,
    volume5m: vol5m, volume1h: vol1h, tx5m: tx5, buys, sells, buySell: ratio,
    change5m: change5, change1h, acceleration, ageMin, opportunity, risk, adjustedScore,
    discoverySources: Array.isArray(discovery.sources) ? discovery.sources : [],
    socialLinks: socialLinks(pair?.info, discovery.links || []),
    boostAmount: num(discovery.boostAmount), boostTotal: num(discovery.boostTotal),
    communityTakeover: Boolean(discovery.communityTakeover),
    riskFlags: flags,
    alert: opportunity >= 72 && risk <= 55,
    factors: { momentum: Math.round(momentum), liquidity: Math.round(liquidity), activity: Math.round(activity), flow: Math.round(flow), freshness },
    ...decision
  };
}

async function fetchJsonWithRetry(url, label, options = {}) {
  const attempts = Number(options.attempts || 2);
  const timeoutMs = Number(options.timeoutMs || 7000);
  let lastError = null;
  for (let i = 0; i < attempts; i++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch(url, { headers: { "accept": "application/json" }, signal: controller.signal });
      if (response.ok) return await response.json();
      const body = await response.text();
      lastError = new Error(label + ": HTTP " + response.status + (body ? " · " + body.slice(0, 160) : ""));
      if (response.status !== 429 && response.status < 500) break;
    } catch (err) {
      lastError = err?.name === "AbortError" ? new Error(label + ": timeout após " + Math.round(timeoutMs / 1000) + "s") : err;
    } finally { clearTimeout(timer); }
    if (i < attempts - 1) await new Promise(resolve => setTimeout(resolve, 500 * Math.pow(2, i)));
  }
  throw lastError || new Error(label + ": request failed");
}

async function fetchSecurityReport(address) {
  if (!/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(address)) {
    throw new Error("Endereço Solana inválido");
  }

  const cached = securityReports.get(address);
  if (cached && Date.now() - cached.at < 10 * 60 * 1000) {
    securityReports.delete(address);
    securityReports.set(address, cached);
    return cached.data;
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);
  try {
    const response = await fetch(
      "https://api.rugcheck.xyz/v1/tokens/" + encodeURIComponent(address) + "/report/summary",
      { headers: { accept: "application/json" }, signal: controller.signal }
    );
    if (!response.ok) throw new Error("Serviço de análise indisponível (HTTP " + response.status + ")");
    const report = await response.json();
    if (report?.error) throw new Error(String(report.error).slice(0, 180));

    const risks = Array.isArray(report?.risks) ? report.risks.slice(0, 20).map(item => ({
      name: String(item?.name || "Risco reportado").slice(0, 100),
      level: String(item?.level || "unknown").slice(0, 30),
      description: String(item?.description || "").slice(0, 300),
      value: String(item?.value || "").slice(0, 100)
    })) : [];
    if (!Array.isArray(report?.risks) && report?.score_normalised == null && report?.lpLockedPct == null) {
      throw new Error("O serviço devolveu um relatório incompleto");
    }
    const hasSignal = pattern => risks.some(item => pattern.test(item.name + " " + item.description));
    const data = {
      provider: "RugCheck",
      checkedAt: new Date().toISOString(),
      score: report?.score_normalised != null && Number.isFinite(Number(report.score_normalised)) ? Number(report.score_normalised) : null,
      lpLockedPct: report?.lpLockedPct != null && Number.isFinite(Number(report.lpLockedPct)) ? Number(report.lpLockedPct) : null,
      tokenProgram: String(report?.tokenProgram || "").slice(0, 100),
      tokenType: String(report?.tokenType || "").slice(0, 100),
      mintAuthorityAlert: hasSignal(/mint.{0,24}authorit|authorit.{0,24}mint/i),
      freezeAuthorityAlert: hasSignal(/freeze.{0,24}authorit|authorit.{0,24}freeze/i),
      risks
    };
    while (securityReports.size >= 500) {
      const oldest = securityReports.keys().next().value;
      if (oldest == null) break;
      securityReports.delete(oldest);
    }
    securityReports.set(address, { at: Date.now(), data });
    return data;
  } finally {
    clearTimeout(timer);
  }
}

async function optionalDiscovery(path, label) {
  try {
    const data = await fetchJsonWithRetry(DEX + path, label, { attempts: 1, timeoutMs: 4500 });
    if (Array.isArray(data)) return { items: data, ok: true, error: null };
    return { items: data?.tokenAddress ? [data] : [], ok: true, error: null };
  } catch (err) {
    console.error(label + " discovery error", err);
    return { items: [], ok: false, error: err?.message || String(err) };
  }
}

function addDiscovery(map, item, source) {
  if (!item?.tokenAddress || item?.chainId !== "solana") return;
  const address = item.tokenAddress;
  const current = map.get(address) || { sources: [], boostAmount: 0, boostTotal: 0, communityTakeover: false, links: [] };
  if (!current.sources.includes(source)) current.sources.push(source);
  if (source === "boost") {
    current.boostAmount = Math.max(current.boostAmount, num(item.amount));
    current.boostTotal = Math.max(current.boostTotal, num(item.totalAmount));
  }
  if (source === "community") current.communityTakeover = true;
  for (const link of (Array.isArray(item.links) ? item.links : [])) {
    if (link?.url && !current.links.some(x => x.url === link.url)) current.links.push(link);
  }
  map.set(address, current);
}

function chunks(list, size) {
  const out = [];
  for (let i = 0; i < list.length; i += size) out.push(list.slice(i, i + size));
  return out;
}

async function scan(env) {
  const discovery = new Map();
  const sourceStatus = {};
  const discoveryResults = await Promise.allSettled([
    optionalDiscovery("/token-profiles/latest/v1", "DEX Screener profiles"),
    optionalDiscovery("/token-boosts/latest/v1", "DEX Screener boosts"),
    optionalDiscovery("/community-takeovers/latest/v1", "DEX Screener community takeovers")
  ]);
  const labels = ["profiles", "boosts", "community"];
  for (let i = 0; i < discoveryResults.length; i++) {
    const result = discoveryResults[i], key = labels[i];
    if (result.status === "fulfilled") {
      const value = result.value || { items: [], ok: false, error: "unknown" };
      sourceStatus[key] = value.ok ? "ok" : "error";
      for (const item of (value.items || [])) addDiscovery(discovery, item, key === "profiles" ? "profile" : key === "boosts" ? "boost" : "community");
      if (!value.ok) sourceStatus[key + "Error"] = value.error;
    } else {
      sourceStatus[key] = "error";
      sourceStatus[key + "Error"] = result.reason?.message || String(result.reason);
    }
  }
  try {
    await ensureSchema(env.DB);
    const r = await env.DB.prepare("SELECT address FROM tracked_tokens ORDER BY last_seen DESC LIMIT 500").all();
    for (const row of (r.results || [])) {
      if (!row.address) continue;
      const current = discovery.get(row.address) || { sources: [], boostAmount: 0, boostTotal: 0, communityTakeover: false, links: [] };
      if (!current.sources.includes("tracked")) current.sources.push("tracked");
      discovery.set(row.address, current);
    }
    for (const address of await pendingSampleAddresses(env.DB, 200)) {
      const current = discovery.get(address) || { sources: [], boostAmount: 0, boostTotal: 0, communityTakeover: false, links: [] };
      if (!current.sources.includes("tracked")) current.sources.push("tracked");
      discovery.set(address, current);
    }
    sourceStatus.tracked = "ok";
  } catch (err) {
    console.error("tracked discovery error", err);
    sourceStatus.tracked = "error";
    sourceStatus.trackedError = err?.message || String(err);
  }
  const trackedAddresses = [...discovery.entries()]
    .filter(([, info]) => info?.sources?.includes("tracked"))
    .map(([address]) => address);
  const freshAddresses = [...discovery.keys()].filter(address => !trackedAddresses.includes(address));
  const addresses = [...trackedAddresses, ...rotateSlice(freshAddresses, 60)];
  if (!addresses.length) return { tokens: [], discovered: 0, sourceStatus, batchesOk: 0, batchesFailed: 0 };

  const best = new Map(), batches = chunks(addresses, 30);
  let batchesOk = 0, batchesFailed = 0;
  const batchErrors = [];

  // Tracked tokens are always included. New discoveries rotate 60 per scan.
  const results = await allSettledPool(batches, 6, batch => fetchJsonWithRetry(
    DEX + "/tokens/v1/solana/" + batch.join(","),
    "DEX Screener token batch",
    { attempts: 1, timeoutMs: 4000 }
  ));
  for (const result of results) {
    if (result.status === "rejected") { batchesFailed++; batchErrors.push(result.reason?.message || String(result.reason)); continue; }
    batchesOk++;
    for (const pair of (Array.isArray(result.value) ? result.value : [])) {
      if (pair?.chainId !== "solana" || !pair?.baseToken?.address) continue;
      const key = pair.baseToken.address, current = best.get(key), liq = num(pair?.liquidity?.usd);
      if (!current || liq > num(current?.pair?.liquidity?.usd)) best.set(key, { pair, discovery: discovery.get(key) || { sources:["unknown"], boostAmount:0, boostTotal:0, communityTakeover:false } });
    }
  }
  sourceStatus.pairs = batchesFailed === 0 ? "ok" : (batchesOk > 0 ? "partial" : "error");
  if (batchErrors.length) sourceStatus.pairsErrors = batchErrors.slice(0, 3);
  const tokens = [...best.values()].map(x => scorePair(x.pair, x.discovery)).sort((a,b) => num(b.adjustedScore)-num(a.adjustedScore));
  return { tokens, discovered: addresses.length, sourceStatus, batchesOk, batchesFailed };
}

async function attachInitialMarketCaps(db, tokens) {
  const addresses = [...new Set(tokens.map(token => token?.address).filter(Boolean))];
  if (!addresses.length) return;
  const firstSeen = new Map();

  // D1 limits the number of bound SQL variables. A busy scan can return more
  // token addresses than fit in one IN (...) query, so load them in groups.
  for (let start = 0; start < addresses.length; start += 80) {
    const group = addresses.slice(start, start + 80);
    const placeholders = group.map(() => "?").join(",");
    const result = await db.prepare(`
      SELECT address, mcap FROM (
        SELECT address, mcap,
          ROW_NUMBER() OVER (PARTITION BY address ORDER BY CASE WHEN mcap > 0 THEN 0 ELSE 1 END, seen_at ASC) AS row_num
        FROM observations WHERE address IN (${placeholders})
      ) WHERE row_num = 1
    `).bind(...group).all();
    for (const row of result.results || []) {
      firstSeen.set(row.address, row.mcap == null ? null : num(row.mcap));
    }

    const tracked = await db.prepare(`
      SELECT address, initial_mcap FROM tracked_tokens WHERE address IN (${placeholders})
    `).bind(...group).all();
    for (const row of tracked.results || []) {
      if (row.initial_mcap != null) firstSeen.set(row.address, num(row.initial_mcap));
    }
  }
  for (const token of tokens) {
    if (firstSeen.has(token.address)) {
      token.initialMarketCap = firstSeen.get(token.address);
    } else if (num(token.marketCap) > 0) {
      token.initialMarketCap = num(token.marketCap);
    } else {
      token.initialMarketCap = null;
    }
  }
}

/* =========================================================
   D1 DATABASE + SAFE MIGRATION
========================================================= */

async function ensureSchema(db) {
  if (schemaReady) return;
  await db.prepare(`
    CREATE TABLE IF NOT EXISTS tracked_tokens (
      address TEXT PRIMARY KEY,
      symbol TEXT NOT NULL,
      name TEXT,
      first_seen INTEGER NOT NULL,
      initial_price REAL,
      initial_mcap REAL,
      initial_opportunity INTEGER,
      initial_risk INTEGER,
      current_price REAL,
      current_mcap REAL,
      current_opportunity INTEGER,
      current_risk INTEGER,
      peak_pct REAL DEFAULT 0,
      result TEXT DEFAULT 'tracking',
      last_seen INTEGER,
      hit10_at INTEGER,
      hit25_at INTEGER,
      stop20_at INTEGER,
      max_price REAL,
      max_drawdown_pct REAL DEFAULT 0,
      discovery_sources TEXT,
      boost_total REAL DEFAULT 0,
      community_takeover INTEGER DEFAULT 0,
      image_url TEXT
    )
  `).run();

  const info = await db.prepare("PRAGMA table_info(tracked_tokens)").all();
  const columns = new Set(
    (info.results || []).map(x => x.name)
  );

  const migrations = [
    ["hit10_at", "INTEGER"],
    ["hit25_at", "INTEGER"],
    ["stop20_at", "INTEGER"],
    ["max_price", "REAL"],
    ["max_drawdown_pct", "REAL DEFAULT 0"],
    ["discovery_sources", "TEXT"],
    ["boost_total", "REAL DEFAULT 0"],
    ["community_takeover", "INTEGER DEFAULT 0"],
    ["image_url", "TEXT"]
  ];

  for (const [name, definition] of migrations) {
    if (!columns.has(name)) {
      await db.prepare(
        "ALTER TABLE tracked_tokens ADD COLUMN " + name + " " + definition
      ).run();
    }
  }


  await db.batch([
    db.prepare(`
      CREATE TABLE IF NOT EXISTS observations (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        address TEXT NOT NULL,
        seen_at INTEGER NOT NULL,
        price REAL,
        mcap REAL,
        opportunity INTEGER,
        risk INTEGER,
        alert INTEGER,
        liquidity REAL, volume5m REAL, volume1h REAL,
        buys INTEGER, sells INTEGER, tx5m INTEGER,
        change5m REAL, change1h REAL, acceleration REAL, adjusted_score INTEGER,
        discovery_sources TEXT, boost_total REAL, community_takeover INTEGER
      )
    `),
    db.prepare(`
      CREATE INDEX IF NOT EXISTS idx_obs_address_time
      ON observations(address, seen_at)
    `)
  ]);

  await db.prepare(`CREATE TABLE IF NOT EXISTS prediction_samples (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    address TEXT NOT NULL,
    day_key TEXT NOT NULL,
    entry_at INTEGER NOT NULL,
    entry_price REAL NOT NULL,
    entry_score REAL, entry_risk REAL,
    change5m REAL, change1h REAL, liquidity REAL, volume1h REAL,
    buy_sell REAL, age_min REAL, acceleration REAL,
    short_due INTEGER, medium_due INTEGER, long_due INTEGER,
    short_exit REAL, medium_exit REAL, long_exit REAL,
    short_status TEXT DEFAULT 'pending',
    medium_status TEXT DEFAULT 'pending',
    long_status TEXT DEFAULT 'pending',
    UNIQUE(address, day_key)
  )`).run();
  const psInfo = await db.prepare("PRAGMA table_info(prediction_samples)").all();
  if (!(psInfo.results || []).some(c => c.name === "entry_mcap")) {
    await db.prepare("ALTER TABLE prediction_samples ADD COLUMN entry_mcap REAL").run();
  }
  await db.prepare(`CREATE INDEX IF NOT EXISTS idx_prediction_samples_horizons
    ON prediction_samples(short_status, medium_status, long_status, entry_at)`).run();

  const obsInfo = await db.prepare("PRAGMA table_info(observations)").all().catch(() => ({ results: [] }));
  const obsColumns = new Set((obsInfo.results || []).map(x => x.name));
  const obsMigrations = [
    ["liquidity", "REAL"], ["volume5m", "REAL"], ["volume1h", "REAL"],
    ["buys", "INTEGER"], ["sells", "INTEGER"], ["tx5m", "INTEGER"],
    ["change5m", "REAL"], ["change1h", "REAL"], ["acceleration", "REAL"],
    ["adjusted_score", "INTEGER"], ["discovery_sources", "TEXT"],
    ["boost_total", "REAL DEFAULT 0"], ["community_takeover", "INTEGER DEFAULT 0"]
  ];
  for (const [name, definition] of obsMigrations) {
    if (!obsColumns.has(name)) {
      await db.prepare("ALTER TABLE observations ADD COLUMN " + name + " " + definition).run();
    }
  }

  await db.prepare(`CREATE INDEX IF NOT EXISTS idx_obs_seen_at ON observations(seen_at)`).run();
  await db.prepare("CREATE TABLE IF NOT EXISTS alert_log (address TEXT NOT NULL, sent_at INTEGER NOT NULL, tier TEXT)").run();
  await db.prepare("CREATE INDEX IF NOT EXISTS idx_alert_log ON alert_log(address, sent_at)").run();
  await db.prepare("CREATE TABLE IF NOT EXISTS kv (key TEXT PRIMARY KEY, value TEXT)").run();
  schemaReady = true;
}

/* =========================================================
   SAVE SCAN
========================================================= */

async function persistScan(db, tokens) {
  await ensureSchema(db);
  const now = Date.now();
  const retentionCutoff = now - 30 * 24 * 60 * 60 * 1000;
  await db.prepare("DELETE FROM observations WHERE seen_at < ?").bind(retentionCutoff).run();

  const trackedRows = new Map();
  const allAddresses = [...new Set(tokens.map(t => t?.address).filter(Boolean))];
  for (let i = 0; i < allAddresses.length; i += 80) {
    const group = allAddresses.slice(i, i + 80);
    const res = await db.prepare(
      "SELECT * FROM tracked_tokens WHERE address IN (" + group.map(() => "?").join(",") + ")"
    ).bind(...group).all();
    for (const row of res.results || []) trackedRows.set(row.address, row);
  }
  const pendingSet = new Set(await pendingSampleAddresses(db, 500));
  const stmts = [];

  for (const x of tokens) {
    if (!x?.address) continue;
    const validPrice = hasValidPrice(x);
    const old = trackedRows.get(x.address);

    if (!old && shouldTrack(x) && validPrice) {
      stmts.push(db.prepare(`
        INSERT INTO tracked_tokens (
          address, symbol, name, first_seen,
          initial_price, initial_mcap, initial_opportunity, initial_risk,
          current_price, current_mcap, current_opportunity, current_risk,
          peak_pct, result, last_seen,
          hit10_at, hit25_at, stop20_at,
          max_price, max_drawdown_pct, discovery_sources, boost_total, community_takeover, image_url
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).bind(
        x.address,
        x.symbol,
        x.name,
        now,
        num(x.priceUsd),
        num(x.marketCap),
        num(x.opportunity),
        num(x.risk),
        num(x.priceUsd),
        num(x.marketCap),
        num(x.opportunity),
        num(x.risk),
        0,
        "tracking",
        now,
        null,
        null,
        null,
        num(x.priceUsd),
        0,
        JSON.stringify(x.discoverySources || []),
        num(x.boostTotal),
        x.communityTakeover ? 1 : 0,
        x.imageUrl || null
      ));
    } else if (old && !validPrice) {
      stmts.push(db.prepare(`
        UPDATE tracked_tokens
        SET symbol = ?, name = ?, last_seen = ?, image_url = ?
        WHERE address = ?
      `).bind(
        x.symbol || old.symbol,
        x.name || old.name,
        now,
        x.imageUrl || old.image_url || null,
        x.address
      ));
    } else if (old && validPrice) {
      const initialPrice = num(old.initial_price);
      const currentPrice = num(x.priceUsd);

      const pct = initialPrice > 0
        ? ((currentPrice - initialPrice) / initialPrice) * 100
        : 0;

      const oldPeak = num(old.peak_pct);
      const peak = Math.max(oldPeak, pct);

      const previousMaxPrice = num(
        old.max_price,
        initialPrice > 0 ? initialPrice : currentPrice
      );

      const maxPrice = Math.max(previousMaxPrice, currentPrice);

      const drawdownPct = maxPrice > 0
        ? ((currentPrice - maxPrice) / maxPrice) * 100
        : 0;

      const maxDrawdown = Math.min(
        num(old.max_drawdown_pct),
        drawdownPct
      );

      let hit10At = old.hit10_at || null;
      let hit25At = old.hit25_at || null;
      let stop20At = old.stop20_at || null;

      if (!hit10At && pct >= 10) hit10At = now;
      if (!hit25At && pct >= 25) hit25At = now;
      if (!stop20At && pct <= -20) stop20At = now;

      const result = trackingResult(hit10At, hit25At, stop20At);

      stmts.push(db.prepare(`
        UPDATE tracked_tokens
        SET
          symbol = ?,
          name = ?,
          current_price = ?,
          current_mcap = ?,
          current_opportunity = ?,
          current_risk = ?,
          peak_pct = ?,
          result = ?,
          last_seen = ?,
          hit10_at = ?,
          hit25_at = ?,
          stop20_at = ?,
          max_price = ?,
          max_drawdown_pct = ?,
          discovery_sources = ?,
          boost_total = ?,
          community_takeover = ?,
          image_url = ?
        WHERE address = ?
      `).bind(
        x.symbol,
        x.name,
        currentPrice,
        num(x.marketCap),
        num(x.opportunity),
        num(x.risk),
        peak,
        result,
        now,
        hit10At,
        hit25At,
        stop20At,
        maxPrice,
        maxDrawdown,
        JSON.stringify(x.discoverySources || []),
        num(x.boostTotal),
        x.communityTakeover ? 1 : 0,
        x.imageUrl || old.image_url || null,
        x.address
      ));
    }

    if ((old || pendingSet.has(x.address) || shouldTrack(x) || num(x.adjustedScore) >= 45) && validPrice) {
      stmts.push(db.prepare(`
        INSERT INTO observations (
          address, seen_at, price, mcap, opportunity, risk, alert,
          liquidity, volume5m, volume1h, buys, sells, tx5m, change5m, change1h,
          acceleration, adjusted_score, discovery_sources, boost_total, community_takeover
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).bind(
        x.address,
        now,
        num(x.priceUsd),
        num(x.marketCap),
        num(x.opportunity),
        num(x.risk),
        x.alert ? 1 : 0,
        num(x.liquidity), num(x.volume5m), num(x.volume1h),
        num(x.buys), num(x.sells), num(x.tx5m), num(x.change5m), num(x.change1h),
        num(x.acceleration), num(x.adjustedScore), JSON.stringify(x.discoverySources || []),
        num(x.boostTotal), x.communityTakeover ? 1 : 0
      ));
    }
  }

  for (let i = 0; i < stmts.length; i += 80) await db.batch(stmts.slice(i, i + 80));
  await saveForecastSamples(db, tokens, now, [...pendingSet]);

  return now;
}

/* =========================================================
   HISTORY
========================================================= */

async function history(db) {
  await ensureSchema(db);

  const r = await db.prepare(`
    SELECT *
    FROM tracked_tokens
    ORDER BY first_seen DESC
    LIMIT 500
  `).all();

  return (r.results || []).map(x => {
    const initialPrice = num(x.initial_price);
    const currentPrice = num(x.current_price);

    const changePct = initialPrice > 0
      ? ((currentPrice - initialPrice) / initialPrice) * 100
      : 0;

    const adjustedScore = Math.max(
      0,
      Math.min(
        100,
        Math.round(
          num(x.initial_opportunity) -
          num(x.initial_risk) * 0.45
        )
      )
    );

    return {
      ...x,
      changePct,
      initial_adjusted_score: adjustedScore
    };
  });
}

/* =========================================================
   ANALYTICS V2.4
========================================================= */

async function analytics(db) {
  await ensureSchema(db);

  const r = await db.prepare(`
    SELECT
      address,
      symbol,
      name,
      image_url,
      initial_opportunity,
      initial_risk,
      result,
      first_seen,
      last_seen,
      initial_price,
      initial_mcap,
      current_price,
      current_mcap,
      hit10_at,
      hit25_at,
      stop20_at,
      peak_pct,
      max_drawdown_pct
    FROM tracked_tokens
    ORDER BY first_seen ASC
    LIMIT 5000
  `).all();

  const data = Array.isArray(r.results) ? r.results : [];

  const bucketNames = [
    "<45", "45-54", "55-64", "65-74", "75-84", "85+"
  ];

  const buckets = {};
  for (const name of bucketNames) {
    buckets[name] = {
      total: 0,
      hit10: 0,
      hit25: 0,
      stop20: 0,
      tracking: 0,
      avgPeak: 0,
      avgDrawdown: 0,
      avgMinTo10: 0,
      avgMinTo25: 0,
      avgMinToStop20: 0,
      countTime10: 0,
      countTime25: 0,
      countTimeStop20: 0,
      tokens: []
    };
  }

  let hit10 = 0;
  let hit25 = 0;
  let stop20 = 0;
  let tracking = 0;
  let peakSum = 0;
  let drawdownSum = 0;
  let time10Sum = 0;
  let time25Sum = 0;
  let timeStopSum = 0;
  let time10Count = 0;
  let time25Count = 0;
  let timeStopCount = 0;

  function adjusted(row) {
    return Math.max(
      0,
      Math.min(
        100,
        Math.round(
          num(row.initial_opportunity) -
          num(row.initial_risk) * 0.45
        )
      )
    );
  }

  function bucketFor(score) {
    if (score < 45) return "<45";
    if (score < 55) return "45-54";
    if (score < 65) return "55-64";
    if (score < 75) return "65-74";
    if (score < 85) return "75-84";
    return "85+";
  }

  for (const row of data) {
    const score = adjusted(row);
    const bucket = bucketFor(score);
    const b = buckets[bucket];

    b.total++;
    if (b.tokens.length < 250) {
      b.tokens.push({
        address: row.address,
        symbol: row.symbol,
        name: row.name,
        imageUrl: row.image_url,
        score,
        risk: num(row.initial_risk),
        initialPrice: num(row.initial_price),
        initialMcap: num(row.initial_mcap),
        currentPrice: num(row.current_price),
        currentMcap: num(row.current_mcap),
        firstSeen: num(row.first_seen),
        lastSeen: num(row.last_seen),
        result: row.result || "tracking"
      });
    }

    const first = num(row.first_seen);
    const peak = num(row.peak_pct);
    const dd = num(row.max_drawdown_pct);

    b.avgPeak += peak;
    b.avgDrawdown += dd;
    peakSum += peak;
    drawdownSum += dd;

    const flags = resultFlags(row.result);
    const hasHit10 = Boolean(row.hit10_at) || flags.hit10;
    const hasHit25 = Boolean(row.hit25_at) || flags.hit25;
    const hasStop20 = Boolean(row.stop20_at) || flags.stop20;

    if (hasHit10) {
      hit10++;
      b.hit10++;

      if (row.hit10_at) {
        const mins = Math.max(0, (num(row.hit10_at) - first) / 60000);
        time10Sum += mins;
        time10Count++;
        b.avgMinTo10 += mins;
        b.countTime10++;
      }
    }

    if (hasHit25) {
      hit25++;
      b.hit25++;

      if (row.hit25_at) {
        const mins = Math.max(0, (num(row.hit25_at) - first) / 60000);
        time25Sum += mins;
        time25Count++;
        b.avgMinTo25 += mins;
        b.countTime25++;
      }
    }

    if (hasStop20) {
      stop20++;
      b.stop20++;

      if (row.stop20_at) {
        const mins = Math.max(0, (num(row.stop20_at) - first) / 60000);
        timeStopSum += mins;
        timeStopCount++;
        b.avgMinToStop20 += mins;
        b.countTimeStop20++;
      }
    }

    if (!hasHit10 && !hasHit25 && !hasStop20) {
      tracking++;
      b.tracking++;
    }
  }

  for (const name of bucketNames) {
    const b = buckets[name];

    if (b.total) {
      b.avgPeak = b.avgPeak / b.total;
      b.avgDrawdown = b.avgDrawdown / b.total;
    }

    if (b.countTime10) b.avgMinTo10 /= b.countTime10;
    if (b.countTime25) b.avgMinTo25 /= b.countTime25;
    if (b.countTimeStop20) b.avgMinToStop20 /= b.countTimeStop20;
  }

  const observationRow = await db.prepare("SELECT COUNT(*) AS count FROM observations").first();

  return {
    version: "2.8.1",
    tracked: data.length,
    observations: num(observationRow?.count),
    hit10,
    hit25,
    stop20,
    tracking,
    rates: {
      hit10: data.length ? hit10 / data.length * 100 : 0,
      hit25: data.length ? hit25 / data.length * 100 : 0,
      stop20: data.length ? stop20 / data.length * 100 : 0
    },
    averages: {
      peakPct: data.length ? peakSum / data.length : 0,
      maxDrawdownPct: data.length ? drawdownSum / data.length : 0,
      minutesTo10: time10Count ? time10Sum / time10Count : null,
      minutesTo25: time25Count ? time25Sum / time25Count : null,
      minutesToStop20: timeStopCount ? timeStopSum / timeStopCount : null
    },
    buckets
  };
}

/* =========================================================
   EXECUTE SCAN
========================================================= */

function isStrongBase(x) {
  return x.alert && num(x.risk) <= 40 && num(x.liquidity) >= 25000 && num(x.adjustedScore) >= 60;
}
function isStrong(x) {
  return isStrongBase(x) && x.security?.checked === true && x.security.danger === false;
}

function forecastPasses(x) {
  return Object.values(x.forecasts || {}).some(f => f?.ready && f.validated &&
    num(f.probabilityUp) >= 65 && num(f.expectedReturnPct) > 0 && num(x.risk) <= 55 &&
    num(x.liquidity) >= 10000 && num(x.adjustedScore) >= 55 && f.applicable !== false);
}

// Um sinal so e valido se a verificacao on-chain (RugCheck) correu e nao encontrou perigo grave.
function isAiSignal(x) {
  return forecastPasses(x) && x.security?.checked === true && x.security.danger === false;
}

async function attachSecurityGate(tokens) {
  const candidates = tokens.filter(x => forecastPasses(x) || isStrongBase(x)).slice(0, 8);
  await Promise.allSettled(candidates.map(async x => {
    try {
      const r = await fetchSecurityReport(x.address);
      const dangerRisks = r.risks.filter(item => item.level === "danger").map(item => item.name);
      x.security = {
        checked: true,
        danger: r.mintAuthorityAlert || r.freezeAuthorityAlert || dangerRisks.length > 0,
        mintAuthorityAlert: r.mintAuthorityAlert, freezeAuthorityAlert: r.freezeAuthorityAlert,
        lpLockedPct: r.lpLockedPct, dangerRisks: dangerRisks.slice(0, 5)
      };
    } catch (err) {
      x.security = { checked: false, danger: null };
    }
  }));
}

function formatScanResult(result, at) {
  const tokens = result.tokens || [];
  const aiAlerts = tokens.filter(isAiSignal).length;
  const sourceCounts = {};
  for (const token of tokens) {
    for (const source of (token.discoverySources || [])) {
      sourceCounts[source] = (sourceCounts[source] || 0) + 1;
    }
  }
  return {
    count: tokens.length,
    discovered: result.discovered || 0,
    alerts: aiAlerts,
    scannerAlerts: tokens.filter(x => x.alert).length,
    sourceCounts,
    sourceStatus: result.sourceStatus || {},
    batchesOk: result.batchesOk || 0,
    batchesFailed: result.batchesFailed || 0,
    at: new Date(at).toISOString(),
    tokens
  };
}

async function setMeta(db, obj) {
  await ensureSchema(db);
  await db.batch(Object.entries(obj).map(([k, v]) =>
    db.prepare("INSERT OR REPLACE INTO kv (key, value) VALUES (?, ?)").bind(k, String(v))));
}

async function sendTelegram(env, text) {
  if (!env.TELEGRAM_BOT_TOKEN || !env.TELEGRAM_CHAT_ID) return { ok: false, reason: "Telegram não configurado" };
  try {
    const r = await fetch("https://api.telegram.org/bot" + env.TELEGRAM_BOT_TOKEN + "/sendMessage", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ chat_id: env.TELEGRAM_CHAT_ID, text, parse_mode: "HTML", disable_web_page_preview: true })
    });
    return r.ok ? { ok: true } : { ok: false, reason: "Telegram HTTP " + r.status };
  } catch (err) { return { ok: false, reason: err?.message || "erro de rede" }; }
}

async function notifyStrongTokens(env, tokens) {
  await ensureSchema(env.DB);
  const cooldown = Date.now() - 12 * 3600000;
  let sent = 0;
  for (const x of tokens.filter(t => isAiSignal(t) || isStrong(t)).slice(0, 5)) {
    const seen = await env.DB.prepare("SELECT 1 AS n FROM alert_log WHERE address = ? AND sent_at > ? LIMIT 1").bind(x.address, cooldown).first();
    if (seen) continue;
    const ai = isAiSignal(x);
    const best = Object.values(x.forecasts || {}).filter(f => f?.ready && f.validated).sort((p, q) => q.probabilityUp - p.probabilityUp)[0];
    const text = (ai ? "🚨 <b>Sinal IA validado</b>" : "🔔 <b>Candidato forte</b> (scanner, sem validação IA)") +
      "\n<b>$" + esc(x.symbol) + "</b> · " + esc(x.name) +
      "\nPreço $" + x.priceUsd + " · MC " + money(x.marketCap) + " · Liq " + money(x.liquidity) +
      "\nScore " + x.adjustedScore + " · Risco " + x.risk + "/100" +
      (best ? " · Prob. subida " + best.probabilityUp + "% (" + best.horizon + ")" : "") +
      "\nRugCheck: sem perigo grave detetado\n" + esc(x.url) +
      "\n⚠️ Estimativa estatística, não é aconselhamento financeiro.";
    const r = await sendTelegram(env, text);
    if (r.ok) {
      await env.DB.prepare("INSERT INTO alert_log (address, sent_at, tier) VALUES (?, ?, ?)").bind(x.address, Date.now(), ai ? "ai" : "strong").run();
      sent++;
    } else if (r.reason !== "Telegram não configurado") console.error("telegram", r.reason);
  }
  return sent;
}

async function executeScan(env) {
  try {
    const result = await scan(env);
    const tokens = result.tokens || [];
    const at = Date.now();
    await enqueuePersist(env.DB, tokens);
    await attachForecasts(env.DB, tokens);
    await attachSecurityGate(tokens);
    let notified = 0;
    try { notified = await notifyStrongTokens(env, tokens); } catch (err) { console.error("notify error", err); }
    await setMeta(env.DB, { last_cron_at: at, last_cron_tokens: tokens.length, last_cron_notified: notified, last_cron_error: "" });
    return formatScanResult(result, at);
  } catch (err) {
    console.error("scheduled scan failed", err);
    try { await setMeta(env.DB, { last_cron_error: String(err?.message || err).slice(0, 200), last_cron_failed_at: Date.now() }); } catch {}
    throw err;
  }
}

/* =========================================================
   FRONTEND
========================================================= */


/* =========================================================
   HTTP ROUTER
========================================================= */

async function handleRequest(request, env, ctx) {
  const url = new URL(request.url);

  if (request.method === "GET" && url.pathname === "/") {
    return new Response(page(), {
      headers: {
        "content-type": "text/html; charset=utf-8",
        "cache-control": "no-store"
      }
    });
  }

  if (request.method === "GET" && url.pathname === "/api/scan") {
    try {
      // Critical path: return market data as soon as the external scan finishes.
      // D1 persistence runs in the background so hundreds of small D1 writes can
      // never hold the iPhone request open until the browser timeout.
      const result = await scan(env);
      await ensureSchema(env.DB);
      ctx.waitUntil(
        enqueuePersist(env.DB, result.tokens || []).catch(err => {
          console.error("background persist error", err);
        })
      );
      await attachInitialMarketCaps(env.DB, result.tokens || []);
      await attachForecasts(env.DB, result.tokens || []);
      await attachSecurityGate(result.tokens || []);
      return json(formatScanResult(result, Date.now()));
    } catch (err) {
      console.error("scan error", err);
      return json({
        error: err?.message || "scan failed"
      }, 500);
    }
  }

  if (request.method === "GET" && url.pathname === "/api/security") {
    const address = url.searchParams.get("address") || "";
    try {
      return json(await fetchSecurityReport(address));
    } catch (err) {
      console.error("security report error", err);
      const status = /inválido/.test(err?.message || "") ? 400 : 502;
      return json({ error: err?.message || "Não foi possível obter a análise de risco" }, status);
    }
  }

  if (request.method === "GET" && url.pathname === "/api/history") {
    try {
      return json(await history(env.DB));
    } catch (err) {
      console.error("history error", err);
      return json({
        error: err?.message || "history failed"
      }, 500);
    }
  }

  if (request.method === "GET" && url.pathname === "/api/analytics") {
    try {
      return json(await analytics(env.DB));
    } catch (err) {
      console.error("analytics error", err);
      return json({
        error: err?.message || "analytics failed"
      }, 500);
    }
  }

  if (request.method === "GET" && url.pathname === "/api/health") {
    try {
      await ensureSchema(env.DB);
      const rows = (await env.DB.prepare("SELECT key, value FROM kv").all()).results || [];
      const m = Object.fromEntries(rows.map(r => [r.key, r.value]));
      return json({ lastCronAt: num(m.last_cron_at) || null, lastCronTokens: num(m.last_cron_tokens), lastCronError: m.last_cron_error || "",
        telegramConfigured: Boolean(env.TELEGRAM_BOT_TOKEN && env.TELEGRAM_CHAT_ID) });
    } catch (err) { return json({ error: err?.message || "health failed" }, 500); }
  }

  if (request.method === "POST" && url.pathname === "/api/notify-test") {
    const r = await sendTelegram(env, "✅ Meme AI: notificações Telegram a funcionar.");
    return json(r, r.ok ? 200 : 400);
  }

  return json({ error: "Not found" }, 404);
}

export default {
  async fetch(request, env, ctx) {
    return handleRequest(request, env, ctx);
  },

  async scheduled(event, env, ctx) {
    ctx.waitUntil(executeScan(env));
  }
};

// V2.8.1 persist reliability, tracked coverage, and forecast outcomes
