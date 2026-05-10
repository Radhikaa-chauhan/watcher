const BOT_HOURS_START = 2; // 2 AM UTC
const BOT_HOURS_END   = 5; // 5 AM UTC

/**
 * @param {{ createdAt: string, authorAssociation: string }} pr
 * @returns {{ name: string, score: number, weight: number, detail: string }}
 */
export function detect(pr) {
  const createdAt = pr.createdAt ?? pr.created_at;
  if (!createdAt) {
    return { name: 'timing', score: 0, weight: 0.3, detail: 'no timestamp available' };
  }

  const date = new Date(createdAt);
  if (isNaN(date.getTime())) {
    return { name: 'timing', score: 0, weight: 0.3, detail: 'invalid timestamp' };
  }

  const hour = date.getUTCHours();
  const dayOfWeek = date.getUTCDay(); // 0 = Sunday, 6 = Saturday
  const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
  const assoc = (pr.authorAssociation ?? pr.author_association ?? 'NONE').toUpperCase();
  const isUnknownAuthor = assoc === 'NONE' || assoc === 'FIRST_TIMER';

  let score = 0;
  const issues = [];

  // Submitted during bot-active hours
  if (hour >= BOT_HOURS_START && hour <= BOT_HOURS_END) {
    score += 10;
    issues.push(`submitted at ${hour}:00 UTC (low-activity window)`);
  }

  // Weekend + unknown author = slightly more suspicious
  if (isWeekend && isUnknownAuthor) {
    score += 8;
    issues.push('weekend submission from unknown author');
  }

  const detail = issues.length
    ? issues.join('; ')
    : `submitted ${date.toUTCString()} — ok`;

  return {
    name: 'timing',
    score: Math.min(score, 100),
    weight: 0.3,
    detail,
  };
}
