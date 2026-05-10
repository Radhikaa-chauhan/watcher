const LOREM_IPSUM = /lorem\s+ipsum/i;
const REPEATED_CHARS = /(.)\1{6,}/; // same char 7+ times in a row
const URL_REGEX = /https?:\/\/\S+/g;

/**
 * @param {{ title: string, body: string }} pr
 * @returns {{ name: string, score: number, weight: number, detail: string }}
 */
export function detect(pr) {
  const body = pr.body ?? '';
  const trimmed = body.trim();
  let score = 0;
  const issues = [];

  if (trimmed.length === 0) {
    score += 60;
    issues.push('empty body');
  } else {
    if (trimmed.length < 30) {
      score += 30;
      issues.push(`very short body (${trimmed.length} chars)`);
    }

    if (LOREM_IPSUM.test(trimmed)) {
      score += 40;
      issues.push('lorem ipsum placeholder detected');
    }

    if (REPEATED_CHARS.test(trimmed)) {
      score += 25;
      issues.push('keyboard mashing / repeated characters detected');
    }

    const urls = trimmed.match(URL_REGEX) ?? [];
    if (urls.length > 5) {
      score += 25;
      issues.push(`excessive URLs (${urls.length} found)`);
    }

    // Body is just a repeat of the title — no real description added
    const title = (pr.title ?? '').trim().toLowerCase();
    if (title.length > 10 && trimmed.toLowerCase() === title) {
      score += 20;
      issues.push('body is identical to title');
    }
  }

  return {
    name: 'body_quality',
    score: Math.min(score, 100),
    weight: 1.0,
    detail: issues.length ? issues.join('; ') : 'ok',
  };
}
