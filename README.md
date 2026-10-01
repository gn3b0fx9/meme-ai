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

Forecast training and outcome capture live in `forecast.js`. Each token contributes at most one training example per UTC day. A forecast is withheld until its horizon has at least 100 completed examples. Models train on the oldest 80% of up to 1,200 recent examples and are checked against the newest 20%. An in-app signal is shown only when the holdout has at least 40 examples, its balanced accuracy is at least 60% **and** the lower 95% confidence bound is above 50% (so luck on a small holdout does not qualify), the estimated chance of a positive return is at least 65%, expected return is positive, the existing liquidity, risk, and score filters pass, and an automatic RugCheck check (top 8 candidates per scan) found no danger-level risk or active mint/freeze authority. If RugCheck is unavailable the token is not shown as a signal.

Tokens whose price can no longer be observed when a horizon expires (delisted or dead) are counted as an -80% outcome instead of being dropped, to avoid training only on survivors. Tokens with pending forecast samples are always re-scanned so their outcomes can be captured.

The first forecasts are not available immediately after deployment. Outcomes are collected from later scanner observations, so the 1-hour, 24-hour, and 7-day models mature on different schedules. Tokens that disappear from discovery may not receive a future price observation and therefore will not count as completed training examples.

Forecasts and signals are statistical estimates from historical scanner observations. They do not guarantee returns or execute trades.

## Solana token risk checks

Token cards can request an on-demand risk summary from RugCheck. The card shows the provider's reported risks, mint/freeze-authority warnings, token program/type, and reported locked-liquidity percentage. Successful reports are cached in the Worker isolate for up to 10 minutes.

This third-party summary does not simulate a sell transaction. A missing warning is not proof that an authority is disabled, unavailable liquidity data is not a safety result, and no report can guarantee that a token is safe from a rug pull.

## Notifications

Two layers, both reliable only for what they can see:

1. **Telegram (recommended, works with the app closed).** The 5-minute cron scans, runs forecasts and the RugCheck gate, then messages you about (a) validated AI signals and (b) "strong candidates" (scanner alert, risk <= 40, liquidity >= $25K, score >= 60, RugCheck clean) which are labelled as *not* AI-validated. Each token is notified at most once per 12h.
   Setup: create a bot with @BotFather, send it a message, get your chat id (e.g. via @userinfobot), then:
   `wrangler secret put TELEGRAM_BOT_TOKEN` and `wrangler secret put TELEGRAM_CHAT_ID`.
   Use the **Testar** button in the Scanner tab (or `POST /api/notify-test`) to confirm.
2. **Browser notifications (bell icon).** Only fire while the page is open. On iPhone they require adding the page to the Home Screen.

`GET /api/health` reports when the cron last ran, how many tokens it saw, and the last error. The Scanner tab shows it.
