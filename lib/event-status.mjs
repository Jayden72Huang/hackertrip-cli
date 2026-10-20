// 与 submit-event 共用同一 eventSync 入口；凭证同样优先主办方编号 + 提交密钥，回落到配对码。
const DEFAULT_EVENT_URL = 'https://test-1-d8gn28apcbf409627-1445960691.ap-shanghai.app.tcloudbase.com/eventSync';
const EVENT_URL = process.env.HACKERTRIP_EVENT_URL || DEFAULT_EVENT_URL;
const SYNC_TOKEN = process.env.HACKERTRIP_SYNC_TOKEN || '';
const PAIR_CODE = process.env.HACKERTRIP_SYNC_CODE || '';
const ORGANIZER_NO = process.env.HACKERTRIP_ORGANIZER_NO || '';
const SUBMIT_KEY = process.env.HACKERTRIP_SUBMIT_KEY || '';

const C = '\x1b[36m';
const B = '\x1b[1m';
const D = '\x1b[2m';
const Y = '\x1b[33m';
const G = '\x1b[32m';
const RD = '\x1b[31m';
const R = '\x1b[0m';

const STATUS_STYLE = {
  pending_submission: { color: Y, icon: '📝' },
  pending_review: { color: Y, icon: '⏳' },
  pending_manual_review: { color: Y, icon: '⏳' },
  security_review: { color: Y, icon: '🔍' },
  approved: { color: G, icon: '✅' },
  published: { color: G, icon: '🚀' },
  rejected: { color: RD, icon: '❌' },
};

function parseArgs(args) {
  const opts = {
    pairCode: PAIR_CODE,
    eventUrl: EVENT_URL,
    syncToken: SYNC_TOKEN,
    organizerNo: ORGANIZER_NO,
    submitKey: SUBMIT_KEY,
  };
  for (let i = 0; i < args.length; i++) {
    const next = args[i + 1];
    if (args[i] === '--pair-code' && next) {
      opts.pairCode = next;
      i++;
    } else if (args[i] === '--organizer-no' && next) {
      opts.organizerNo = next;
      i++;
    } else if (args[i] === '--submit-key' && next) {
      opts.submitKey = next;
      i++;
    } else if (args[i] === '--event-url' && next) {
      opts.eventUrl = next;
      i++;
    } else if (args[i] === '--sync-token' && next) {
      opts.syncToken = next;
      i++;
    }
  }
  return opts;
}

function formatDate(ts) {
  if (!ts) return '-';
  const d = new Date(ts);
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export async function eventStatus(args) {
  const opts = parseArgs(args);
  const organizerNo = String(opts.organizerNo || '').trim().toUpperCase();
  const submitKey = String(opts.submitKey || '').trim();
  const useCred = Boolean(organizerNo && submitKey);
  if (!useCred && (organizerNo || submitKey)) {
    console.log(`\n${Y}主办方编号和提交密钥要一起传。${R}\n`);
    process.exit(1);
  }

  if (!useCred) {
    if (!/^\d{6}$/.test(opts.pairCode || '')) {
      console.log(`\n${Y}缺少凭证。${R}`);
      console.log(`${D}推荐：小程序「发布赛事 → 让 AI 帮我提交」复制编号和密钥，然后：${R}`);
      console.log(`${D}  npx hackertrip event-status --organizer-no HT-XXXXXX --submit-key <密钥>${R}`);
      console.log(`${D}或用「主办方后台 → 生成提交码」的 6 位码：--pair-code 482915（需配 HACKERTRIP_SYNC_TOKEN）${R}\n`);
      process.exit(1);
    }
    if (!opts.syncToken) {
      console.log(`\n${Y}缺少提交凭证。${R}`);
      console.log(`${D}配对码链路需要 HACKERTRIP_SYNC_TOKEN 或 --sync-token <token>；用主办方编号 + 提交密钥则不需要。${R}\n`);
      process.exit(1);
    }
  }
  if (!opts.eventUrl) {
    console.log(`\n${Y}缺少接口地址。${R}`);
    console.log(`${D}请设置 HACKERTRIP_EVENT_URL 或通过 --event-url <url> 传入 eventSync 地址。${R}\n`);
    process.exit(1);
  }

  console.log(`\n${C}📡 查询你提交的赛事审核状态...${R}`);

  const headers = { 'content-type': 'application/json' };
  const body = { action: 'status' };
  if (useCred) {
    body.organizerNo = organizerNo;
    body.submitKey = submitKey;
  } else {
    body.pairCode = opts.pairCode;
    headers['x-sync-token'] = opts.syncToken;
  }

  let json = null;
  try {
    const res = await fetch(opts.eventUrl, { method: 'POST', headers, body: JSON.stringify(body), signal: AbortSignal.timeout(30000) });
    json = await res.json().catch(() => null);
    if (!res.ok || !json) {
      throw new Error(`HTTP ${res.status}`);
    }
  } catch (e) {
    console.log(`${RD}查询失败：${e.message}${R}\n`);
    process.exit(1);
  }

  if (!json.ok) {
    console.log(`${RD}查询失败：${json.message || json.code || '未知错误'}${R}\n`);
    process.exit(1);
  }

  const items = Array.isArray(json.items) ? json.items : [];
  if (!items.length) {
    console.log(`${D}该账号还没有提交过赛事。用 npx hackertrip submit-event 提交第一个吧。${R}\n`);
    return;
  }

  console.log(`${D}共 ${items.length} 条提交记录（最新在前）${R}\n`);
  for (const item of items) {
    const style = STATUS_STYLE[item.status] || { color: D, icon: '•' };
    console.log(`${style.icon} ${B}${item.name || '(未命名)'}${R}`);
    if (item.id) console.log(`   ID: ${D}${item.id}${R}`);
    console.log(`   状态: ${style.color}${item.statusText || item.status}${R}   提交: ${D}${formatDate(item.submittedAt)}${R}`);
    if (Array.isArray(item.missing) && item.missing.length) {
      console.log(`   ${Y}待补充: ${item.missing.join(', ')}${R}`);
    }
    if (item.note) {
      console.log(`   ${D}备注: ${item.note}${R}`);
    }
    console.log('');
  }
  console.log(`${D}在小程序「我的 → 我要举办 → 赛事管理」核对内容；是否公开以平台审核和实际上架状态为准。${R}\n`);
}
