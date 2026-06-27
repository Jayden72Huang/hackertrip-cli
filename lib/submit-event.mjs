import { readFile } from 'node:fs/promises';

const RESET = '\x1b[0m';
const BOLD = '\x1b[1m';
const DIM = '\x1b[2m';
const CYAN = '\x1b[36m';
const YELLOW = '\x1b[33m';
const GREEN = '\x1b[32m';
const RED = '\x1b[31m';

const EVENT_URL = process.env.HACKERTRIP_EVENT_URL || '';
// Token used as x-sync-token / uploadToken. HACKERTRIP_SYNC_TOKEN is primary;
// HACKERTRIP_EVENT_TOKEN kept as a backward-compatible fallback.
const SYNC_TOKEN = process.env.HACKERTRIP_SYNC_TOKEN || process.env.HACKERTRIP_EVENT_TOKEN || '';

const REQUIRED = ['name', 'city', 'start', 'end', 'website'];
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const URL_RE = /^https?:\/\//i;

// CLI flag -> event field. tracks is a list, the rest are plain strings.
const FIELD_FLAGS = {
  '--name': 'name',
  '--city': 'city',
  '--start': 'start',
  '--end': 'end',
  '--website': 'website',
  '--mode': 'mode',
  '--prize': 'prize',
  '--tracks': 'tracks',
  '--summary': 'summary',
  '--organizer': 'organizer',
  '--contact': 'contact',
};

function parseArgs(args) {
  const opts = {
    eventUrl: EVENT_URL,
    syncToken: SYNC_TOKEN,
    pairCode: '',
    from: '',
    fields: {},
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--event-url' && args[i + 1] !== undefined) {
      opts.eventUrl = args[i + 1];
      i++;
    } else if (arg === '--from' && args[i + 1] !== undefined) {
      opts.from = args[i + 1];
      i++;
    } else if (arg === '--pair-code' && args[i + 1] !== undefined) {
      opts.pairCode = args[i + 1];
      i++;
    } else if ((arg === '--sync-token' || arg === '--submit-token') && args[i + 1] !== undefined) {
      // --submit-token kept as a backward-compatible alias for --sync-token.
      opts.syncToken = args[i + 1];
      i++;
    } else if (FIELD_FLAGS[arg] && args[i + 1] !== undefined) {
      opts.fields[FIELD_FLAGS[arg]] = args[i + 1];
      i++;
    }
  }

  return opts;
}

function splitList(value) {
  if (Array.isArray(value)) return value.map((x) => String(x).trim()).filter(Boolean);
  if (!value) return [];
  return String(value)
    .split(/[,\n，、]/)
    .map((x) => x.trim())
    .filter(Boolean);
}

