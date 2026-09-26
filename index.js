import { attachForecasts, saveForecastSamples } from "./forecast.js";
import { page } from "./ui.js";

const DEX = "https://api.dexscreener.com";

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
  const ageMin = created ? Math.max(0, (Date.now() - created) / 60000) : 99999;
  const ratio = sells > 0 ? buys / sells : buys > 0 ? 9.99 : 0;
  const expected5m = vol1h > 0 ? vol1h / 12 : 0;
  const acceleration = expected5m > 0 ? vol5m / expected5m : 0;

  // Keep the core Opportunity formula stable while we collect the richer
  // data. Acceleration is stored as a separate feature for V2.7 backtesting.
  const momentum = Math.max(0, Math.min(25, 12.5 + change5 * 0.75));
  const liquidity = Math.max(0, Math.min(20, Math.log10(Math.max(liq, 100)) * 4.2 - 7));
  const activity = Math.max(0, Math.min(20, Math.log10(Math.max(tx5, 1)) * 8 - 2));
  const flow = Math.max(0, Math.min(20, ratio >= 1 ? 10 + Math.min(10, (ratio - 1) * 6) : ratio * 10));
  const freshness = ageMin <= 5 ? 15 : ageMin <= 15 ? 13 : ageMin <= 30 ? 11 : ageMin <= 60 ? 8 : ageMin <= 180 ? 5 : 2;
  const opportunity = Math.max(0, Math.min(100, Math.round(momentum + liquidity + activity + flow + freshness)));

  let risk = 10;
  const flags = [];
  if (liq < 10000) { risk += 20; flags.push("liquidez baixa"); }
  else if (liq < 25000) { risk += 10; flags.push("liquidez limitada"); }
  if (liq > 0 && vol1h / liq > 15) { risk += 18; flags.push("volume/liquidez extremo"); }
  if (Math.abs(change5) > 80) { risk += 18; flags.push("movimento 5m extremo"); }
  if (tx5 < 40) { risk += 12; flags.push("atividade baixa"); }
  if (ratio < 0.7) { risk += 15; flags.push("mais vendas"); }
  if (ageMin < 15 && liq < 25000) { risk += 12; flags.push("muito novo + pouca liquidez"); }
  if (acceleration > 8 && liq < 15000) { risk += 8; flags.push("aceleração com pouca liquidez"); }
  risk = Math.max(0, Math.min(100, Math.round(risk)));
  const adjustedScore = Math.max(0, Math.min(100, Math.round(opportunity - risk * 0.45)));

  return {
    address: pair?.baseToken?.address || "", symbol: pair?.baseToken?.symbol || "TOKEN",
    name: pair?.baseToken?.name || "Unknown", url: pair?.url || "", dex: pair?.dexId || "—",
    priceUsd: num(pair?.priceUsd), marketCap: num(pair?.marketCap || pair?.fdv), liquidity: liq,
    volume5m: vol5m, volume1h: vol1h, tx5m: tx5, buys, sells, buySell: ratio,
    change5m: change5, change1h, acceleration, ageMin, opportunity, risk, adjustedScore,
    discoverySources: Array.isArray(discovery.sources) ? discovery.sources : [],
    socialLinks: socialLinks(pair?.info, discovery.links || []),
    boostAmount: num(discovery.boostAmount), boostTotal: num(discovery.boostTotal),
    communityTakeover: Boolean(discovery.communityTakeover),
    riskFlags: flags,
    alert: opportunity >= 72 && risk <= 55,
    factors: { momentum: Math.round(momentum), liquidity: Math.round(liquidity), activity: Math.round(activity), flow: Math.round(flow), freshness }
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
    const r = await env.DB.prepare("SELECT address FROM tracked_tokens ORDER BY last_seen DESC LIMIT 500").all();
    for (const row of (r.results || [])) {
      if (!row.address) continue;
      const current = discovery.get(row.address) || { sources: [], boostAmount: 0, boostTotal: 0, communityTakeover: false };
      if (!current.sources.includes("tracked")) current.sources.push("tracked");
      discovery.set(row.address, current);
    }
    sourceStatus.tracked = "ok";
  } catch (err) {
    console.error("tracked discovery error", err);
    sourceStatus.tracked = "error";
    sourceStatus.trackedError = err?.message || String(err);
  }
  // Fast-scan policy: tracked tokens are always first, then only a controlled
  // number of newly discovered candidates. This keeps the mobile scan fast
  // while still allowing discovery to refresh continuously across scans.
  const addresses = [...discovery.keys()].sort((a,b) => {
    const at = discovery.get(a)?.sources?.includes("tracked") ? 0 : 1;
    const bt = discovery.get(b)?.sources?.includes("tracked") ? 0 : 1;
    return at - bt;
  }).slice(0, 180);
  if (!addresses.length) return { tokens: [], discovered: 0, sourceStatus, batchesOk: 0, batchesFailed: 0 };

  const best = new Map(), batches = chunks(addresses, 30);
  let batchesOk = 0, batchesFailed = 0;
  const batchErrors = [];

  // Run all small batches concurrently. DEX Screener's token endpoint accepts
  // up to 30 addresses per request, so 180 addresses means at most 6 requests.
  // Keeping the total bounded avoids a long serial waterfall on mobile.
  const results = await Promise.allSettled(batches.map(batch => fetchJsonWithRetry(
    DEX + "/tokens/v1/solana/" + batch.join(","),
    "DEX Screener token batch",
    { attempts: 1, timeoutMs: 2500 }
  )));
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

