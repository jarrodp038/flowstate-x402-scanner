/**
 * ╔══════════════════════════════════════════════════════════╗
 * ║   GRADUATION SNIPER BOT v0.1.0                          ║
 * ║   Pump.fun bonding curve graduation sniper              ║
 * ║                                                          ║
 * ║   Strategy:                                              ║
 * ║   1. Monitor ALL Pump.fun bonding curves in real-time   ║
 * ║   2. Buy at 95-98% completion (graduation is imminent)  ║
 * ║   3. Hold through graduation to Raydium/PumpSwap        ║
 * ║   4. Auto-sell with trailing stop for max profit        ║
 * ║                                                          ║
 * ║   DEFAULT: TEST_MODE=true — no real funds at risk       ║
 * ║   Set TEST_MODE=false in .env only when ready to go live║
 * ╚══════════════════════════════════════════════════════════╝
 */

import dotenv from 'dotenv';
dotenv.config();

import { Connection } from '@solana/web3.js';
import { config, validateConfig }   from './src/config.js';
import { GraduationMonitor }         from './src/monitor.js';
import { Trader }                    from './src/trader.js';
import { PositionManager }           from './src/position-manager.js';
import { Dashboard }                 from './src/dashboard.js';
import { estimateTokensFromBuy }     from './src/bonding-curve.js';

