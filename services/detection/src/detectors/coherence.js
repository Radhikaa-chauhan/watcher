// Common stop words to exclude from keyword matching
const STOP_WORDS = new Set([
  'a', 'an', 'the', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for',
  'of', 'with', 'by', 'from', 'is', 'it', 'be', 'as', 'at', 'this',
  'that', 'was', 'are', 'has', 'had', 'have', 'will', 'can', 'my', 'your',
  'we', 'i', 'you', 'he', 'she', 'they', 'pr', 'fix', 'add', 'update',
  'change', 'new', 'use', 'also', 'some', 'into', 'not', 'no',
]);

function extractKeywords(text) {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(w => w.length > 3 && !STOP_WORDS.has(w));
}

/**
 * @param {{ title: string, body: string }} pr
 * @returns {{ name: string, score: number, weight: number, detail: string }}
 */
export function detect(pr) {
  const title = pr.title ?? '';
  const body  = pr.body  ?? '';

  // Not enough data to compare — skip
  if (title.trim().length < 10 || body.trim().length < 30) {
    return {
      name: 'coherence',
      score: 0,
      weight: 0.7,
      detail: 'insufficient text to evaluate coherence',
    };
  }

  const titleKeywords = extractKeywords(title);
  const bodyKeywords  = new Set(extractKeywords(body));

  if (titleKeywords.length === 0) {
    return { name: 'coherence', score: 0, weight: 0.7, detail: 'no significant title keywords' };
  }

  const matched = titleKeywords.filter(w => bodyKeywords.has(w));
  const overlapRatio = matched.length / titleKeywords.length;

  let score = 0;
  let detail = '';

  if (overlapRatio === 0) {
    score = 35;
    detail = `no keyword overlap between title and body (title keywords: ${titleKeywords.slice(0, 5).join(', ')})`;
  } else if (overlapRatio < 0.2) {
    score = 15;
    detail = `low coherence — only ${matched.length}/${titleKeywords.length} title keywords found in body`;
  } else {
    detail = `${matched.length}/${titleKeywords.length} title keywords found in body — ok`;
  }

  return {
    name: 'coherence',
    score: Math.min(score, 100),
    weight: 0.7,
    detail,
  };
}
