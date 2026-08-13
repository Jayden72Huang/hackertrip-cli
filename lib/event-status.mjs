const EVENT_URL = process.env.HACKERTRIP_EVENT_URL || '';
const SYNC_TOKEN = process.env.HACKERTRIP_SYNC_TOKEN || '';
const PAIR_CODE = process.env.HACKERTRIP_SYNC_CODE || '';

const C = '\x1b[36m';
const B = '\x1b[1m';
const D = '\x1b[2m';
const Y = '\x1b[33m';
const G = '\x1b[32m';
const RD = '\x1b[31m';
const R = '\x1b[0m';

const STATUS_STYLE = {
  pending_manual_review: { color: Y, icon: '⏳' },
  approved: { color: G, icon: '✅' },
  published: { color: G, icon: '🚀' },
  rejected: { color: RD, icon: '❌' },
};

function parseArgs(args) {
  const opts = {
    pairCode: PAIR_CODE,
    eventUrl: EVENT_URL,
    syncToken: SYNC_TOKEN,
  };
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--pair-code' && args[i + 1]) {
      opts.pairCode = args[i + 1];
      i++;
    } else if (args[i] === '--event-url' && args[i + 1]) {
      opts.eventUrl = args[i + 1];
      i++;
    } else if (args[i] === '--sync-token' && args[i + 1]) {
      opts.syncToken = args[i + 1];
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

  if (!/^\d{6}$/.test(opts.pairCode || '')) {
    console.log(`\n${Y}缺少配对码。${R}`);
    console.log(`${D}在小程序「主办方后台 → 生成提交码」生成 6 位码，然后：${R}`);
    console.log(`${D}  hackertrip event-status --pair-code 482915${R}\n`);
    process.exit(1);
  }
  if (!opts.eventUrl) {
    console.log(`\n${Y}缺少接口地址。${R}`);
    console.log(`${D}请设置 HACKERTRIP_EVENT_URL 或通过 --event-url <url> 传入 eventSync 地址。${R}\n`);
    process.exit(1);
  }
  if (!opts.syncToken) {
    console.log(`\n${Y}缺少提交凭证。${R}`);
    console.log(`${D}请设置 HACKERTRIP_SYNC_TOKEN 或通过 --sync-token <token> 传入小程序配对生成的 uploadToken。${R}\n`);
    process.exit(1);
  }

  console.log(`\n${C}📡 查询你提交的赛事审核状态...${R}`);

  let json = null;
  try {
    const res = await fetch(opts.eventUrl, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-sync-token': opts.syncToken,
      },
      body: JSON.stringify({ action: 'status', pairCode: opts.pairCode }),
    });
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
    console.log(`${D}该账号还没有提交过赛事。用 hackertrip submit-event 提交第一个吧。${R}\n`);
    return;
  }

  console.log(`${D}共 ${items.length} 条提交记录（最新在前）${R}\n`);
  for (const item of items) {
    const style = STATUS_STYLE[item.status] || { color: D, icon: '•' };
    console.log(`${style.icon} ${B}${item.name || '(未命名)'}${R}`);
    console.log(`   状态: ${style.color}${item.statusText || item.status}${R}   提交: ${D}${formatDate(item.submittedAt)}${R}`);
    if (Array.isArray(item.missing) && item.missing.length) {
      console.log(`   ${Y}待补充: ${item.missing.join(', ')}${R}`);
    }
    if (item.note) {
      console.log(`   ${D}备注: ${item.note}${R}`);
    }
    console.log('');
  }
  console.log(`${D}审核通过后会自动上架 hackertrip.space 网站与小程序赛事列表。${R}\n`);
}