// ── Boot ──────────────────────────────────────────────────────────────────────
async function main() {
  validateConfig();

  const connection      = new Connection(config.solanaRpcUrl, 'confirmed');
  const monitor         = new GraduationMonitor(connection, config);
  const trader          = new Trader(config);
  const positionManager = new PositionManager(config);
  const dashboard       = new Dashboard(positionManager, monitor, config);

  // Pipe monitor log events to dashboard
  monitor.on('log', msg => dashboard.addEvent(msg));

  // ── Entry signal: token hit 95-98% completion ────────────────────────────
  monitor.on('entry-signal', async ({ mint, completionPct, curve }) => {
    // Don't open a second position on the same mint
    if (positionManager.positions.has(mint)) return;

    const check = positionManager.canOpenPosition();
    if (!check.allowed) {
      dashboard.addEvent(`SKIP ${_short(mint)} — ${check.reason}`);
      return;
    }

    dashboard.addEvent(
      `${config.testMode ? '[SIM] ' : ''}BUYING ${_short(mint)} @ ${completionPct.toFixed(1)}% completion`
    );

    try {
      const result = await trader.buy(mint, config.buyAmountSol, curve);

      // Estimate tokens received (for paper-trading P&L tracking)
      const tokensReceived = result.tokensEstimate
        ?? estimateTokensFromBuy(curve, config.buyAmountSol);

      positionManager.openPosition(mint, {
        solSpent:            config.buyAmountSol,
        tokensReceived,
        entryCompletionPct:  completionPct,
        signature:           result.signature,
        simulated:           result.simulated,
      });

      const tag = result.simulated ? '[SIM] ' : '';
      dashboard.addEvent(
        `${tag}ENTRY ${_short(mint)} — ${config.buyAmountSol} SOL — sig: ${result.signature.slice(0,12)}...`
      );
    } catch (err) {
      dashboard.addEvent(`BUY FAILED ${_short(mint)}: ${err.message}`);
    }
  });

  // ── Graduation: token migrated to PumpSwap/Raydium ──────────────────────
  monitor.on('graduation', async ({ mint }) => {
    positionManager.markGraduated(mint);

    const tag = positionManager.positions.get(mint)?.simulated ? '[SIM] ' : '';
    dashboard.addEvent(`${tag}GRADUATED ${_short(mint)} — trailing stop now active`);

    // Give the Raydium/PumpSwap pool a few seconds to initialize before
    // price ticks start influencing the trailing stop
    const pos = positionManager.positions.get(mint);
    if (pos) {
      await new Promise(r => setTimeout(r, config.graduationDelayMs));
      dashboard.addEvent(`${_short(mint)} — pool ready, trailing stop armed`);
    }
  });

  // ── Price tick: use to update value & check stop-loss triggers ───────────
  monitor.on('price-tick', async ({ mint, currentValueSol: pricePerToken }) => {
    const pos = positionManager.positions.get(mint);
    if (!pos) return;

    // pricePerToken is SOL per single token (raw units from trade event)
    // currentValueSol = pricePerToken * tokensHeld
    let currentValueSol = null;

    if (pricePerToken && pos.tokensReceived && pos.tokensReceived > 0n) {
      currentValueSol = pricePerToken * Number(pos.tokensReceived);
    }

    if (!currentValueSol) return;

    const exit = positionManager.updateValueSol(mint, currentValueSol);
    if (!exit) return;

    // ── Triggered: execute sell ──────────────────────────────────────────
    dashboard.addEvent(
      `${pos.simulated ? '[SIM] ' : ''}SELL TRIGGERED ${_short(mint)} — ${exit.reason}`
    );

    try {
      const result = await trader.sell(mint, pos.tokensReceived, pos.graduated ? null : pos.curve);

      // Estimate SOL received for P&L tracking
      const solReceived = result.solEstimate ?? currentValueSol * (1 - 0.0025);

      const closed = positionManager.closePosition(mint, {
        solReceived,
        signature: result.signature,
      });

      if (closed) {
        const sign   = closed.pnl >= 0 ? '+' : '';
        const pnlStr = `${sign}${closed.pnl.toFixed(4)}`;
        dashboard.addEvent(
          `${pos.simulated ? '[SIM] ' : ''}CLOSED ${_short(mint)} — P&L: ${pnlStr} SOL (${closed.pnlPct.toFixed(1)}%) — ${exit.reason}`
        );
      }
    } catch (err) {
      dashboard.addEvent(`SELL FAILED ${_short(mint)}: ${err.message}`);
    }
  });

  // ── Start everything ─────────────────────────────────────────────────────
  dashboard.start(config.dashboardRefreshMs);

  console.log('\nStarting Graduation Sniper Bot...');
  console.log(`Mode: ${config.testMode ? 'TEST (paper trading)' : 'LIVE (real funds)'}`);
  console.log(`RPC:  ${config.solanaRpcUrl}`);
  console.log(`Buy:  ${config.buyAmountSol} SOL per snipe`);
  console.log(`Entry threshold: ${config.entryThresholdPct}%`);
  console.log('');

  await monitor.start();

  // ── Graceful shutdown ─────────────────────────────────────────────────────
  async function shutdown(signal) {
    dashboard.addEvent(`Shutdown signal: ${signal}`);

    // Give dashboard one final render
    dashboard.render();
    dashboard.stop();
    await monitor.stop();

    const stats = positionManager.stats;
    console.log('\n\n── FINAL SESSION STATS ──────────────────────────────');
    console.log(`Closed trades : ${stats.closedTrades}`);
    console.log(`Wins / Losses : ${stats.wins} / ${stats.losses}  (${stats.winRate}% win rate)`);
    console.log(`Realized P&L  : ${stats.realizedPnl >= 0 ? '+' : ''}${stats.realizedPnl.toFixed(6)} SOL`);
    console.log(`Open at close : ${stats.openPositions}`);
    console.log('─────────────────────────────────────────────────────\n');
    process.exit(0);
  }

  process.on('SIGINT', () => shutdown('SIGINT'));
  // SIGTERM not available on Windows — wrap to avoid startup error
  try { process.on('SIGTERM', () => shutdown('SIGTERM')); } catch {}

  process.on('unhandledRejection', (reason) => {
    dashboard.addEvent(`Unhandled error: ${String(reason).slice(0, 80)}`);
  });
}

function _short(mint) {
  if (!mint) return '????...????';
  return `${mint.slice(0, 6)}...${mint.slice(-4)}`;
}

main().catch(err => {
  console.error('Fatal startup error:', err.message);
  process.exit(1);
});
