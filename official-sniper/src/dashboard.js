// ── Windows / terminal compatibility ─────────────────────────────────────────
// Enable ANSI on Windows 10+ (harmless on other platforms)
if (process.platform === 'win32') {
  try { process.stdout._handle?.setBlocking?.(true); } catch {}
}
const COLORS = process.stdout.hasColors?.() ?? (process.env.TERM !== 'dumb' && process.stdout.isTTY);

// ── ANSI helpers ──────────────────────────────────────────────────────────────
const C = COLORS ? {
  reset:  '\x1b[0m',
  bold:   '\x1b[1m',
  dim:    '\x1b[2m',
  green:  '\x1b[32m',
  red:    '\x1b[31m',
  yellow: '\x1b[33m',
  cyan:   '\x1b[36m',
  white:  '\x1b[37m',
  bgRed:  '\x1b[41m',
} : Object.fromEntries(
  ['reset','bold','dim','green','red','yellow','cyan','white','bgRed'].map(k => [k, ''])
);

const W = 64; // total box width (inner chars between ║)

const LINE  = '═'.repeat(W);

function box(content)  { return `║${content.padEnd(W)}║`; }
function divider()     { return `╠${LINE}╣`; }
function title(text)   { return `╔${LINE}╗\n${box(` ${text}`)}`; }
function footer()      { return `╚${LINE}╝`; }

function pnlColor(val) {
  if (val > 0) return `${C.green}+${val.toFixed(4)} SOL${C.reset}`;
  if (val < 0) return `${C.red}${val.toFixed(4)} SOL${C.reset}`;
  return `${C.dim}0.0000 SOL${C.reset}`;
}

function pct(val) {
  if (val === null || val === undefined) return `${C.dim}--${C.reset}`;
  const sign  = val >= 0 ? '+' : '';
  const color = val >= 0 ? C.green : C.red;
  return `${color}${sign}${val.toFixed(1)}%${C.reset}`;
}

function short(mint) {
  if (!mint) return '????...????';
  return `${mint.slice(0, 6)}...${mint.slice(-4)}`;
}

function uptime(ms) {
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60);
  const h = Math.floor(m / 60);
  return `${String(h).padStart(2,'0')}h ${String(m % 60).padStart(2,'0')}m ${String(s % 60).padStart(2,'0')}s`;
}

// ── Dashboard ─────────────────────────────────────────────────────────────────
export class Dashboard {
  constructor(positionManager, monitor, config) {
    this.pm        = positionManager;
    this.monitor   = monitor;
    this.testMode  = config.testMode;
    this.startTime = Date.now();

    /** @type {string[]} */
    this.eventLog = [];

    this._interval = null;
  }

  start(refreshMs) {
    this._interval = setInterval(() => this.render(), refreshMs);
    this.render();
  }

  stop() {
    if (this._interval) clearInterval(this._interval);
  }

  addEvent(msg) {
    const t = new Date().toLocaleTimeString('en-US', { hour12: false });
    this.eventLog.unshift(`${C.dim}[${t}]${C.reset} ${msg}`);
    if (this.eventLog.length > 12) this.eventLog.pop();
  }

