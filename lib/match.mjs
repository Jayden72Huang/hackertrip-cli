function normalizeForMatch(str) {
  return str.toLowerCase().replace(/[^a-z0-9一-鿿]/g, '');
}

function setOverlap(a, b) {
  const normB = b.map(normalizeForMatch);
  return a.filter((item) => {
    const norm = normalizeForMatch(item);
    return normB.some((bItem) => bItem.includes(norm) || norm.includes(bItem));
  });
}

function parsePrize(prizePool) {
  if (!prizePool) return 0;
  const match = prizePool.replace(/,/g, '').match(/([\d.]+)/);
  if (!match) return 0;
  const num = parseFloat(match[1]);
  if (prizePool.includes('万')) return num * 10000;
  if (prizePool.includes('$') || prizePool.includes('USD')) return num * 7;
  return num;
}

export function matchHackathons(project, hackathons) {
  const scored = hackathons.map((h) => {
    let score = 0;
    const reasons = [];

    const hackTech = [...(h.techStack || []), ...(h.tags || [])];
    const techOverlap = setOverlap(project.techStack, hackTech);
    if (techOverlap.length > 0) {
      score += Math.min(techOverlap.length * 15, 50);
      reasons.push(techOverlap.join(', '));
    }

    const hackKeywords = [
      ...(h.tracks || []),
      h.theme || '',
      ...(h.tags || []),
    ].filter(Boolean);
    const keywordOverlap = setOverlap(project.keywords, hackKeywords);
    if (keywordOverlap.length > 0) {
      score += Math.min(keywordOverlap.length * 10, 30);
      reasons.push(keywordOverlap.join(', '));
    }

    const now = new Date();
    const deadline = h.registrationDeadline ? new Date(h.registrationDeadline) : new Date(h.startDate);
    const daysUntil = (deadline - now) / (1000 * 60 * 60 * 24);
    if (daysUntil > 30) score += 10;
    else if (daysUntil > 7) score += 7;
    else if (daysUntil > 0) score += 3;

    const prizeValue = parsePrize(h.prizePool);
    if (prizeValue > 100000) score += 10;
    else if (prizeValue > 10000) score += 7;
    else if (prizeValue > 0) score += 4;

    return {
      ...h,
      score: Math.min(score, 100),
      matchReasons: [...new Set(reasons)],
    };
  });

  return scored
    .filter((h) => h.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 5);
}
