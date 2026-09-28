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
  return [1, c(x?.adjustedScore, 0, 100) / 100, c(x?.risk, 0, 100) / 100,
    c(x?.change5m, -50, 50) / 50, c(x?.change1h, -100, 100) / 100,
    c(Math.log10(Math.max(1, num(x?.liquidity))), 0, 8) / 8,
    c(Math.log10(Math.max(1, num(x?.volume1h))), 0, 9) / 9,
    c(x?.buySell, 0, 5) / 5, c(age, 0, 10080) / 10080,
    c(x?.acceleration, 0, 20) / 20];
}

function trainHorizon(rows) {
  const data = rows.filter(x => num(x.entry_price) > 0 && num(x.exit_price) > 0);
  if (data.length < 100) return { trained: false, samples: data.length };
  const xs = data.map(x => modelFeatures({ adjustedScore: x.entry_score, risk: x.entry_risk,
    change5m: x.change5m, change1h: x.change1h, liquidity: x.liquidity,
    volume1h: x.volume1h, buySell: x.buy_sell, ageMin: x.age_min, acceleration: x.acceleration }));
  const returns = data.map(x => Math.max(-80, Math.min(200,
    (num(x.exit_price) / num(x.entry_price) - 1) * 100)));
  const labels = returns.map(y => y > 0 ? 1 : 0);
  const trainCount = Math.max(1, Math.floor(data.length * 0.8));
  let logistic = Array(10).fill(0), regression = Array(10).fill(0);
  for (let epoch = 0; epoch < 20; epoch++) {
    const g = Array(10).fill(0), rg = Array(10).fill(0);
    for (let i = 0; i < trainCount; i++) {
      const z = Math.max(-20, Math.min(20, logistic.reduce((s, w, j) => s + w * xs[i][j], 0)));
      const probability = 1 / (1 + Math.exp(-z));
      const estimate = regression.reduce((s, w, j) => s + w * xs[i][j], 0);
      for (let j = 0; j < 10; j++) {
        g[j] += (probability - labels[i]) * xs[i][j];
        rg[j] += (estimate - returns[i] / 100) * xs[i][j];
      }
    }
    for (let j = 0; j < 10; j++) {
      logistic[j] -= 0.04 * (g[j] / trainCount + 0.0005 * logistic[j]);
      regression[j] -= 0.04 * (rg[j] / trainCount + 0.0005 * regression[j]);
    }
  }
  let tp = 0, tn = 0, fp = 0, fn = 0;
  for (let i = trainCount; i < xs.length; i++) {
    const z = Math.max(-20, Math.min(20, logistic.reduce((s, w, j) => s + w * xs[i][j], 0)));
    const predicted = 1 / (1 + Math.exp(-z)) >= 0.5, actual = labels[i] === 1;
    if (predicted && actual) tp++; else if (!predicted && !actual) tn++; else if (predicted) fp++; else fn++;
  }
  const sensitivity = tp + fn ? tp / (tp + fn) : 0;
  const specificity = tn + fp ? tn / (tn + fp) : 0;
  return { trained: true, samples: data.length, logistic, regression,
    validationSamples: xs.length - trainCount, validationBalancedAccuracy: (sensitivity + specificity) / 2 * 100 };
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

async function resolvePendingForecasts(db, now) {
  const pending = await db.prepare(`
    SELECT id, address, entry_at,
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
        exitPrice = num(picked.lastAfterEntry?.price);
        if (exitPrice <= 0) {
          sets.push(`${h.key}_status = 'expired'`);
          continue;
        }
      }
      sets.push(`${h.key}_exit = ?`);
      sets.push(`${h.key}_status = 'complete'`);
      values.push(exitPrice);
    }
    if (!sets.length) continue;
    await db.prepare(`UPDATE prediction_samples SET ${sets.join(", ")} WHERE id = ?`)
      .bind(...values, row.id).run();
  }
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
          liquidity, volume1h, buy_sell, age_min, acceleration, entry_at
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
        validated: model.validationSamples >= 20 && model.validationBalancedAccuracy >= 60,
        validationBalancedAccuracy: Math.round(model.validationBalancedAccuracy),
        validationSamples: model.validationSamples,
        probabilityUp: Math.round(100 / (1 + Math.exp(-z))),
        expectedReturnPct: Math.round(Math.max(-80, Math.min(200, dot(model.regression) * 100)) * 10) / 10 };
    }
  }
}

export async function saveForecastSamples(db, tokens, now) {
  const day = new Date(now).toISOString().slice(0, 10);
  for (const x of tokens) {
    if (!x?.address || num(x.priceUsd) <= 0) continue;
    const price = num(x.priceUsd);
    const sets = [], values = [];
    for (const h of FORECAST_HORIZONS) {
      const k = h.key;
      sets.push(`${k}_exit=CASE WHEN ${k}_status='pending' AND ? >= ${k}_due - ${h.earlyMs} AND ? <= ${k}_due + ${h.tolerance} AND ? > 0 THEN ? ELSE ${k}_exit END`);
      sets.push(`${k}_status=CASE WHEN ${k}_status='pending' AND ? >= ${k}_due - ${h.earlyMs} AND ? <= ${k}_due + ${h.tolerance} AND ? > 0 THEN 'complete' ELSE ${k}_status END`);
      values.push(now, now, price, price, now, now, price);
    }
    await db.prepare(`UPDATE prediction_samples SET ${sets.join(", ")} WHERE address=?`).bind(...values, x.address).run();
    if (num(x.adjustedScore) < 45) continue;
    await db.prepare(`INSERT OR IGNORE INTO prediction_samples (
      address,day_key,entry_at,entry_price,entry_score,entry_risk,change5m,change1h,
      liquidity,volume1h,buy_sell,age_min,acceleration,short_due,medium_due,long_due
    ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).bind(
      x.address, day, now, price, num(x.adjustedScore), num(x.risk), num(x.change5m),
      num(x.change1h), num(x.liquidity), num(x.volume1h), num(x.buySell),
      x.ageMin == null ? null : num(x.ageMin),
      num(x.acceleration), now + 3600000, now + 86400000, now + 604800000
    ).run();
  }
  await resolvePendingForecasts(db, now);
}
