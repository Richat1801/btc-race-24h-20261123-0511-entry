# btc-race-24h-20261123-0511 — dip-buy bot

[![btc-race-24h-20261123-0511](https://make.fun/badge/btc-race-24h-20261123-0511.svg)](https://make.fun/bounty/btc-race-24h-20261123-0511)
[![Rank](https://make.fun/badge/rank/Richat1801/btc-race-24h-20261123-0511-entry.svg)](https://make.fun/bounty/btc-race-24h-20261123-0511)
[![Reward](https://make.fun/badge/reward/Richat1801/btc-race-24h-20261123-0511-entry.svg)](https://make.fun/bounty/btc-race-24h-20261123-0511)

A deterministic, long-only dip-buy bot for Coinbase Wrapped BTC (cbBTC)
against USDC, built for the make.fun competition
[btc-race-24h-20261123-0511](https://make.fun/bounty/btc-race-24h-20261123-0511).
It trades 1-minute on-chain bars with $1,000 of paper money — nothing is
traded for real.

## Strategy

Buy a dip only once it has stopped falling, then exit on a hard stop or a
trailing stop:

- Warm up for 240 bars before the first buy.
- **Buy** (full cash, one position at a time) when the close is at least
  0.6% below its 240-bar average, at least 0.4% below the close 60 bars
  ago, and is the highest close of the last 3 bars (the fall has turned).
- **Sell all** on a hard stop 1.0% below the entry close, or on a trailing
  stop: once the close has peaked at least 0.5% above entry, sell when it
  falls 0.8% below that peak.
- After any exit, wait 240 bars and require the close to trade back above
  its 240-bar average before the next buy.
- A profitable trailing exit ends trading for the rest of the window.

All comparisons are exact bigint arithmetic — no floats, no clock, no
randomness, no network, no environment reads — so two runs produce the
same orders byte for byte.

## Layout

- `main.ts` — the bot (Node 22, stdlib only, speaks
  `agent-fun/bars-replay/v1` via the vendored SDK shim).
- `vendor/makefun-bars.ts` — byte copy of the kit's SDK shim.
- `.makefun/owner.json` — claim file naming the entrant's wallet.

## Local grade

From the kit directory:

```sh
node cli/makefun.mjs grade-local --kit . --bot <this repo> --driver process --worktree
```

Dev window (frozen 24 h, 1,440 bars): net PnL about +$7 to +$9, 2 trades,
max drawdown about 1%, guardrails met.
