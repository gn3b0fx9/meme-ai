/* Supervised forecasts learn from observed outcomes; no forecast is presented
   until there are enough completed examples for that horizon. */
const FORECAST_HORIZONS = [
  { key: "short", label: "1h", ms: 3600000, earlyMs: 20 * 60000, tolerance: 2 * 3600000, expireGrace: 6 * 3600000 },
  { key: "medium", label: "24h", ms: 86400000, earlyMs: 2 * 3600000, tolerance: 12 * 3600000, expireGrace: 36 * 3600000 },
  { key: "long", label: "7d", ms: 604800000, earlyMs: 12 * 3600000, tolerance: 2 * 86400000, expireGrace: 3 * 86400000 }
];
let predictionModelCache = { trainedAt: 0, models: null };
const num = (v, fallback = 0) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
};

function modelFeatures(x) {
  const c = (v, lo, hi) => Math.max(lo, Math.min(hi, num(v)));
  const age = x?.ageMin == null || !Number.isFinite(Number(x.ageMin)) ? 1440 : num(x.ageMin);
  const liq = Math.max(1, num(x?.liquidity));
  const mcap = num(x?.marketCap || x?.mcap);
  const liqRatio = mcap > 0 ? (liq / mcap) : (x?.liqRatio ? num(x.liqRatio) / 100 : 0.15);
  return [1, c(x?.adjustedScore, 0, 100) / 100, c(x?.risk, 0, 100) / 100,
    c(x?.change5m, -50, 50) / 50, c(x?.change1h, -100, 100) / 100,
    c(Math.log10(liq), 0, 8) / 8,
    c(Math.log10(Math.max(1, num(x?.volume1h))), 0, 9) / 9,
    c(x?.buySell, 0, 5) / 5, c(age, 0, 10080) / 10080,
    c(x?.acceleration, 0, 20) / 20,
    c(liqRatio, 0, 0.5) / 0.5];
}

const MIN_VALIDATION_SAMPLES = 40;
const dotProduct = (w, x) => { let s = 0; for (let j = 0; j < w.length; j++) s += w[j] * x[j]; return s; };
const sigmoid = z => 1 / (1 + Math.exp(-Math.max(-20, Math.min(20, z))));

function trainHorizon(rows) {
  const data = rows.filter(x => num(x.entry_price) > 0 && num(x.exit_price) > 0);
  if (data.length < 100) return { trained: false, samples: data.length };
  const xs = data.map(x => modelFeatures({ adjustedScore: x.entry_score, risk: x.entry_risk,
    change5m: x.change5m, change1h: x.change1h, liquidity: x.liquidity,
    volume1h: x.volume1h, buySell: x.buy_sell, ageMin: x.age_min, acceleration: x.acceleration,
    marketCap: x.entry_mcap || x.mcap }));
  const returns = data.map(x => Math.max(-80, Math.min(200,
    (num(x.exit_price) / num(x.entry_price) - 1) * 100)));
  const labels = returns.map(y => y > 0 ? 1 : 0);
  const trainCount = Math.max(1, Math.floor(data.length * 0.8));
  const d = xs[0].length;
  // O bias comeca na taxa base / retorno medio: sem sinal, o modelo devolve a taxa base (nao 50%).
  let baseRate = 0, meanRet = 0;
  for (let i = 0; i < trainCount; i++) { baseRate += labels[i]; meanRet += returns[i] / 100; }
  baseRate = Math.min(0.98, Math.max(0.02, baseRate / trainCount)); meanRet /= trainCount;
  const logistic = Array(d).fill(0), regression = Array(d).fill(0);
  logistic[0] = Math.log(baseRate / (1 - baseRate)); regression[0] = meanRet;
  const EPOCHS = 250, LR_LOGISTIC = 0.5, LR_REGRESSION = 0.1, L2 = 0.002;
  const g = Array(d), rg = Array(d);
  for (let epoch = 0; epoch < EPOCHS; epoch++) {
    g.fill(0); rg.fill(0);
    for (let i = 0; i < trainCount; i++) {
      const xi = xs[i];
      const pe = sigmoid(dotProduct(logistic, xi)) - labels[i];
      const re = dotProduct(regression, xi) - returns[i] / 100;
      for (let j = 0; j < d; j++) { g[j] += pe * xi[j]; rg[j] += re * xi[j]; }
    }
    for (let j = 0; j < d; j++) {
      const reg = j === 0 ? 0 : L2;
      logistic[j] -= LR_LOGISTIC * (g[j] / trainCount + reg * logistic[j]);
      regression[j] -= LR_REGRESSION * (rg[j] / trainCount + reg * regression[j]);
    }
  }
  let tp = 0, tn = 0, fp = 0, fn = 0;
  for (let i = trainCount; i < xs.length; i++) {
    const predicted = sigmoid(dotProduct(logistic, xs[i])) >= 0.5, actual = labels[i] === 1;
    if (predicted && actual) tp++; else if (!predicted && !actual) tn++; else if (predicted) fp++; else fn++;
  }
  const P = tp + fn, N = tn + fp;
  const sensitivity = P ? tp / P : 0, specificity = N ? tn / N : 0;
  const ba = (sensitivity + specificity) / 2;
  // Erro-padrao da accuracy balanceada: com poucos exemplos, 60% e indistinguivel de sorte.
  const se = P && N ? 0.5 * Math.sqrt(sensitivity * (1 - sensitivity) / P + specificity * (1 - specificity) / N) : 1;
  return { trained: true, samples: data.length, logistic, regression, baseRate: baseRate * 100,
    validationSamples: xs.length - trainCount, validationBalancedAccuracy: ba * 100,
    validationLowerBound: (ba - 1.645 * se) * 100 };
}

