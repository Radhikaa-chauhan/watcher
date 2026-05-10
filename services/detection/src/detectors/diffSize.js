/**
 * @param {{ additions: number, deletions: number, changedFiles: number, body: string }} pr
 * @returns {{ name: string, score: number, weight: number, detail: string }}
 */
export function detect(pr) {
  const additions = pr.additions ?? 0;
  const deletions = pr.deletions ?? 0;
  const changedFiles = pr.changedFiles ?? pr.changed_files ?? 0;
  const bodyLen = (pr.body ?? '').trim().length;
  const totalLines = additions + deletions;

  let score = 0;
  const issues = [];

  // Zero net change — no actual code touched
  if (totalLines === 0 && changedFiles === 0) {
    score += 60;
    issues.push('no lines changed');
  }

  // Trivially small change (1–2 lines) with no description
  if (totalLines > 0 && totalLines <= 2 && bodyLen < 20) {
    score += 25;
    issues.push(`micro diff (${totalLines} line${totalLines > 1 ? 's' : ''}) with no description`);
  }

  // Massive diff with no explanation
  if (totalLines > 5000 && bodyLen < 100) {
    score += 35;
    issues.push(`massive diff (${totalLines} lines) with insufficient description`);
  }

  // Huge number of files with empty body
  if (changedFiles > 100 && bodyLen < 50) {
    score += 25;
    issues.push(`${changedFiles} files changed with empty body`);
  }

  return {
    name: 'diff_size',
    score: Math.min(score, 100),
    weight: 0.9,
    detail: issues.length
      ? issues.join('; ')
      : `+${additions} -${deletions} across ${changedFiles} file(s) — ok`,
  };
}
