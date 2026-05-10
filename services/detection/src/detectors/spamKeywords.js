const SPAM_PATTERNS = [
  // Hacktoberfest / contribution farming
  { pattern: /\bhacktoberfest\b/i,                       label: 'hacktoberfest farming' },
  { pattern: /\bcontributing\s+for\s+fun\b/i,            label: 'contributing for fun' },
  { pattern: /\bjust\s+for\s+practice\b/i,               label: 'just for practice' },
  { pattern: /\blearning\s+github\b/i,                   label: 'learning github' },
  { pattern: /\bfirst\s+(pr|pull\s+request)\b/i,         label: 'first PR announcement' },
  { pattern: /\bopen\s+source\s+contribution\b/i,        label: 'generic OS contribution phrase' },

  // Begging / pressure language
  { pattern: /\bplease\s+(merge|accept|approve)\b/i,     label: 'please merge/accept' },
  { pattern: /\bpls\s+merge\b/i,                         label: 'pls merge' },
  { pattern: /\baccept\s+my\s+pr\b/i,                    label: 'accept my PR' },
  { pattern: /\bquick\s+fix\b/i,                         label: 'quick fix' },
  { pattern: /\btypo\s+fix\b/i,                          label: 'typo fix (no context)' },
  { pattern: /\bminor\s+(change|fix|update)\b/i,         label: 'minor change (no detail)' },

  // Commercial spam
  { pattern: /\b(bitcoin|crypto|forex|nft|token\s+sale)\b/i, label: 'crypto/financial spam' },
  { pattern: /\b(casino|betting|gambling|poker)\b/i,     label: 'gambling spam' },
  { pattern: /\b(loan|mortgage|payday|lender)\b/i,       label: 'loan spam' },
  { pattern: /\b(prize|winner|congratulations|won\s+a)\b/i, label: 'prize/scam language' },
  { pattern: /\b(buy\s+followers|increase\s+traffic)\b/i, label: 'SEO/growth spam' },

  // Urgency/clickbait
  { pattern: /\b(urgent|asap|immediately|critical\s+fix)\b/i, label: 'urgency language' },
  { pattern: /\b(100%\s+working|guaranteed|no\s+risk)\b/i, label: 'scam guarantee language' },

  // Non-ASCII stuffing (emoji spam / unicode abuse) — 25+ consecutive non-ASCII chars
  { pattern: /[^\x00-\x7F]{25,}/,                        label: 'non-ASCII character stuffing' },
];

/**
 * @param {{ title: string, body: string }} pr
 * @returns {{ name: string, score: number, weight: number, detail: string }}
 */
export function detect(pr) {
  const text = `${pr.title ?? ''} ${pr.body ?? ''}`;
  const matched = SPAM_PATTERNS.filter(({ pattern }) => pattern.test(text));

  const score = Math.min(matched.length * 30, 100);
  const detail = matched.length
    ? `${matched.length} pattern(s): ${matched.map(m => m.label).join(', ')}`
    : 'no spam patterns detected';

  return {
    name: 'spam_keywords',
    score,
    weight: 1.5,
    detail,
  };
}