function pickObservation(list, entryAt, due, windowStart, windowEnd) {
  let best = null, bestDist = Infinity;
  let lastAfterEntry = null;
  for (const obs of list) {
    const t = num(obs.seen_at);
    const price = num(obs.price);
    if (t < entryAt || price <= 0) continue;
    lastAfterEntry = obs;
    if (t < windowStart || t > windowEnd) continue;
    const dist = Math.abs(t - due);
    if (dist < bestDist) {
      best = obs;
      bestDist = dist;
    }
  }
  return { inWindow: best, lastAfterEntry };
}

export async function pendingSampleAddresses(db, limit = 200) {
  const r = await db.prepare(`
    SELECT address FROM prediction_samples
    WHERE short_status = 'pending' OR medium_status = 'pending' OR long_status = 'pending'
    GROUP BY address ORDER BY MIN(entry_at) ASC LIMIT ?
  `).bind(limit).all();
  return (r.results || []).map(row => row.address).filter(Boolean);
}

async function resolvePendingForecasts(db, now) {
  const pending = await db.prepare(`
    SELECT id, address, entry_at, entry_price,
      short_due, medium_due, long_due,
      short_status, medium_status, long_status
    FROM prediction_samples
    WHERE (short_status = 'pending' AND short_due <= ?)
       OR (medium_status = 'pending' AND medium_due <= ?)
       OR (long_status = 'pending' AND long_due <= ?)
    ORDER BY entry_at ASC
    LIMIT 200
  `).bind(now, now, now).all();
  const rows = pending.results || [];
  if (!rows.length) return;

  const addresses = [...new Set(rows.map(row => row.address).filter(Boolean))];
  const minEntry = Math.min(...rows.map(row => num(row.entry_at)));
  const obsByAddress = new Map();

  for (let i = 0; i < addresses.length; i += 40) {
    const group = addresses.slice(i, i + 40);
    const placeholders = group.map(() => "?").join(",");
    const result = await db.prepare(`
      SELECT address, seen_at, price
      FROM observations
      WHERE address IN (${placeholders}) AND seen_at >= ? AND price > 0
      ORDER BY seen_at ASC
    `).bind(...group, minEntry).all();
    for (const obs of result.results || []) {
      const list = obsByAddress.get(obs.address) || [];
      list.push(obs);
      obsByAddress.set(obs.address, list);
    }
  }

  const stmts = [];
  for (const row of rows) {
    const list = obsByAddress.get(row.address) || [];
    const sets = [];
    const values = [];
    for (const h of FORECAST_HORIZONS) {
      if (row[`${h.key}_status`] !== "pending") continue;
      const due = num(row[`${h.key}_due`]);
      if (now < due) continue;
      const picked = pickObservation(list, num(row.entry_at), due, due - h.earlyMs, due + h.tolerance);
      let exitPrice = num(picked.inWindow?.price);
      if (exitPrice <= 0) {
        if (now < due + h.expireGrace) continue;
        // Sem observacao perto do prazo: o token deixou de aparecer (morto/retirado). Descartar estes casos
        // deixa so os sobreviventes no treino e infla as probabilidades; contam como perda de -80%
        // (o minimo ja usado pelo modelo). Se ainda ha dados recentes, usa-se o ultimo preco conhecido.
        const lastPrice = num(picked.lastAfterEntry?.price);
        const lastAt = num(picked.lastAfterEntry?.seen_at);
        const stale = lastPrice <= 0 || lastAt < due - h.ms * 0.5;
        exitPrice = stale ? num(row.entry_price) * 0.2 : lastPrice;
        if (exitPrice <= 0) { sets.push(`${h.key}_status = 'expired'`); continue; }
      }
      sets.push(`${h.key}_exit = ?`);
      sets.push(`${h.key}_status = 'complete'`);
      values.push(exitPrice);
    }
    if (!sets.length) continue;
    stmts.push(db.prepare(`UPDATE prediction_samples SET ${sets.join(", ")} WHERE id = ?`).bind(...values, row.id));
  }
  for (let i = 0; i < stmts.length; i += 80) await db.batch(stmts.slice(i, i + 80));
}

