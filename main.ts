// Dip-buy bot for cbBTC (CBBTC) on the make.fun bars-replay protocol.
//
// Idea in one line: only buy a dip that has already stopped falling, then
// get out on a hard stop or a trailing stop, and stop trading after the
// first profitable trailing exit.
//
// The bot is fully deterministic: it reads nothing but the bars the harness
// sends it, keeps all of its state in memory, and does every comparison in
// exact bigint arithmetic (prices are integers, so a "0.6% below" test is a
// cross-multiplication, never a float).
//
// Rules, in bar order:
//   * Warm up for 240 bars before the first buy can fire.
//   * Buy (full cash, one position at a time) when all three hold:
//       - the close sits at least 0.6% below its 240-bar average,
//       - the close sits at least 0.4% below the close 60 bars ago, and
//       - the close is the highest close of the last 3 bars, i.e. the
//         fall has stopped and the price has just turned back up.
//   * Sell everything when either exit fires:
//       - hard stop: the close drops 1.0% below the entry close, or
//       - trailing stop: once the close has peaked at least 0.5% above
//         the entry close, sell when it falls 0.8% below that peak.
//   * After any exit, wait 240 bars and require the close to trade back
//     above its 240-bar average before the next buy may fire.
//   * A trailing exit that sells above the entry close ends trading for
//     the rest of the window.

import { runBars } from './vendor/makefun-bars.ts';
import type { BarsState } from './vendor/makefun-bars.ts';
import type { Batch } from './vendor/makefun-bars.ts';
import type { OrderInput } from './vendor/makefun-bars.ts';

const SYMBOL = 'CBBTC';
const WARMUP_BARS = 240;
const LOOKBACK_BARS = 60;
const COOLDOWN_BARS = 240;
const MAX_SLIPPAGE_BPS = 10000;

// Thresholds, kept as integer ratios so every test below is exact:
//   0.6% below the average  -> close * 1000 <= avg * 994
//   0.4% below 60 bars ago  -> close * 1000 <= then * 996
//   1.0% hard stop          -> close * 100  <= entry * 99
//   0.5% peak for trailing   -> peak * 200   >= entry * 201
//   0.8% fall off the peak   -> close * 1000 <= peak * 992
const DIP_BPS = 994n;
const MOMENTUM_BPS = 996n;
const STOP_BPS = 99n;
const PEAK_BPS_NUM = 201n;
const TRAIL_BPS = 992n;

const closes: bigint[] = [];
let entryClose: bigint | null = null;
let peakClose: bigint | null = null;
let awaitingFill = false;
let done = false;
let barsSinceExit: number | null = null;

function sma240(): bigint {
  let sum = 0n;
  for (let i = closes.length - WARMUP_BARS; i < closes.length; i++) sum += closes[i]!;
  return sum;
}

function onBatch(state: BarsState, _batch: Batch): OrderInput[] {
  if (state.warmingUp) return [];
  const close = state.close(SYMBOL);
  if (close === null) return [];
  closes.push(close);

  const held = state.positions.get(SYMBOL);
  const qty = held?.qty ?? 0n;

  // A buy decided on the previous bar fills at this bar's open, so the
  // position only shows up one batch later. While waiting, do nothing; if
  // it never appears, the buy was rejected and the entry is abandoned.
  if (awaitingFill) {
    if (qty > 0n) {
      awaitingFill = false;
    } else {
      entryClose = null;
      peakClose = null;
      awaitingFill = false;
      return [];
    }
  }

  if (qty > 0n && entryClose !== null) {
    // In a position: maintain the running peak and check both exits.
    if (peakClose === null || close > peakClose) peakClose = close;
    const peak = peakClose;

    const hitStop = close * 100n <= entryClose * STOP_BPS;
    const peakHighEnough = peak * 200n >= entryClose * PEAK_BPS_NUM;
    const hitTrail = peakHighEnough && close * 1000n <= peak * TRAIL_BPS;

    if (hitStop || hitTrail) {
      // A trailing exit above the entry close is a win: stop for the window.
      if (hitTrail && close > entryClose) done = true;
      entryClose = null;
      peakClose = null;
      barsSinceExit = 0;
      return [{ side: 'sell', symbol: SYMBOL, qty, max_slippage_bps: MAX_SLIPPAGE_BPS }];
    }
    return [];
  }

  // Flat: no new buy after a profitable trailing exit.
  if (done) return [];
  if (barsSinceExit !== null) barsSinceExit += 1;

  // Need a full 240-bar average (and a close 60 bars back) before buying.
  if (closes.length < WARMUP_BARS) return [];
  const n = closes.length;
  const sum240 = sma240();

  // After an exit, the 240-bar wait plus a close back above the average.
  if (barsSinceExit !== null) {
    if (barsSinceExit < COOLDOWN_BARS) return [];
    if (close * BigInt(WARMUP_BARS) <= sum240) return [];
  }

  // Dip: at least 0.6% below the 240-bar average.
  const belowAverage = close * BigInt(WARMUP_BARS) * 1000n <= sum240 * DIP_BPS;
  // Weakness: at least 0.4% below the close 60 bars ago.
  const close60Ago = closes[n - 1 - LOOKBACK_BARS]!;
  const belowThen = close * 1000n <= close60Ago * MOMENTUM_BPS;
  // V-confirm: this close is the highest of the last 3 closes.
  const vConfirm = close >= closes[n - 2]! && close >= closes[n - 3]!;

  if (!belowAverage || !belowThen || !vConfirm) return [];
  if (state.cash <= 0n) return [];

  entryClose = close;
  peakClose = close;
  awaitingFill = true;
  return [{ side: 'buy', symbol: SYMBOL, notional_quote_units: state.cash, max_slippage_bps: MAX_SLIPPAGE_BPS }];
}

await runBars({ onBatch });
