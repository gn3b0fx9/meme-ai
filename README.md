# Meme AI

Solana meme coin scanner and supervised forecasting dashboard running on Cloudflare Workers and D1.

## Project layout

- `index.js`: Worker routes, market scan, and D1 persistence.
- `forecast.js`: training examples, outcome labels, model fitting, and horizon estimates.
- `ui.js`: dashboard markup, styles, and browser interactions.
- `wrangler.toml`: Worker and D1 configuration.

## Forecasts

The dashboard learns three separate models from observed token prices:

- Short term: 1 hour
- Medium term: 24 hours
- Long term: 7 days

Forecast training and outcome capture live in `forecast.js`. Each token contributes at most one training example per UTC day. A forecast is withheld until its horizon has at least 100 completed examples. Models train on the oldest 80% of up to 1,200 recent examples and are checked against the newest 20%. An in-app signal is shown only when the holdout balanced accuracy is at least 60%, the estimated chance of a positive return is at least 65%, expected return is positive, and the existing liquidity, risk, and score filters pass.

The first forecasts are not available immediately after deployment. Outcomes are collected from later scanner observations, so the 1-hour, 24-hour, and 7-day models mature on different schedules. Tokens that disappear from discovery may not receive a future price observation and therefore will not count as completed training examples.

Forecasts and signals are statistical estimates from historical scanner observations. They do not guarantee returns or execute trades.
