import { scanProject } from './scan.mjs';

const RESET = '\x1b[0m';
const BOLD = '\x1b[1m';
const DIM = '\x1b[2m';
const CYAN = '\x1b[36m';
const YELLOW = '\x1b[33m';
const GREEN = '\x1b[32m';

const RED = '\x1b[31m';

const SYNC_URL = process.env.HACKERTRIP_SYNC_URL || '';
const SYNC_TOKEN = process.env.HACKERTRIP_SYNC_TOKEN || '';

const URL_RE = /^https?:\/\//i;

function parseArgs(args) {
  const opts = {
    projectPath: process.cwd(),
    pairCode: '',
    syncUrl: SYNC_URL,
    syncToken: SYNC_TOKEN,
    name: '',
    summary: '',
    repo: '',
    demo: '',
    cover: '',
    awards: '',
    tech: '',
  };

  const flags = {
    '--path': 'projectPath',
    '--pair-code': 'pairCode',
    '--sync-url': 'syncUrl',
    '--sync-token': 'syncToken',
    '--name': 'name',
    '--summary': 'summary',
    '--repo': 'repo',
    '--demo': 'demo',
    '--cover': 'cover',
    '--awards': 'awards',
    '--tech': 'tech',
  };

  for (let i = 0; i < args.length; i++) {
    const key = flags[args[i]];
    if (key && args[i + 1] !== undefined) {
      opts[key] = args[i + 1];
      i++;
    }
  }

  return opts;
}

function splitTech(value) {
  if (!value) return [];
  return String(value)
    .split(/[,\n，、]/)
    .map((x) => x.trim())
    .filter(Boolean);
}

// Local format self-check. Returns a list of human-readable problems (empty = ok).
function checkWork(work) {
  const problems = [];
  if (!work.name) problems.push('作品缺少名称（--name）');
  if (!work.repo && !work.demo) problems.push('作品需至少提供 repo 或 demo 其一（--repo / --demo）');
  if (work.repo && !URL_RE.test(work.repo)) problems.push(`repo 必须以 http(s):// 开头（当前：${work.repo}）`);
  if (work.demo && !URL_RE.test(work.demo)) problems.push(`demo 必须以 http(s):// 开头（当前：${work.demo}）`);
  if (work.cover && !URL_RE.test(work.cover)) problems.push(`cover 必须以 http(s):// 开头（当前：${work.cover}）`);
  return problems;
}

export async function publishWork(args) {
  const opts = parseArgs(args);

  if (!opts.pairCode) {
    console.log(`\n${YELLOW}缺少配对码。${RESET}`);
    console.log(`${DIM}请在小程序「我的 → Skills 同步」生成 6 位配对码，并通过 --pair-code <code> 传入。${RESET}\n`);
    process.exit(1);
  }
  if (!/^\d{6}$/.test(opts.pairCode)) {
    console.log(`\n${YELLOW}配对码格式错误，应为 6 位数字。${RESET}\n`);
    process.exit(1);
  }
  if (!opts.syncUrl) {
    console.log(`\n${YELLOW}缺少同步地址。${RESET}`);
    console.log(`${DIM}请设置 HACKERTRIP_SYNC_URL 或通过 --sync-url <url> 传入 pairSync HTTP 触发器地址。${RESET}\n`);
    process.exit(1);
  }
  if (!opts.syncToken) {
    console.log(`\n${YELLOW}缺少同步密钥。${RESET}`);
    console.log(`${DIM}请设置 HACKERTRIP_SYNC_TOKEN 或通过 --sync-token <token> 传入配对生成的 uploadToken。${RESET}\n`);
    process.exit(1);
  }

  console.log(`\n${CYAN}🔍 Scanning project for work defaults...${RESET}`);
  const project = await scanProject(opts.projectPath);

  const techStack = opts.tech ? splitTech(opts.tech) : (Array.isArray(project.techStack) ? project.techStack : []);
  const work = {
    name: opts.name || project.name || 'Untitled work',
    summary: opts.summary || project.description || '由 HackerTrip CLI 上传的作品',
    repo: opts.repo || '',
    demo: opts.demo || '',
    cover: opts.cover || '',
    techStack,
    awards: opts.awards || '',
  };

  // Local format self-check — list every problem, do not send the request.
  const problems = checkWork(work);
  if (problems.length) {
    console.log(`\n${RED}${BOLD}✗ 本地格式自检未通过：${RESET}`);
    for (const p of problems) console.log(`   ${RED}•${RESET} ${p}`);
    console.log(`${DIM}每个作品必须有名称且至少有 repo 或 demo 其一；repo/demo/cover 若提供须以 http(s):// 开头。${RESET}\n`);
    process.exit(1);
  }

  console.log(`${DIM}${'─'.repeat(50)}${RESET}`);
  console.log(`   ${BOLD}Work:${RESET}  ${work.name}`);
  console.log(`   ${BOLD}Stack:${RESET} ${techStack.join(', ') || 'Not detected'}`);
  if (work.summary) console.log(`   ${BOLD}Desc:${RESET}  ${work.summary.slice(0, 100)}`);

  const payload = {
    action: 'push',
    pairCode: opts.pairCode,
    scan: {
      source: 'hackertrip-cli',
      syncedAt: Date.now(),
      project: {
        name: project.name || work.name,
        summary: project.description || work.summary,
        description: project.description || '',
        techStack: Array.isArray(project.techStack) ? project.techStack : [],
        keywords: Array.isArray(project.keywords) ? project.keywords : [],
      },
    },
    works: [work],
  };

  console.log(`\n${CYAN}📡 Uploading work...${RESET}`);
  const res = await fetch(opts.syncUrl, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-sync-token': opts.syncToken,
    },
    body: JSON.stringify(payload),
  });
  const json = await res.json().catch(() => null);
  if (!res.ok || !json || !json.ok) {
    const message = json && json.message ? json.message : `HTTP ${res.status}`;
    throw new Error(`Publish failed: ${message}`);
  }

  console.log(`\n${GREEN}${BOLD}✓ 作品已上传，进入待审核。${RESET}`);
  console.log(`   Pair code: ${BOLD}${opts.pairCode}${RESET}`);
  console.log(`   ${DIM}请在小程序「我的 → 作品」预览确认并点『发布』后，才会公开到个人主页。${RESET}\n`);
}
