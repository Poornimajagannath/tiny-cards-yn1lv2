/**
 * SitSession — one short play burst. Never auto-advances a lesson.
 * Parent or child ends the sit. Five nice hits is "enough", not a gate.
 */

export const BURST_GOAL = 5;

export class SitSession {
  /**
   * @param {{ domain: string, mode: string }} opts
   */
  constructor(opts) {
    this.domain = opts.domain;
    this.mode = opts.mode;
    this.successes = 0;
    this.trials = 0;
    this.startedAt = Date.now();
    this.ended = false;
  }

  /** @param {boolean} ok */
  mark(ok) {
    if (this.ended) return;
    this.trials += 1;
    if (ok) this.successes += 1;
  }

  burstComplete() {
    return this.successes >= BURST_GOAL;
  }

  end() {
    this.ended = true;
  }

  label() {
    if (this.successes <= 0) return 'Just starting';
    if (this.successes === 1) return '1 nice one';
    return this.successes + ' nice ones';
  }
}
