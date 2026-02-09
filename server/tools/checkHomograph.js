/**
 * Homograph / Punycode / Zero-width character detection.
 * Pure JS — no external API calls.
 */

export function checkHomograph({ hostname }) {
  const hasPunycode = hostname.includes('xn--');
  const cyrillicPattern = /[\u0400-\u04FF]/u;
  const hasCyrillic = cyrillicPattern.test(hostname);
  const zeroWidth = /\u200B|\u200C|\u200D|\uFEFF/u;
  const hasZeroWidth = zeroWidth.test(hostname);

  // Mixed script detection (Latin + non-Latin in same label)
  const latinPattern = /[a-zA-Z]/;
  const nonLatinPattern = /\P{ASCII}/u;
  const hasMixedScript = latinPattern.test(hostname) && nonLatinPattern.test(hostname);

  const isHomograph = hasPunycode || hasCyrillic || hasZeroWidth || hasMixedScript;

  const details = [];
  if (hasPunycode) details.push('Punycode encoding detected (xn-- prefix)');
  if (hasCyrillic) details.push('Cyrillic characters found (lookalike attack)');
  if (hasZeroWidth) details.push('Zero-width characters found (hidden characters)');
  if (hasMixedScript) details.push('Mixed scripts detected (Latin + non-Latin characters)');

  return {
    isHomograph,
    hasPunycode,
    hasCyrillic,
    hasZeroWidth,
    hasMixedScript,
    details: details.join('; ') || 'No homograph attack detected',
  };
}