export async function attachForecasts(db, tokens) {
  const now = Date.now();
  if (!predictionModelCache.models || now - predictionModelCache.trainedAt > 300000) {
    const models = {};
    const info = await db.prepare("PRAGMA table_info(prediction_samples)").all();
    const columns = new Set((info.results || []).map(column => column.name));
    for (const h of FORECAST_HORIZONS) {
      const exitColumn = columns.has(`${h.key}_exit`) ? `${h.key}_exit` :
        (columns.has("exit_price") ? "exit_price" : null);
      if (!exitColumn) {
        models[h.key] = { trained: false, samples: 0 };
        continue;
      }
      const r = await db.prepare(`SELECT * FROM (
        SELECT entry_price, ${exitColumn} AS exit_price, entry_score, entry_risk, change5m, change1h,
          liquidity, volume1h, buy_sell, age_min, acceleration, entry_mcap, entry_at
        FROM prediction_samples WHERE ${h.key}_status = 'complete'
        ORDER BY entry_at DESC LIMIT 1200
      ) ORDER BY entry_at ASC`).all();
      models[h.key] = trainHorizon(r.results || []);
    }
    predictionModelCache = { trainedAt: now, models };
  }
  for (const token of tokens) {
    const f = modelFeatures(token);
    const applicable = num(token?.adjustedScore) >= 45;
    token.forecasts = {};
    for (const h of FORECAST_HORIZONS) {
      const model = predictionModelCache.models[h.key];
      if (!model?.trained) {
        token.forecasts[h.key] = { horizon: h.label, ready: false, applicable, samples: model?.samples || 0, minimumSamples: 100 };
        continue;
      }
      const dot = weights => weights.reduce((sum, w, i) => sum + w * f[i], 0);
      const z = Math.max(-20, Math.min(20, dot(model.logistic)));
      token.forecasts[h.key] = { horizon: h.label, ready: true, applicable, samples: model.samples,
        validated: model.validationSamples >= MIN_VALIDATION_SAMPLES && model.validationBalancedAccuracy >= 60 && model.validationLowerBound > 50,
        validationBalancedAccuracy: Math.round(model.validationBalancedAccuracy),
        validationSamples: model.validationSamples,
        probabilityUp: Math.round(100 / (1 + Math.exp(-z))),
        expectedReturnPct: Math.round(Math.max(-80, Math.min(200, dot(model.regression) * 100)) * 10) / 10 };
    }
  }
}

export async function saveForecastSamples(db, tokens, now, pendingAddresses = null) {
  const day = new Date(now).toISOString().slice(0, 10);
  const pending = pendingAddresses ? new Set(pendingAddresses) : null;
  const stmts = [];
  for (const x of tokens) {
    if (!x?.address || num(x.priceUsd) <= 0) continue;
    const price = num(x.priceUsd);
    if (!pending || pending.has(x.address)) {
      const sets = [], values = [];
      for (const h of FORECAST_HORIZONS) {
        const k = h.key;
        // Captura so a partir do prazo (antes usava due - earlyMs e encurtava o horizonte real).
        sets.push(`${k}_exit=CASE WHEN ${k}_status='pending' AND ? >= ${k}_due AND ? <= ${k}_due + ${h.tolerance} AND ? > 0 THEN ? ELSE ${k}_exit END`);
        sets.push(`${k}_status=CASE WHEN ${k}_status='pending' AND ? >= ${k}_due AND ? <= ${k}_due + ${h.tolerance} AND ? > 0 THEN 'complete' ELSE ${k}_status END`);
        values.push(now, now, price, price, now, now, price);
      }
      stmts.push(db.prepare(`UPDATE prediction_samples SET ${sets.join(", ")} WHERE address=?`).bind(...values, x.address));
    }
    if (num(x.adjustedScore) < 45) continue;
    stmts.push(db.prepare(`INSERT OR IGNORE INTO prediction_samples (
      address,day_key,entry_at,entry_price,entry_score,entry_risk,change5m,change1h,
      liquidity,volume1h,buy_sell,age_min,acceleration,entry_mcap,short_due,medium_due,long_due
    ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).bind(
      x.address, day, now, price, num(x.adjustedScore), num(x.risk), num(x.change5m),
      num(x.change1h), num(x.liquidity), num(x.volume1h), num(x.buySell),
      x.ageMin == null ? null : num(x.ageMin),
      num(x.acceleration), num(x.marketCap), now + 3600000, now + 86400000, now + 604800000
    ));
  }
  for (let i = 0; i < stmts.length; i += 80) await db.batch(stmts.slice(i, i + 80));
  await resolvePendingForecasts(db, now);
}
