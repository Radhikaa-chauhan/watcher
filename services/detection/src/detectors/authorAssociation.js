/**
 * Detector: Author Association
 *
 * Uses GitHub's built-in author_association field to score risk.
 * New or unknown contributors are higher risk than established ones.
 *
 * GitHub association values:
 *   OWNER        — repo owner
 *   MEMBER       — org member
 *   COLLABORATOR — explicitly invited collaborator
 *   CONTRIBUTOR  — has merged PR before
 *   FIRST_TIME_CONTRIBUTOR — first merged PR in this repo
 *   FIRST_TIMER  — first PR ever on GitHub
 *   NONE         — no relationship to repo at all
 *
 * Weight: 0.8 (supportive signal — not decisive alone)
 */

const SCORE_MAP = {
  OWNER: 0,
  MEMBER: 0,
  COLLABORATOR: 5,
  CONTRIBUTOR: 15,
  FIRST_TIME_CONTRIBUTOR: 40,
  FIRST_TIMER: 55,
  NONE: 65,
};

/**
 * @param {{ authorAssociation: string }} pr
 * @returns {{ name: string, score: number, weight: number, detail: string }}
 */
export function detect(pr) {
  const assoc = (pr.authorAssociation ?? pr.author_association ?? 'NONE').toUpperCase();
  const score = SCORE_MAP[assoc] ?? 50;

  return {
    name: 'author_association',
    score,
    weight: 0.8,
    detail: assoc,
  };
}
