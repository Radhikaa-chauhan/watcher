// Matches 20+ hex-like characters — auto-generated or copy-pasted SHA
const HASH_LIKE = /^[a-f0-9]{20,}$/i;

// Matches GitHub's default fork branch name pattern: patch-1, patch-23 etc.
const PATCH_BRANCH = /^patch-\d+$/i;

// Matches bot-style branch names: random alphanumeric 16+ chars, no separators
const BOT_RANDOM = /^[a-z0-9]{16,}$/i;

// Common "submitted from default branch" patterns — no dedicated branch for the change
const DEFAULT_BRANCHES = new Set(['main', 'master', 'dev', 'develop', 'trunk', 'HEAD']);

/**
 * @param {{ headBranch: string, baseBranch: string }} pr
 * @returns {{ name: string, score: number, weight: number, detail: string }}
 */
export function detect(pr) {
  // headBranch = the branch the author is merging FROM
  const headBranch = (pr.headBranch ?? pr.head_branch ?? '').trim();
  const baseBranch = (pr.baseBranch ?? pr.base_branch ?? 'main').trim();

  let score = 0;
  const issues = [];

  if (!headBranch) {
    // No branch info available — skip gracefully
    return { name: 'branch_name', score: 0, weight: 0.5, detail: 'no branch info' };
  }

  if (HASH_LIKE.test(headBranch)) {
    score += 30;
    issues.push('hash-like auto-generated branch name');
  }

  if (PATCH_BRANCH.test(headBranch)) {
    score += 25;
    issues.push('GitHub default fork branch (patch-N)');
  }

  if (BOT_RANDOM.test(headBranch) && !PATCH_BRANCH.test(headBranch)) {
    score += 20;
    issues.push('random-looking branch name (possible bot)');
  }

  // PRing directly from a default branch is unusual — suggests no dedicated work branch
  if (DEFAULT_BRANCHES.has(headBranch.toLowerCase()) && headBranch.toLowerCase() !== baseBranch.toLowerCase()) {
    score += 15;
    issues.push(`PR submitted from default branch '${headBranch}'`);
  }

  return {
    name: 'branch_name',
    score: Math.min(score, 100),
    weight: 0.5,
    detail: issues.length ? issues.join('; ') : `branch '${headBranch}' looks ok`,
  };
}
