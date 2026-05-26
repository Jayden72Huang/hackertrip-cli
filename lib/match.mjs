const SEMANTIC_EXPAND = {
  'Three.js': ['XR', 'VR', 'AR', '3D', '空间计算', '元宇宙', 'WebGL', '沉浸式', '可视化'],
  'LLM': ['AI', '人工智能', '大模型', '智能', 'NLP', 'GPT', 'agent', '对话'],
  'AI SDK': ['AI', '人工智能', '大模型', '智能', 'agent'],
  'AI/ML': ['AI', '人工智能', '机器学习', '深度学习', '智能', '数据'],
  'Web3': ['区块链', 'DeFi', '以太坊', 'NFT', '智能合约', 'blockchain', 'crypto', 'DApp'],
  'React Native': ['Mobile', '移动', 'App'],
  'Flutter': ['Mobile', '移动', 'App'],
  'Fintech': ['金融', '支付', 'payment', '量化', '风控', '投顾'],
  'Supabase': ['数据库', 'Backend', 'BaaS'],
  'Neon DB': ['数据库', 'PostgreSQL', 'Backend'],
  'Drizzle ORM': ['数据库', 'Backend'],
  'Video': ['视频', '流媒体', '内容', '创作', 'creative'],
  'Maps': ['地图', '旅行', 'travel', '地理', 'geolocation'],
  'Web Scraping': ['爬虫', '数据', '自动化', 'automation', 'crawler'],
  'Game': ['游戏', 'gaming', 'AIGC', '元宇宙', 'NPC'],
  'Animation': ['动画', '交互', '创意', 'creative', 'design'],
  'Data Visualization': ['数据', '可视化', 'analytics', '分析'],
  'Data Analysis': ['数据', '分析', 'analytics', '数据科学'],
  'Computer Vision': ['计算机视觉', '图像', 'OCR', '识别', '医学影像'],
  'PyTorch': ['AI', '深度学习', '机器学习', '模型'],
  'TensorFlow': ['AI', '深度学习', '机器学习', '模型'],
  'HuggingFace': ['AI', 'NLP', '大模型', '开源'],
  'FastAPI': ['API', 'Backend', 'Python'],
  'Next.js': ['全栈', 'React', 'SSR', 'Web'],
  'Cloudflare': ['边缘计算', 'CDN', '部署'],
  'Docker': ['容器', '部署', 'DevOps'],
  'PostgreSQL': ['数据库', 'Backend'],
  'Express': ['Backend', 'Node.js', 'API'],
};

function normalizeForMatch(str) {
  return str.toLowerCase().replace(/[^a-z0-9一-鿿]/g, '');
}

function setOverlap(a, b) {
  const normB = b.map(normalizeForMatch);
  return a.filter((item) => {
    const norm = normalizeForMatch(item);
    if (norm.length < 2) return false;
    return normB.some((bItem) => {
      if (norm === bItem) return true;
      // Only allow substring match if the shorter string is >= 3 chars
      const shorter = norm.length <= bItem.length ? norm : bItem;
      if (shorter.length < 3) return false;
      return bItem.includes(norm) || norm.includes(bItem);
    });
  });
}

function expandTechStack(techStack) {
  const expanded = new Set(techStack);
  for (const tech of techStack) {
    const expansions = SEMANTIC_EXPAND[tech];
    if (expansions) {
      expansions.forEach((e) => expanded.add(e));
    }
  }
  return [...expanded];
}

function findBestTrack(project, hackathon) {
  const expandedTech = expandTechStack(project.techStack);
  const allProjectTerms = [...expandedTech, ...project.keywords];
  const tracks = hackathon.tracks || [];

  let bestTrack = null;
  let bestScore = 0;

  for (const track of tracks) {
    const trackTerms = [track];
    const overlap = setOverlap(allProjectTerms, trackTerms);
    if (overlap.length > bestScore) {
      bestScore = overlap.length;
      bestTrack = track;
    }
  }

  if (!bestTrack && tracks.length > 0) {
    const hackAllTerms = [...(hackathon.techStack || []), ...(hackathon.tags || []), hackathon.theme || ''];
    for (const track of tracks) {
      const trackInTheme = normalizeForMatch(hackathon.theme || '').includes(normalizeForMatch(track));
      if (trackInTheme) {
        bestTrack = track;
        break;
      }
    }
    if (!bestTrack) bestTrack = tracks[0];
  }

  return bestTrack;
}

function parsePrize(prizePool) {
  if (!prizePool) return 0;
  const match = prizePool.replace(/,/g, '').match(/([\d.]+)/);
  if (!match) return 0;
  const num = parseFloat(match[1]);
  if (prizePool.includes('万') || prizePool.includes('w')) return num * 10000;
  if (prizePool.includes('百万')) return num * 1000000;
  if (prizePool.includes('$') || prizePool.includes('USD')) return num * 7;
  if (prizePool.includes('¥')) return num;
  return num;
}

export function matchHackathons(project, hackathons) {
  const expandedTech = expandTechStack(project.techStack);

  const scored = hackathons.map((h) => {
    let score = 0;
    const reasons = [];

    // 1. Tech stack match (max 50) — with semantic expansion
    const hackTech = [...(h.techStack || []), ...(h.tags || [])];
    const techOverlap = setOverlap(expandedTech, hackTech);
    if (techOverlap.length > 0) {
      score += Math.min(techOverlap.length * 10, 50);
      const directMatch = setOverlap(project.techStack, hackTech);
      reasons.push(directMatch.length > 0 ? directMatch.join(', ') : techOverlap.slice(0, 3).join(', '));
    }

    // 2. Keyword / track match (max 30) — expanded
    const hackKeywords = [
      ...(h.tracks || []),
      h.theme || '',
      ...(h.tags || []),
      h.summary || '',
    ].filter(Boolean);
    const keywordOverlap = setOverlap([...project.keywords, ...expandedTech], hackKeywords);
    if (keywordOverlap.length > 0) {
      score += Math.min(keywordOverlap.length * 6, 30);
      const uniqueReasons = keywordOverlap.filter((k) => !reasons.includes(k));
      if (uniqueReasons.length > 0) {
        reasons.push(uniqueReasons.slice(0, 3).join(', '));
      }
    }

    // 3. Timing bonus (max 10)
    const now = new Date();
    const deadline = h.registrationDeadline ? new Date(h.registrationDeadline) : new Date(h.startDate);
    const daysUntil = (deadline - now) / (1000 * 60 * 60 * 24);
    if (daysUntil > 30) score += 10;
    else if (daysUntil > 7) score += 7;
    else if (daysUntil > 0) score += 3;

    // 4. Prize bonus (max 10)
    const prizeValue = parsePrize(h.prizePool);
    if (prizeValue > 100000) score += 10;
    else if (prizeValue > 10000) score += 7;
    else if (prizeValue > 0) score += 4;

    // Find best matching track
    const bestTrack = findBestTrack(project, h);

    return {
      ...h,
      score: Math.min(score, 100),
      matchReasons: [...new Set(reasons)],
      bestTrack,
    };
  });

  return scored
    .filter((h) => h.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 8);
}