  render() {
    const lines = [];

    // ── Header ────────────────────────────────────────────────────────────────
    const modeTag = this.testMode
      ? `${C.yellow}${C.bold} [TEST MODE — NO REAL FUNDS] ${C.reset}`
      : `${C.green}${C.bold} [LIVE] ${C.reset}`;

    const uptimeStr = uptime(Date.now() - this.startTime);
    const stats     = this.pm.stats;

    lines.push(title(`${C.cyan}${C.bold}GRADUATION SNIPER v0.1.0${C.reset}  ${modeTag}`));
    lines.push(box(`  Uptime: ${uptimeStr}   Daily P&L: ${pnlColor(stats.dailyPnl)}`));
    lines.push(box(`  Watching: ${this.monitor.watchedTokens.size} tokens   Open: ${stats.openPositions}/${this.pm.config.maxPositions}`));

    // ── Watched tokens ─────────────────────────────────────────────────────────
    lines.push(divider());
    lines.push(box(`${C.bold} NEAR-GRADUATION TOKENS${C.reset}`));
    lines.push(box(`  ${'Mint'.padEnd(14)} ${'Completion'.padEnd(12)} ${'SOL Reserves'.padEnd(14)} Status`));
    lines.push(box(`  ${'-'.repeat(60)}`));

    const watched = [...this.monitor.watchedTokens.entries()]
      .sort((a, b) => b[1].completionPct - a[1].completionPct)
      .slice(0, 5);

    if (watched.length === 0) {
      lines.push(box(`  ${C.dim}Scanning... waiting for tokens >= ${this.pm.config.discoveryMinPct}%${C.reset}`));
    } else {
      for (const [mint, data] of watched) {
        const solReserves = data.curve
          ? (Number(data.curve.realSolReserves) / 1e9).toFixed(1)
          : '--';
        const pctStr = data.completionPct >= 96
          ? `${C.green}${data.completionPct.toFixed(1)}%${C.reset}`
          : data.completionPct >= 90
            ? `${C.yellow}${data.completionPct.toFixed(1)}%${C.reset}`
            : `${data.completionPct.toFixed(1)}%`;

        lines.push(box(`  ${short(mint).padEnd(14)} ${pctStr.padEnd(20)} ${(solReserves + ' SOL').padEnd(14)}`));
      }
    }

    // ── Open positions ─────────────────────────────────────────────────────────
    lines.push(divider());
    lines.push(box(`${C.bold} OPEN POSITIONS (${stats.openPositions}/${this.pm.config.maxPositions})${C.reset}`));

    const openList = this.pm.openList;
    if (openList.length === 0) {
      lines.push(box(`  ${C.dim}No open positions${C.reset}`));
    } else {
      for (const pos of openList) {
        const unrealPnl = pos.currentValueSol - pos.solSpent;
        const unrealPct = (unrealPnl / pos.solSpent) * 100;
        const statusCol = pos.status === 'POST_GRAD'
          ? `${C.green}POST_GRAD${C.reset}`
          : `${C.yellow}PRE_GRAD${C.reset}`;

        lines.push(box(`  ${short(pos.mint).padEnd(14)} entry:${pos.solSpent.toFixed(3)} SOL  now:${pos.currentValueSol.toFixed(3)} SOL  ${pct(unrealPct)}  ${statusCol}`));

        if (pos.trailingStopSol) {
          lines.push(box(`  ${''.padEnd(14)} ${C.dim}trail-stop: ${pos.trailingStopSol.toFixed(4)}  hwm: ${pos.highWaterMarkSol.toFixed(4)}${C.reset}`));
        } else {
          lines.push(box(`  ${''.padEnd(14)} ${C.dim}hard-stop: ${pos.hardStopSol.toFixed(4)}  (trailing stop activates at graduation)${C.reset}`));
        }
      }
    }

    // ── Stats ──────────────────────────────────────────────────────────────────
    lines.push(divider());
    lines.push(box(`${C.bold} SESSION STATS${C.reset}`));
    lines.push(box(
      `  Trades: ${stats.closedTrades}  ` +
      `${C.green}Wins: ${stats.wins}${C.reset}  ` +
      `${C.red}Losses: ${stats.losses}${C.reset}  ` +
      `Win%: ${stats.closedTrades > 0 ? stats.winRate + '%' : '--'}  ` +
      `Realized: ${pnlColor(stats.realizedPnl)}`
    ));
    lines.push(box(
      `  Daily loss: ${Math.abs(Math.min(0, stats.dailyPnl)).toFixed(4)}` +
      ` / ${this.pm.config.dailyLossLimitSol} SOL limit`
    ));

    // ── Event log ──────────────────────────────────────────────────────────────
    lines.push(divider());
    lines.push(box(`${C.bold} EVENTS${C.reset}`));

    if (this.eventLog.length === 0) {
      lines.push(box(`  ${C.dim}Waiting for events...${C.reset}`));
    } else {
      for (const entry of this.eventLog.slice(0, 8)) {
        lines.push(box(`  ${entry}`));
      }
    }

    lines.push(footer());
    lines.push(`  ${C.dim}Ctrl+C to stop${C.reset}`);

    // Clear screen — works on Windows Terminal, PowerShell 7+, and Unix
    if (COLORS) {
      process.stdout.write('\x1B[2J\x1B[H');
    } else {
      process.stdout.write('\n'.repeat(3));
    }
    process.stdout.write(lines.join('\n') + '\n');
  }
}
