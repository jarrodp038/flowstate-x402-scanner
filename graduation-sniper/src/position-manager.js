// ── PositionManager ───────────────────────────────────────────────────────────
/**
 * Tracks open and closed positions, enforces risk limits,
 * and runs the trailing stop algorithm.
 */
export class PositionManager {
  constructor(config) {
    this.config = config;

    /** @type {Map<string, Position>} */
    this.positions = new Map();

    /** @type {Position[]} */
    this.history = [];

    this.dailyRealizedPnl = 0;
    this._dailyResetDate  = _today();
  }

  // ── Risk gate ───────────────────────────────────────────────────────────────

  canOpenPosition() {
    this._resetDailyPnlIfNeeded();

    if (this.positions.size >= this.config.maxPositions) {
      return { allowed: false, reason: `MAX_POSITIONS (${this.config.maxPositions})` };
    }
    if (this.dailyRealizedPnl <= -this.config.dailyLossLimitSol) {
      return { allowed: false, reason: `DAILY_LOSS_LIMIT (${this.config.dailyLossLimitSol} SOL)` };
    }
    return { allowed: true, reason: null };
  }

  // ── Lifecycle ───────────────────────────────────────────────────────────────

  /**
   * Record a new buy.
   * @param {string} mint
   * @param {{ solSpent, tokensReceived, entryCompletionPct, signature, simulated }} opts
   */
  openPosition(mint, { solSpent, tokensReceived, entryCompletionPct, signature, simulated }) {
    const position = {
      mint,
      entryTime:           Date.now(),
      solSpent,
      tokensReceived,      // BigInt (raw 6-decimal) or null for live trades
      entryCompletionPct,
      signature,
      simulated,

      // Price tracking
      currentValueSol:     solSpent,   // best guess at entry
      highWaterMarkSol:    solSpent,
      pricePerToken:       null,        // set on first price tick

      // Stop levels
      trailingStopSol:     null,        // activated at graduation
      hardStopSol:         solSpent * (1 - this.config.hardStopLossPct / 100),

      // State
      graduated:           false,
      graduationTime:      null,
      status:              'PRE_GRAD',  // PRE_GRAD | POST_GRAD | CLOSED
    };

    this.positions.set(mint, position);
    return position;
  }

  /** Mark a position as graduated and activate the trailing stop. */
  markGraduated(mint) {
    const pos = this.positions.get(mint);
    if (!pos || pos.graduated) return;

    pos.graduated      = true;
    pos.graduationTime = Date.now();
    pos.status         = 'POST_GRAD';

    // Trailing stop starts from the current value at graduation
    pos.trailingStopSol = pos.currentValueSol * (1 - this.config.trailingStopPct / 100);
    return pos;
  }

  /**
   * Update position with latest price data.
   * Returns an exit action object `{ action: 'SELL', reason }` or null (hold).
   *
   * @param {string} mint
   * @param {number} pricePerToken  SOL per token (raw units)
   */
  updatePrice(mint, pricePerToken) {
    const pos = this.positions.get(mint);
    if (!pos || pos.status === 'CLOSED') return null;

    if (!pricePerToken || pricePerToken <= 0) return null;

    pos.pricePerToken = pricePerToken;

    // Estimate current value if we know how many tokens we hold
    if (pos.tokensReceived && pos.tokensReceived > 0n) {
      const tokens = Number(pos.tokensReceived);
      pos.currentValueSol = (pricePerToken * tokens);
    }

    return this._checkExitConditions(pos);
  }

  /**
   * Update position value directly in SOL (used when we have a SOL-denominated price tick).
   * Returns exit action or null.
   */
  updateValueSol(mint, currentValueSol) {
    const pos = this.positions.get(mint);
    if (!pos || pos.status === 'CLOSED') return null;
    if (!currentValueSol || currentValueSol <= 0) return null;

    pos.currentValueSol = currentValueSol;

    // Ratchet high water mark
    if (currentValueSol > pos.highWaterMarkSol) {
      pos.highWaterMarkSol = currentValueSol;

      // Move trailing stop up
      if (pos.graduated) {
        pos.trailingStopSol = currentValueSol * (1 - this.config.trailingStopPct / 100);
      }
    }

    return this._checkExitConditions(pos);
  }

  /**
   * Record a closed position after sell is confirmed.
   * @param {string} mint
   * @param {{ solReceived, signature }} opts
   */
  closePosition(mint, { solReceived, signature }) {
    const pos = this.positions.get(mint);
    if (!pos) return null;

    const pnl    = solReceived - pos.solSpent;
    const pnlPct = (pnl / pos.solSpent) * 100;

    pos.status       = 'CLOSED';
    pos.closeTime    = Date.now();
    pos.solReceived  = solReceived;
    pos.pnl          = pnl;
    pos.pnlPct       = pnlPct;
    pos.closeSignature = signature;

    this.dailyRealizedPnl += pnl;
    this.history.push({ ...pos });
    this.positions.delete(mint);

    return pos;
  }

  // ── Stop-loss logic ─────────────────────────────────────────────────────────

  _checkExitConditions(pos) {
    const val = pos.currentValueSol;

    // Hard stop loss (always active)
    if (val <= pos.hardStopSol) {
      return { action: 'SELL', reason: 'HARD_STOP_LOSS' };
    }

    // Trailing stop (post-graduation only)
    if (pos.graduated && pos.trailingStopSol && val <= pos.trailingStopSol) {
      return { action: 'SELL', reason: 'TRAILING_STOP' };
    }

    return null;
  }

  // ── Stats ───────────────────────────────────────────────────────────────────

  get stats() {
    this._resetDailyPnlIfNeeded();

    const closed     = this.history;
    const wins       = closed.filter(p => p.pnl > 0);
    const losses     = closed.filter(p => p.pnl <= 0);
    const totalPnl   = closed.reduce((s, p) => s + p.pnl, 0);
    const unrealized = [...this.positions.values()].reduce(
      (s, p) => s + (p.currentValueSol - p.solSpent), 0
    );

    return {
      openPositions:   this.positions.size,
      closedTrades:    closed.length,
      wins:            wins.length,
      losses:          losses.length,
      winRate:         closed.length ? ((wins.length / closed.length) * 100).toFixed(1) : '0.0',
      realizedPnl:     totalPnl,
      unrealizedPnl:   unrealized,
      dailyPnl:        this.dailyRealizedPnl,
    };
  }

  get openList() {
    return [...this.positions.values()];
  }

  // ── Internal ────────────────────────────────────────────────────────────────

  _resetDailyPnlIfNeeded() {
    const today = _today();
    if (today !== this._dailyResetDate) {
      this.dailyRealizedPnl = 0;
      this._dailyResetDate  = today;
    }
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function _today() {
  return new Date().toDateString();
}
