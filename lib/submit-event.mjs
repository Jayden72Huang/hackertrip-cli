import { readFile } from 'node:fs/promises';

const RESET = '\x1b[0m';
const BOLD = '\x1b[1m';
const DIM = '\x1b[2m';
const CYAN = '\x1b[36m';
const YELLOW = '\x1b[33m';
const GREEN = '\x1b[32m';
const RED = '\x1b[31m';

// eventSync HTTP 触发器：与小程序 env.js 的 syncUrl 同一云开发环境。
// 主办方从小程序复制的命令里不带地址，所以必须有默认值；HACKERTRIP_EVENT_URL 可覆盖。
const DEFAULT_EVENT_URL = 'https://test-1-d8gn28apcbf409627-1445960691.ap-shanghai.app.tcloudbase.com/eventSync';
const EVENT_URL = process.env.HACKERTRIP_EVENT_URL || DEFAULT_EVENT_URL;
// Token used as x-sync-token / uploadToken（配对码链路）. HACKERTRIP_SYNC_TOKEN is primary;
// HACKERTRIP_EVENT_TOKEN kept as a backward-compatible fallback.
const SYNC_TOKEN = process.env.HACKERTRIP_SYNC_TOKEN || process.env.HACKERTRIP_EVENT_TOKEN || '';
// 主办方编号 + 提交密钥（小程序「发布赛事 → 让 AI 帮我提交」发放，长期有效、可重置）
const ORGANIZER_NO = process.env.HACKERTRIP_ORGANIZER_NO || '';
const SUBMIT_KEY = process.env.HACKERTRIP_SUBMIT_KEY || '';

// 必填口径与云端 eventSync REQUIRED_FIELDS 一致
const REQUIRED = ['name', 'city', 'startDate', 'endDate', 'website'];
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^(?:[01]\d|2[0-3]):[0-5]\d$/;
const URL_RE = /^https?:\/\//i;
const ORGANIZER_NO_RE = /^[A-Z0-9-]{4,20}$/;
const MODES = ['offline', 'online', 'hybrid'];
const CATEGORIES = ['hackathon', 'ai-event', 'incubator'];

// 旧参数名 → 云端字段名。小程序「让 AI 帮我提交」指令直接用云端字段名写 event.json，
// 这些别名只为兼容老文档 / 老脚本，两种写法都能提交。
const ALIASES = {
  start: 'startDate',
  end: 'endDate',
  deadline: 'registrationDeadline',
  prize: 'prizePool',
  organizer: 'organizerName',
  contact: 'contactEmail',
  registration: 'registrationUrl',
};

// 云端 eventSync.normalizeForm 会读取的字段（其余键会被云端丢弃，这里提前提示）
const STRING_FIELDS = [
  'name', 'shortName', 'city', 'country', 'location', 'venueName',
  'mode', 'category',
  'startDate', 'endDate', 'registrationStartDate', 'registrationDeadline',
  'registrationStartTime', 'registrationDeadlineTime', 'startTime', 'endTime',
  'prizePool', 'website', 'registrationUrl', 'registrationQrImage',
  'summary', 'theme', 'cover',
  'contactEmail', 'contactQrImage', 'organizerName', 'organizerContact',
  'guests', 'capacity', 'batch', 'applyRequirement',
];
const NUMBER_FIELDS = ['latitude', 'longitude'];
const LIST_FIELDS = ['tracks', 'techStack', 'tags'];
const OBJECT_FIELDS = ['agenda', 'live'];
const BOOLEAN_FIELDS = ['relayRequested', 'relayConsent'];
const DATE_FIELDS = ['startDate', 'endDate', 'registrationStartDate', 'registrationDeadline'];
const TIME_FIELDS = ['registrationStartTime', 'registrationDeadlineTime', 'startTime', 'endTime'];
// 凭证类键不属于表单，出现在 --from 文件里时静默忽略（凭证只走命令行 / 环境变量）
const CREDENTIAL_KEYS = ['organizerNo', 'submitKey', 'pairCode', 'code', 'key', 'no', 'action'];

// CLI flag -> event field（云端字段名）
const FIELD_FLAGS = {
  '--name': 'name',
  '--city': 'city',
  '--location': 'location',
  '--start': 'startDate',
  '--start-date': 'startDate',
  '--end': 'endDate',
  '--end-date': 'endDate',
  '--deadline': 'registrationDeadline',
  '--website': 'website',
  '--registration-url': 'registrationUrl',
  '--mode': 'mode',
  '--category': 'category',
  '--prize': 'prizePool',
  '--tracks': 'tracks',
  '--summary': 'summary',
  '--cover': 'cover',
  '--organizer': 'organizerName',
  '--contact': 'contactEmail',
};

