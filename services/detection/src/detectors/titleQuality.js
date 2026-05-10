const GENERIC_TITLE_PATTERN = /^(fix|update|changes?|stuff|test|wip|asdf|untitled|edit|patch|pr|misc|temp|todo|done|hello|hi|commit|work|change|modified?|added?|removed?|deleted?)\b/i;
const EXCESSIVE_CAPS_PATTERN = /[A-Z]{5,}/;

/**
 * @param {{ title: string, body: string }} pr
 * @returns {{ name: string, score: number, weight: number, detail: string }}
 */
export function detect(pr) {
  const title = pr.title ?? '';
  let score = 0;
  const issues = [];

  if (title.trim().length === 0) {
    score += 80;
    issues.push('empty title');
  } else {
    if (title.trim().length < 10) {
      score += 40;
      issues.push(`title too short (${title.trim().length} chars)`);
    }

    if (GENERIC_TITLE_PATTERN.test(title.trim())) {
      score += 30;
      issues.push('generic/meaningless title');
    }

    if (EXCESSIVE_CAPS_PATTERN.test(title)) {
      score += 15;
      issues.push('excessive capitalization');
    }

    if (title.length > 200) {
      score += 10;
      issues.push(`title too long (${title.length} chars)`);
    }
  }

  return {
    name: 'title_quality',
    score: Math.min(score, 100),
    weight: 1.2,
    detail: issues.length ? issues.join('; ') : 'ok',
  };
}