// Parse a --from file. Supports JSON, or a simple key:value / key=value (md-friendly) format.
function parseFromFile(content) {
  const trimmed = content.trim();
  if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
    try {
      const json = JSON.parse(trimmed);
      return json && typeof json === 'object' ? json : {};
    } catch {
      // fall through to key:value parsing
    }
  }

  const fields = {};
  for (let line of content.split('\n')) {
    line = line.trim();
    if (!line || line.startsWith('#') || line.startsWith('//')) continue;
    // strip markdown list markers and bold markers
    line = line.replace(/^[-*]\s+/, '').replace(/\*\*/g, '');
    const m = line.match(/^([A-Za-z_][\w-]*)\s*[:=]\s*(.*)$/);
    if (m) {
      const key = m[1].trim();
      const value = m[2].trim().replace(/^["']|["']$/g, '');
      if (value) fields[key] = value;
    }
  }
  return fields;
}

function buildEvent(fromFields, cliFields) {
  const merged = { ...fromFields, ...cliFields };
  const event = {};
  const keys = [
    'name', 'city', 'start', 'end', 'website',
    'mode', 'prize', 'summary', 'organizer', 'contact',
  ];
  for (const key of keys) {
    if (merged[key] !== undefined && merged[key] !== '') {
      event[key] = String(merged[key]).trim();
    }
  }
  const tracks = splitList(merged.tracks);
  if (tracks.length) event.tracks = tracks;
  return event;
}

// Local format self-check. Returns a list of human-readable problems (empty = ok).
function checkEvent(event) {
  const problems = [];

  for (const key of REQUIRED) {
    if (!event[key]) problems.push(`缺少必填字段：${key}`);
  }

  if (event.start && !DATE_RE.test(event.start)) {
    problems.push(`start 日期格式应为 YYYY-MM-DD（当前：${event.start}）`);
  }
  if (event.end && !DATE_RE.test(event.end)) {
    problems.push(`end 日期格式应为 YYYY-MM-DD（当前：${event.end}）`);
  }
  if (event.start && event.end && DATE_RE.test(event.start) && DATE_RE.test(event.end) && event.start > event.end) {
    problems.push(`start 不能晚于 end（${event.start} > ${event.end}）`);
  }
  if (event.website && !URL_RE.test(event.website)) {
    problems.push(`website 必须以 http:// 或 https:// 开头（当前：${event.website}）`);
  }

  return problems;
}

export async function submitEvent(args) {
  const opts = parseArgs(args);

  // 1) Pair code is required — must be generated in the mini program first.
  if (!opts.pairCode) {
    console.log(`\n${RED}${BOLD}✗ 缺少提交配对码（--pair-code）${RESET}`);
    console.log(`${DIM}请先在 HackerTrip 小程序生成提交配对码（主办方后台 → 生成提交码），再用 --pair-code 传入。${RESET}\n`);
    process.exit(1);
  }
  if (!/^\d{6}$/.test(opts.pairCode)) {
    console.log(`\n${YELLOW}配对码格式错误，应为 6 位数字。${RESET}\n`);
    process.exit(1);
  }

  let fromFields = {};
  if (opts.from) {
    let content;
    try {
      content = await readFile(opts.from, 'utf-8');
    } catch {
      console.log(`\n${YELLOW}无法读取 --from 文件：${opts.from}${RESET}\n`);
      process.exit(1);
    }
    fromFields = parseFromFile(content);
  }

  const event = buildEvent(fromFields, opts.fields);

  // 2) Local format self-check — list every problem, do not send the request.
  const problems = checkEvent(event);
  if (problems.length) {
    console.log(`\n${RED}${BOLD}✗ 本地格式自检未通过：${RESET}`);
    for (const p of problems) console.log(`   ${RED}•${RESET} ${p}`);
    console.log(`${DIM}必填字段：${REQUIRED.join(', ')}；日期格式 YYYY-MM-DD 且 start ≤ end；website 需以 http(s):// 开头。${RESET}`);
    console.log(`${DIM}可用 --name/--city/--start/--end/--website 逐字段传入，或用 --from <file> 从 JSON / key:value 文件读取。${RESET}\n`);
    process.exit(1);
  }

  if (!opts.eventUrl) {
    console.log(`\n${YELLOW}缺少提交地址。${RESET}`);
    console.log(`${DIM}请设置 HACKERTRIP_EVENT_URL 或通过 --event-url <url> 传入 eventSync 地址。${RESET}\n`);
    process.exit(1);
  }
  if (!opts.syncToken) {
    console.log(`\n${YELLOW}缺少同步密钥。${RESET}`);
    console.log(`${DIM}请设置 HACKERTRIP_SYNC_TOKEN 或通过 --sync-token <token> 传入配对生成的 uploadToken。${RESET}\n`);
    process.exit(1);
  }

  console.log(`\n${CYAN}${BOLD}📋 Event${RESET}`);
  console.log(`${DIM}${'─'.repeat(50)}${RESET}`);
  console.log(`   ${BOLD}Name:${RESET}    ${event.name}`);
  console.log(`   ${BOLD}City:${RESET}    ${event.city}`);
  console.log(`   ${BOLD}Dates:${RESET}   ${event.start} – ${event.end}`);
  console.log(`   ${BOLD}Website:${RESET} ${event.website}`);
  if (event.tracks) console.log(`   ${BOLD}Tracks:${RESET}  ${event.tracks.join(', ')}`);
  console.log(`   ${BOLD}Pair:${RESET}    ${opts.pairCode}`);

  console.log(`\n${CYAN}📡 Submitting event...${RESET}`);
  const res = await fetch(opts.eventUrl, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-sync-token': opts.syncToken,
    },
    body: JSON.stringify({ action: 'submit', pairCode: opts.pairCode, event }),
  });
  const json = await res.json().catch(() => null);

  if (json && json.ok) {
    console.log(`\n${GREEN}${BOLD}✓ 已提交到 HackerTrip 草稿箱，平台审核通过后上架。${RESET}`);
    if (json.id) console.log(`   ${DIM}Draft id: ${json.id}${RESET}`);
    if (json.status) console.log(`   ${DIM}Status: ${json.status}${RESET}`);
    console.log('');
    return;
  }

  // failure — map known cloud codes to friendly guidance.
  console.log(`\n${RED}${BOLD}✗ 提交失败${RESET}`);
  const code = json && json.code ? json.code : '';
  if (code === 'BAD_PAIR') {
    console.log(`   ${YELLOW}配对码无效或已过期。请在小程序「主办方后台 → 生成提交码」重新生成，再用 --pair-code 传入。${RESET}`);
  } else if (code === 'INVALID_FORM' || code === 'INVALID_FORMAT') {
    console.log(`   ${YELLOW}云端校验未通过：字段缺失或格式不符。请检查 name/city/start/end/website 是否完整、日期为 YYYY-MM-DD 且 start ≤ end、website 以 http(s):// 开头。${RESET}`);
  }
  if (json) {
    if (json.code) console.log(`   ${DIM}Code: ${json.code}${RESET}`);
    if (json.message) console.log(`   ${DIM}Message: ${json.message}${RESET}`);
    if (Array.isArray(json.missing) && json.missing.length) {
      console.log(`   ${DIM}Missing: ${json.missing.join(', ')}${RESET}`);
    }
  } else {
    console.log(`   ${DIM}HTTP ${res.status}${RESET}`);
  }
  console.log('');
  process.exit(1);
}