function parseArgs(args) {
  const opts = {
    eventUrl: EVENT_URL,
    syncToken: SYNC_TOKEN,
    pairCode: '',
    organizerNo: ORGANIZER_NO,
    submitKey: SUBMIT_KEY,
    from: '',
    fields: {},
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    const next = args[i + 1];
    if (arg === '--event-url' && next !== undefined) {
      opts.eventUrl = next;
      i++;
    } else if (arg === '--from' && next !== undefined) {
      opts.from = next;
      i++;
    } else if (arg === '--pair-code' && next !== undefined) {
      opts.pairCode = next;
      i++;
    } else if (arg === '--organizer-no' && next !== undefined) {
      opts.organizerNo = next;
      i++;
    } else if (arg === '--submit-key' && next !== undefined) {
      opts.submitKey = next;
      i++;
    } else if ((arg === '--sync-token' || arg === '--submit-token') && next !== undefined) {
      // --submit-token kept as a backward-compatible alias for --sync-token.
      opts.syncToken = next;
      i++;
    } else if (FIELD_FLAGS[arg] && next !== undefined) {
      opts.fields[FIELD_FLAGS[arg]] = next;
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

// 把 --from + 命令行字段归一成云端口径；返回 { event, notes, unknown }
function buildEvent(fromFields, cliFields) {
  const merged = { ...fromFields, ...cliFields };
  for (const [alias, canonical] of Object.entries(ALIASES)) {
    if (merged[alias] !== undefined && merged[alias] !== '' && (merged[canonical] === undefined || merged[canonical] === '')) {
      merged[canonical] = merged[alias];
    }
    delete merged[alias];
  }

  const event = {};
  const notes = [];
  const unknown = [];

  for (const key of STRING_FIELDS) {
    const v = merged[key];
    if (v !== undefined && v !== null && String(v).trim() !== '') event[key] = String(v).trim();
  }
  for (const key of NUMBER_FIELDS) {
    const n = Number(merged[key]);
    if (merged[key] !== undefined && merged[key] !== '' && Number.isFinite(n)) event[key] = n;
  }
  for (const key of LIST_FIELDS) {
    const list = splitList(merged[key]);
    if (list.length) event[key] = list;
  }
  for (const key of OBJECT_FIELDS) {
    const v = merged[key];
    if (v && typeof v === 'object') event[key] = v;
  }
  for (const key of BOOLEAN_FIELDS) {
    if (typeof merged[key] === 'boolean') event.live = { ...event.live, [key]: merged[key] };
  }
  if (merged.relaySignalType !== undefined) event.live = { ...event.live, relaySignalType: merged.relaySignalType };

  // 官网缺、报名链接有：云端 website 必填，用报名链接顶上（小程序表单也是这么展示的）
  if (!event.website && event.registrationUrl) {
    event.website = event.registrationUrl;
    notes.push('website 未填，已用 registrationUrl 代替');
  }

  const known = new Set([...STRING_FIELDS, ...NUMBER_FIELDS, ...LIST_FIELDS, ...OBJECT_FIELDS, ...BOOLEAN_FIELDS, 'relaySignalType', ...CREDENTIAL_KEYS]);
  for (const key of Object.keys(merged)) {
    if (!known.has(key)) unknown.push(key);
  }

  return { event, notes, unknown };
}

function isRealDate(value) {
  if (!DATE_RE.test(value)) return false;
  const [y, m, d] = value.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
}

// Local format self-check. Returns a list of human-readable problems (empty = ok).
function checkEvent(event) {
  const problems = [];

  for (const key of REQUIRED) {
    if (!event[key]) problems.push(`缺少必填字段：${key}`);
  }
  for (const key of DATE_FIELDS) {
    if (event[key] && !isRealDate(event[key])) {
      problems.push(`${key} 应为真实存在的 YYYY-MM-DD 日期（当前：${event[key]}）`);
    }
  }
  for (const key of TIME_FIELDS) {
    if (event[key] && !TIME_RE.test(event[key])) {
      problems.push(`${key} 应为 HH:mm（当前：${event[key]}）`);
    }
  }
  if (isRealDate(event.startDate || '') && isRealDate(event.endDate || '') && event.startDate > event.endDate) {
    problems.push(`startDate 不能晚于 endDate（${event.startDate} > ${event.endDate}）`);
  }
  if (event.website && !URL_RE.test(event.website)) {
    problems.push(`website 必须以 http:// 或 https:// 开头（当前：${event.website}）`);
  }
  if (event.registrationUrl && !URL_RE.test(event.registrationUrl)) {
    problems.push(`registrationUrl 必须以 http:// 或 https:// 开头（当前：${event.registrationUrl}）`);
  }
  if (event.mode && !MODES.includes(event.mode)) {
    problems.push(`mode 只能是 ${MODES.join(' / ')}（当前：${event.mode}）`);
  }
  if (event.category && !CATEGORIES.includes(event.category)) {
    problems.push(`category 只能是 ${CATEGORIES.join(' / ')}（当前：${event.category}）`);
  }
  if (event.live?.relaySignalType !== undefined && !['meeting', 'director'].includes(event.live.relaySignalType)) {
    problems.push('relaySignalType 只能是 meeting / director');
  }

  return problems;
}

function fail(lines) {
  console.log('');
  for (const line of lines) console.log(line);
  console.log('');
  process.exit(1);
}

export async function submitEvent(args) {
  const opts = parseArgs(args);

  // 1) 凭证：优先主办方编号 + 提交密钥（长期有效）；否则回落到一次性配对码 + uploadToken
  const organizerNo = String(opts.organizerNo || '').trim().toUpperCase();
  const submitKey = String(opts.submitKey || '').trim();
  const useCred = Boolean(organizerNo && submitKey);
  if (!useCred) {
    if (organizerNo || submitKey) {
      fail([
        `${RED}${BOLD}✗ 主办方编号和提交密钥要一起传${RESET}`,
        `${DIM}--organizer-no HT-XXXXXX --submit-key <密钥>；两者都在小程序「发布赛事 → 让 AI 帮我提交」里复制。${RESET}`,
      ]);
    }
    if (!opts.pairCode) {
      fail([
        `${RED}${BOLD}✗ 缺少提交凭证${RESET}`,
        `${DIM}推荐：打开 HackerTrip 小程序 → 发布赛事 → 让 AI 帮我提交，复制带 --organizer-no / --submit-key 的命令。${RESET}`,
        `${DIM}或者：主办方后台 → 生成提交码，再用 --pair-code <6位码> 传入（一次性）。${RESET}`,
      ]);
    }
    if (!/^\d{6}$/.test(opts.pairCode)) {
      fail([`${YELLOW}配对码格式错误，应为 6 位数字。${RESET}`]);
    }
    if (!opts.syncToken) {
      fail([
        `${YELLOW}缺少同步密钥。${RESET}`,
        `${DIM}配对码链路需要 HACKERTRIP_SYNC_TOKEN（或 --sync-token）传入配对生成的 uploadToken；${RESET}`,
        `${DIM}用主办方编号 + 提交密钥则不需要。${RESET}`,
      ]);
    }
  } else if (!ORGANIZER_NO_RE.test(organizerNo)) {
    fail([`${YELLOW}主办方编号格式错误（当前：${organizerNo}），应形如 HT-XXXXXX，请从小程序重新复制。${RESET}`]);
  }

  let fromFields = {};
  if (opts.from) {
    let content;
    try {
      content = await readFile(opts.from, 'utf-8');
    } catch {
      fail([`${YELLOW}无法读取 --from 文件：${opts.from}${RESET}`]);
    }
    fromFields = parseFromFile(content);
  }

  const { event, notes, unknown } = buildEvent(fromFields, opts.fields);

  // 2) Local format self-check — list every problem, do not send the request.
  const problems = checkEvent(event);
  if (problems.length) {
    console.log(`\n${RED}${BOLD}✗ 本地格式自检未通过：${RESET}`);
    for (const p of problems) console.log(`   ${RED}•${RESET} ${p}`);
    console.log(`${DIM}必填字段：${REQUIRED.join(', ')}；日期 YYYY-MM-DD 且 startDate ≤ endDate；时刻 HH:mm；website 以 http(s):// 开头。${RESET}`);
    console.log(`${DIM}可用 --name/--city/--start/--end/--website 逐字段传入，或用 --from <file> 从 JSON / key:value 文件读取。${RESET}\n`);
    process.exit(1);
  }

  if (!opts.eventUrl) {
    fail([`${YELLOW}缺少提交地址。请设置 HACKERTRIP_EVENT_URL 或通过 --event-url <url> 传入 eventSync 地址。${RESET}`]);
  }

  console.log(`\n${CYAN}${BOLD}📋 Event${RESET}`);
  console.log(`${DIM}${'─'.repeat(50)}${RESET}`);
  console.log(`   ${BOLD}Name:${RESET}     ${event.name}`);
  console.log(`   ${BOLD}City:${RESET}     ${event.city}${event.location ? `  ${DIM}${event.location}${RESET}` : ''}`);
  console.log(`   ${BOLD}Dates:${RESET}    ${event.startDate} – ${event.endDate}`);
  if (event.registrationDeadline) console.log(`   ${BOLD}Deadline:${RESET} ${event.registrationDeadline}`);
  console.log(`   ${BOLD}Website:${RESET}  ${event.website}`);
  if (event.registrationUrl && event.registrationUrl !== event.website) console.log(`   ${BOLD}Signup:${RESET}   ${event.registrationUrl}`);
  if (event.tracks) console.log(`   ${BOLD}Tracks:${RESET}   ${event.tracks.join(', ')}`);
  if (event.category && event.category !== 'hackathon') console.log(`   ${BOLD}Category:${RESET} ${event.category}`);
  console.log(`   ${BOLD}Auth:${RESET}     ${useCred ? `主办方编号 ${organizerNo}` : `配对码 ${opts.pairCode}`}`);
  for (const n of notes) console.log(`   ${YELLOW}• ${n}${RESET}`);
  if (unknown.length) console.log(`   ${YELLOW}• 已忽略云端不识别的字段：${unknown.join(', ')}${RESET}`);

  console.log(`\n${CYAN}📡 Submitting event...${RESET}`);
  const headers = { 'content-type': 'application/json' };
  const body = { action: 'submit', event };
  if (useCred) {
    body.organizerNo = organizerNo;
    body.submitKey = submitKey;
  } else {
    body.pairCode = opts.pairCode;
    headers['x-sync-token'] = opts.syncToken;
  }

  let res;
  let json = null;
  try {
    res = await fetch(opts.eventUrl, { method: 'POST', headers, body: JSON.stringify(body), signal: AbortSignal.timeout(30000) });
    json = await res.json().catch(() => null);
  } catch (e) {
    fail([`${RED}${BOLD}✗ 提交失败${RESET}`, `   ${DIM}网络错误：${e.message}${RESET}`]);
  }

  if (res.ok && json && json.ok) {
    if (json.status !== 'pending_submission') fail([`${YELLOW}服务器返回的状态不是待提交（${json.status || '未知'}，草稿 ${json.id || '未知'}），请先查询并核对；不要重复上传。${RESET}`]);
    console.log(`\n${GREEN}${BOLD}✓ 已保存到 HackerTrip 草稿箱${RESET}`);
    if (json.id) console.log(`   ${DIM}Draft id: ${json.id}${RESET}`);
    if (json.status) console.log(`   ${DIM}Status: ${json.status}${RESET}`);
    console.log(`   ${DIM}状态为「待提交」。回到小程序「赛事&项目管理」查看、编辑并保存，确认无误后由主办方提交平台审核。${RESET}`);
    console.log('');
    return;
  }

  // failure — map known cloud codes to friendly guidance.
  console.log(`\n${RED}${BOLD}✗ 提交失败${RESET}`);
  const code = json && json.code ? json.code : '';
  const HINTS = {
    BAD_PAIR: '配对码无效或已过期。请在小程序「主办方后台 → 生成提交码」重新生成，再用 --pair-code 传入。',
    BAD_ORGANIZER_NO: '主办方编号无效，或该主办方尚未通过认证。请在小程序「发布赛事 → 让 AI 帮我提交」重新复制命令。',
    BAD_SUBMIT_KEY: '提交密钥不正确或已被重置。请在小程序「发布赛事 → 让 AI 帮我提交」重新复制命令。',
    NOT_ORGANIZER: '需先在小程序通过组织者认证后再提交赛事。',
    CATEGORY_FORBIDDEN: 'AI活动 / AI孵化 品类仅对精选主办方开放；改 category 为 hackathon，或联系 HackerTrip 团队开通。',
    INVALID_FORM: '云端校验未通过：必填字段缺失。请检查 name/city/startDate/endDate/website。',
    INVALID_FORMAT: '云端校验未通过：字段格式不符。',
    CONTENT_RISKY: '内容未通过微信内容安全检测，请修改文案后重试。',
    SECURITY_CHECK_FAILED: '微信内容安全检测调用失败，请稍后重试。',
    FEATURED_CHECK_FAILED: '网络繁忙，请稍后重试。',
  };
  if (HINTS[code]) console.log(`   ${YELLOW}${HINTS[code]}${RESET}`);
  if (json) {
    if (json.code) console.log(`   ${DIM}Code: ${json.code}${RESET}`);
    if (json.message) console.log(`   ${DIM}Message: ${json.message}${RESET}`);
    if (Array.isArray(json.missing) && json.missing.length) console.log(`   ${DIM}Missing: ${json.missing.join(', ')}${RESET}`);
    if (Array.isArray(json.errors) && json.errors.length) {
      for (const e of json.errors) console.log(`   ${RED}•${RESET} ${e}`);
    }
  } else {
    console.log(`   ${DIM}HTTP ${res ? res.status : '?'}${RESET}`);
  }
  console.log('');
  process.exit(1);
}
