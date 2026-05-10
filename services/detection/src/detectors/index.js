import { detect as titleQuality }      from './titleQuality.js';
import { detect as bodyQuality }       from './bodyQuality.js';
import { detect as authorAssociation } from './authorAssociation.js';
import { detect as diffSize }          from './diffSize.js';
import { detect as spamKeywords }      from './spamKeywords.js';
import { detect as branchName }        from './branchName.js';
import { detect as timing }            from './timing.js';
import { detect as coherence }         from './coherence.js';

const DETECTORS = [
  titleQuality,
  bodyQuality,
  authorAssociation,
  diffSize,
  spamKeywords,
  branchName,
  timing,
  coherence,
];

/**
 * Run all detectors against a PR and return the aggregated score + signals.
 *
 * @param {object} pr - normalized PR data object
 * @returns {{ score: number, signals: Array }}
 */
export async function runDetectors(pr) {
  const signals = DETECTORS.map(fn => {
    try {
      return fn(pr);
    } catch (err) {
      console.error(`[detectors] ${fn.name} threw:`, err.message);
      return { name: fn.name, score: 0, weight: 0.1, detail: `error: ${err.message}` };
    }
  });

  const totalWeight   = signals.reduce((sum, s) => sum + s.weight, 0);
  const weightedScore = signals.reduce((sum, s) => sum + s.score * s.weight, 0);
  const score         = Math.round(weightedScore / totalWeight);

  return { score, signals };
}
