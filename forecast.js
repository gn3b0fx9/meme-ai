/* Supervised forecasts learn from observed outcomes; no forecast is presented
   until there are enough completed examples for that horizon. */
const FORECAST_HORIZONS = [
  { key: "short", label: "1h", ms: 3600000, tolerance: 900000 },
  { key: "medium", label: "24h", ms: 86400000, tolerance: 21600000 },
  { key: "long", label: "7d", ms: 604800000, tolerance: 151200000 }
];
let predictionModelCache = { trainedAt: 0, models: null };
const num = (v, fallback = 0) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
};

function modelFeatures(x) {
  const c = (v, lo, hi) => Math.max(lo, Math.min(hi, num(v)));
  return [1, c(x?.adjustedScore, 0, 100) / 100, c(x?.risk, 0, 100) / 100,
    c(x?.change5m, -50, 50) / 50, c(x?.change1h, -100, 100) / 100,
    c(Math.log10(Math.max(1, num(x?.liquidity))), 0, 8) / 8,
    c(Math.log10(Math.max(1, num(x?.volume1h))), 0, 9) / 9,
    c(x?.buySell, 0, 5) / 5, c(x?.ageMin, 0, 10080) / 10080,
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

export async function attachForecasts(db, tokens) {
  const now = Date.now();
  if (!predictionModelCache.models || now - predictionModelCache.trainedAt > 300000) {
    const models = {};
    for (const h of FORECAST_HORIZONS) {
      const r = await db.prepare(`SELECT * FROM (
        SELECT entry_price, exit_price, entry_score, entry_risk, change5m, change1h,
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
    token.forecasts = {};
    for (const h of FORECAST_HORIZONS) {
      const model = predictionModelCache.models[h.key];
      if (!model?.trained) {
        token.forecasts[h.key] = { horizon: h.label, ready: false, samples: model?.samples || 0, minimumSamples: 100 };
        continue;
      }
      const dot = weights => weights.reduce((sum, w, i) => sum + w * f[i], 0);
      const z = Math.max(-20, Math.min(20, dot(model.logistic)));
      token.forecasts[h.key] = { horizon: h.label, ready: true, samples: model.samples,
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
    if (!x?.address) continue;
    const sets = [], values = [];
    for (const h of FORECAST_HORIZONS) {
      const k = h.key;
      sets.push(`${k}_exit=CASE WHEN ${k}_status='pending' AND ${k}_due<=? AND ?<=${k}_due+? THEN ? ELSE ${k}_exit END`);
      sets.push(`${k}_status=CASE WHEN ${k}_status='pending' AND ${k}_due<=? AND ?<=${k}_due+? THEN 'complete' WHEN ${k}_status='pending' AND ?>${k}_due+? THEN 'expired' ELSE ${k}_status END`);
      values.push(now, now, h.tolerance, num(x.priceUsd), now, now, h.tolerance, now, h.tolerance);
    }
    await db.prepare(`UPDATE prediction_samples SET ${sets.join(", ")} WHERE address=?`).bind(...values, x.address).run();
    if (num(x.adjustedScore) < 45 || num(x.priceUsd) <= 0) continue;
    await db.prepare(`INSERT OR IGNORE INTO prediction_samples (
      address,day_key,entry_at,entry_price,entry_score,entry_risk,change5m,change1h,
      liquidity,volume1h,buy_sell,age_min,acceleration,short_due,medium_due,long_due
    ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).bind(
      x.address, day, now, num(x.priceUsd), num(x.adjustedScore), num(x.risk), num(x.change5m),
      num(x.change1h), num(x.liquidity), num(x.volume1h), num(x.buySell), num(x.ageMin),
      num(x.acceleration), now + 3600000, now + 86400000, now + 604800000
    ).run();
  }
}
