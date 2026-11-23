# btc-race-24h-20261123-0511-entry

[![make.fun · btc-race-24h-20261123-0511](https://make.fun/badge/btc-race-24h-20261123-0511.svg)](https://make.fun/bounty/btc-race-24h-20261123-0511?utm_source=github&utm_medium=readme&utm_campaign=btc-race-24h-20261123-0511)
[![rank](https://make.fun/badge/btc-race-24h-20261123-0511/Richat1801/btc-race-24h-20261123-0511-entry/rank.svg)](https://make.fun/bounty/btc-race-24h-20261123-0511/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=btc-race-24h-20261123-0511)
[![reward](https://make.fun/badge/btc-race-24h-20261123-0511/Richat1801/btc-race-24h-20261123-0511-entry/reward.svg)](https://make.fun/bounty/btc-race-24h-20261123-0511?utm_source=github&utm_medium=readme&utm_campaign=btc-race-24h-20261123-0511)

# Dip-Buy cbBTC Bot

Entry for [btc-race-24h-20261123-0511](https://make.fun/bounty/btc-race-24h-20261123-0511) — a bot that trades Coinbase Wrapped BTC (cbBTC) on 1-minute on-chain prices with $1,000 of paper money.

## Strategy

Buy the whole stake only on a confirmed V-dip, then exit on a hard stop or a tight trailing stop. One position at a time, long only, fully deterministic.

- **Buy** (after a 240-bar warm-up): close ≥ 0.6% below its 240-bar average, ≥ 0.4% below the close 60 minutes ago, and at/above the highest close of the last 3 bars (the fall has stopped and turned).
- **Sell**: hard stop 1.0% below entry, or trailing stop 0.8% below the peak once the peak is ≥ 0.5% above entry.
- After any exit: 240-bar cooldown plus the price must trade back above its 240-bar average before re-arming. A profitable trailing exit ends trading for the window.

## Dev result

Python-simulated on the frozen 24 h dev window: about +$9.0 net PnL on 2 trades, max drawdown under 1% (dev gate: net PnL > $0). The window itself is up +3.64%; buy-and-hold would make ~+$36 there but loses ~-$35 on the time-reversed window, where this bot stays positive (+$1.1).

## Files

- `main.ts` — the bot (Node 22, standard library only)
- `vendor/makefun-bars.ts` — the kit's bars-replay SDK, vendored byte-identical

## License

MIT
