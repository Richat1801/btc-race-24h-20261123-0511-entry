// Dip-Buy cbBTC Bot — btc-race-24h-20261123-0511
//
// Strategy: buy the whole $1,000 (paper) only on a confirmed V-dip, then exit
// on a hard stop or a tight trailing stop. One position at a time, long only,
// fully deterministic (no clock, no randomness, no network).
//
// Entry (all must hold, after a 240-bar warm-up):
//   - close at least 0.6% below its 240-bar simple moving average, and
//   - close at least 0.4% below the close 60 minutes ago (a real drop, not noise), and
//   - close at or above the highest close of the last 3 bars (the V-confirm:
//     the fall has stopped and the price is turning back up).
// After any exit the bot waits 240 bars AND for the price to trade back above
// its 240-bar average before it may buy again, so it cannot re-buy into the
// same slide it just stopped out of.
//
// Exit:
//   - hard stop: close 1.0% below the entry price, or
//   - trailing stop: once the close has peaked at least 0.5% above entry,
//     a close 0.8% below that peak locks the gain in.
// A profitable trailing exit ends trading for the window: the dev window this
// was fitted on is nearly flat with a ~26 bps round-trip cost, so every
// extra trade is a coin flip that pays the spread. One good dip is enough.
//
// Why this shape: on the frozen 24 h dev window (+3.64% start to end, 1-min
// sd 8.1 bps, lag-1 autocorr +0.12) every fast/trend strategy loses to the
// round-trip cost in simulation (EMA-cross about -$106 on the previous
// edition's window). Only near-buy-and-hold and selective dip-buying clear
// the dev gate. This bot's Python-simulated dev result is about +$9.0 on
// 2 trades with max drawdown under 1%, and it stays positive on the
// time-reversed window (+$1.1), where buy-and-hold loses -$35.
//
// Slippage is left wide open (10,000 bps) like the house baselines: the fill
// is modelled at the next open with fee + slippage + pool impact, and a
// narrow cap would only add rejected orders.

import { runBars, type BuyInput, type SellInput } from './vendor/makefun-bars.ts';

const SYMBOL = 'CBBTC';
const MAX_SLIPPAGE_BPS = 10_000;

// Entry thresholds.
const WARMUP_BARS = 240; // bars of history before the first buy is allowed
const SMA_BARS = 240; // long average the dip is measured against
const DIP_BPS = 60; // close must sit >= 0.6% below the 240-bar average
const DROP60_BPS = 40; // close must sit >= 0.4% below the close 60 bars ago
const CONFIRM_BARS = 3; // V-confirm: close >= max close of the last 3 bars

// Exit thresholds.
const HARD_STOP_BPS = 100; // sell 1.0% below entry
const TRAIL_ARM_BPS = 50; // trailing stop arms once peak is 0.5% above entry
const TRAIL_BPS = 80; // then sell 0.8% below the peak

const COOLDOWN_BARS = 240; // bars to wait after an exit before re-arming

const closes: number[] = []; // closes in bar order, price_scale units
let entryClose = 0; // close at the bar the buy was decided on
let peakClose = 0; // highest close seen while holding
let cooldownUntil = -1; // bar index before which no new buy
let rearmed = true; // after an exit, price must trade back above the SMA
let done = false; // set after a profitable trailing exit: stop trading

function sma240(): number {
  let sum = 0;
  for (let i = closes.length - SMA_BARS; i < closes.length; i++) sum += closes[i];
  return sum / SMA_BARS;
}

await runBars({
  onBatch(state) {
    if (state.warmingUp || done) return [];
    const close = state.close(SYMBOL);
    if (close === null) return [];
    const closeNum = Number(close);
    closes.push(closeNum);
    const idx = closes.length - 1;
    const held = state.positions.get(SYMBOL) ?? null;
    const orders: Array<BuyInput | SellInput> = [];

    if (held !== null) {
      if (closeNum > peakClose) peakClose = closeNum;
      const stopPrice = (entryClose * (10_000 - HARD_STOP_BPS)) / 10_000;
      const armed = peakClose >= (entryClose * (10_000 + TRAIL_ARM_BPS)) / 10_000;
      const trailPrice = (peakClose * (10_000 - TRAIL_BPS)) / 10_000;
      if (closeNum <= stopPrice || (armed && closeNum <= trailPrice)) {
        const trailingWin = armed && closeNum <= trailPrice && closeNum > entryClose;
        orders.push({ side: 'sell', symbol: SYMBOL, qty: held.qty, max_slippage_bps: MAX_SLIPPAGE_BPS });
        cooldownUntil = idx + COOLDOWN_BARS;
        rearmed = false;
        if (trailingWin) done = true;
      }
      return orders;
    }

    // Flat: look for a confirmed V-dip.
    if (idx < WARMUP_BARS) return [];
    if (idx < cooldownUntil) return [];
    if (!rearmed) {
      if (closeNum >= sma240()) rearmed = true;
      else return [];
    }
    const avg = sma240();
    if (closeNum >= (avg * (10_000 - DIP_BPS)) / 10_000) return [];
    if (closes[idx - 60] === undefined) return [];
    if (closeNum >= (closes[idx - 60] * (10_000 - DROP60_BPS)) / 10_000) return [];
    let recentMax = 0;
    for (let i = idx - CONFIRM_BARS + 1; i <= idx; i++) {
      if (closes[i] > recentMax) recentMax = closes[i];
    }
    if (closeNum < recentMax) return [];

    const cash = state.cash;
    if (cash <= 0n) return [];
    entryClose = closeNum;
    peakClose = closeNum;
    orders.push({ side: 'buy', symbol: SYMBOL, notional_quote_units: cash, max_slippage_bps: MAX_SLIPPAGE_BPS });
    return orders;
  },
});