/* =========================================================
   D1 DATABASE + SAFE MIGRATION
========================================================= */

async function ensureSchema(db) {
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
      community_takeover INTEGER DEFAULT 0
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
    ["community_takeover", "INTEGER DEFAULT 0"]
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

}

/* =========================================================
   SAVE SCAN
========================================================= */

async function persistScan(db, tokens) {
  await ensureSchema(db);
  const now = Date.now();
  const retentionCutoff = now - 30 * 24 * 60 * 60 * 1000;
  await db.prepare("DELETE FROM observations WHERE seen_at < ?").bind(retentionCutoff).run();

  for (const x of tokens) {
    if (!x?.address) continue;

    const old = await db.prepare(
      "SELECT * FROM tracked_tokens WHERE address = ?"
    ).bind(x.address).first();

    if (!old && x.alert) {
      await db.prepare(`
        INSERT INTO tracked_tokens (
          address, symbol, name, first_seen,
          initial_price, initial_mcap, initial_opportunity, initial_risk,
          current_price, current_mcap, current_opportunity, current_risk,
          peak_pct, result, last_seen,
          hit10_at, hit25_at, stop20_at,
          max_price, max_drawdown_pct, discovery_sources, boost_total, community_takeover
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
        x.communityTakeover ? 1 : 0
      ).run();
    } else if (old) {
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

      let result = old.result || "tracking";

      if (hit25At) {
        result = "hit25";
      } else if (hit10At) {
        result = "hit10";
      } else if (stop20At) {
        result = "stop20";
      }

      await db.prepare(`
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
          community_takeover = ?
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
        x.address
      ).run();
    }

    if (old || x.alert || num(x.adjustedScore) >= 45) {
      await db.prepare(`
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
      ).run();
    }
  }

  await saveForecastSamples(db, tokens, now);

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

    const legacyHit25 = row.result === "hit25";
    const legacyHit10 = row.result === "hit10" || legacyHit25;
    const legacyStop20 = row.result === "stop20";

    const hasHit10 = Boolean(row.hit10_at) || legacyHit10;
    const hasHit25 = Boolean(row.hit25_at) || legacyHit25;
    const hasStop20 = Boolean(row.stop20_at) || legacyStop20;

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
    version: "2.6.4",
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

function formatScanResult(result, at) {
  const tokens = result.tokens || [];
  const aiAlerts = tokens.filter(x => Object.values(x.forecasts || {}).some(f => f?.ready && f.validated &&
    num(f.probabilityUp) >= 65 && num(f.expectedReturnPct) > 0 && num(x.risk) <= 55 &&
    num(x.liquidity) >= 10000 && num(x.adjustedScore) >= 55)).length;
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

async function executeScan(env) {
  const result = await scan(env);
  const tokens = result.tokens || [];
  const at = Date.now();
  await persistScan(env.DB, tokens);
  return formatScanResult(result, at);
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
      await attachForecasts(env.DB, result.tokens || []);
      const response = formatScanResult(result, Date.now());
      ctx.waitUntil(
        persistScan(env.DB, result.tokens || []).catch(err => {
          console.error("background persist error", err);
        })
      );
      return json(response);
    } catch (err) {
      console.error("scan error", err);
      return json({
        error: err?.message || "scan failed"
      }, 500);
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

// V2.7 supervised forecasting release
