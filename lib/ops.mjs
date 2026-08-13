// hackertrip ops —— 运营内部命令：审核 / 查数 / 修数。
// 走 opsReviewSync 云函数的 HTTP 触发器，鉴权用 OPS_SYNC_TOKEN（环境变量 HACKERTRIP_OPS_TOKEN）。
// 仅限持有运营密钥的人使用；普通用户没有 token，命令直接报 UNAUTHORIZED。

const RESET = '\x1b[0m';
const BOLD = '\x1b[1m';
const DIM = '\x1b[2m';
const CYAN = '\x1b[36m';
const YELLOW = '\x1b[33m';
const GREEN = '\x1b[32m';
const RED = '\x1b[31m';

const OPS_URL = process.env.HACKERTRIP_OPS_URL
  || 'https://test-1-d8gn28apcbf409627.service.tcloudbase.com/opsReviewSync';
const OPS_TOKEN = process.env.HACKERTRIP_OPS_TOKEN || '';

const DRAFT_STATUS_TEXT = {
  pending_review: '待审核',
  pending_manual_review: '待人工审核',
  security_review: '安全复核中',
  security_rejected: '安全未过',
  rejected: '已拒绝',
  resubmitted: '已重新提交',
  approved: '已通过',
};

function fmtTime(ms) {
  if (!ms) return '-';
  const d = new Date(ms + 8 * 3600 * 1000);
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getUTCMonth() + 1}-${p(d.getUTCDate())} ${p(d.getUTCHours())}:${p(d.getUTCMinutes())}`;
}

async function call(payload, opts) {
  const token = (opts && opts.token) || OPS_TOKEN;
  const url = (opts && opts.url) || OPS_URL;
  if (!token) {
    throw new Error('缺少运营密钥：请设置环境变量 HACKERTRIP_OPS_TOKEN（即云端 OPS_SYNC_TOKEN），或传 --token <token>');
  }
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-ops-token': token },
    body: JSON.stringify(payload),
  });
  const json = await res.json().catch(() => null);
  if (!json) throw new Error(`响应不是 JSON（HTTP ${res.status}）`);
  if (!json.ok) throw new Error(`${json.code || 'ERROR'}: ${json.message || '未知错误'}`);
  return json;
}

function parseCommonFlags(args) {
  const opts = { token: OPS_TOKEN, url: OPS_URL, rest: [], reason: '', sets: {}, organizer: false };
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === '--token' && args[i + 1] !== undefined) { opts.token = args[++i]; continue; }
    if (a === '--url' && args[i + 1] !== undefined) { opts.url = args[++i]; continue; }
    if ((a === '-r' || a === '--reason') && args[i + 1] !== undefined) { opts.reason = args[++i]; continue; }
    if (a === '--organizer') { opts.organizer = true; continue; }
    if (a === '--set' && args[i + 1] !== undefined) {
      const kv = args[++i];
      const eq = kv.indexOf('=');
      if (eq > 0) opts.sets[kv.slice(0, eq)] = kv.slice(eq + 1);
      continue;
    }
    opts.rest.push(a);
  }
  return opts;
}

/* ---------- 子命令 ---------- */

// 待审队列：草稿 + 组织者申请（export 全量拉回来本地过滤）
async function cmdList(opts) {
  console.log(`${DIM}拉取待审队列…${RESET}`);
  const data = await call({ action: 'export' }, opts);
  const drafts = (data.drafts || []).filter((d) =>
    ['pending_review', 'pending_manual_review', 'security_review'].includes(d.status));
  const organizers = (data.organizers || []).filter((o) =>
    ['pending', 'security_review'].includes(o.status));

  console.log(`\n${BOLD}待审赛事草稿（${drafts.length}）${RESET}`);
  if (!drafts.length) console.log(`${DIM}  （空）${RESET}`);
  drafts.forEach((d) => {
    console.log(`  ${CYAN}${d._id}${RESET}  ${BOLD}${d.name || '(未命名)'}${RESET}`);
    console.log(`    ${DIM}${DRAFT_STATUS_TEXT[d.status] || d.status} · ${d.city || '-'} · ${d.startDate || '?'}~${d.endDate || '?'} · ${d.organizerName || '-'} · 提交 ${fmtTime(d.submittedAt)}${RESET}`);
  });

  console.log(`\n${BOLD}待审组织者申请（${organizers.length}）${RESET}`);
  if (!organizers.length) console.log(`${DIM}  （空）${RESET}`);
  organizers.forEach((o) => {
    console.log(`  ${CYAN}${o._id}${RESET}  ${BOLD}${o.orgName || '(未命名)'}${RESET}  ${DIM}${o.status} · ${o.contact || o.website || '-'} · 提交 ${fmtTime(o.submittedAt)}${RESET}`);
  });

  console.log(`\n${DIM}过审：hackertrip ops approve <id> [--organizer]   拒绝：hackertrip ops reject <id> -r "原因" [--organizer]${RESET}`);
}

async function cmdDecide(decision, opts) {
  const id = opts.rest[0];
  if (!id) throw new Error(`缺少 id：hackertrip ops ${decision} <draftId|applicationId> [--organizer] [-r 原因]`);
  const kind = opts.organizer ? 'organizer' : 'draft';
  const item = { kind, id, decision, reason: opts.reason };
  console.log(`${DIM}${decision === 'approve' ? '过审' : '拒绝'} ${kind} ${id} …${RESET}`);
  const data = await call({ action: 'apply', items: [item] }, opts);
  const r = (data.results || [])[0] || {};
  if (r.ok) {
    const pubId = r.result && r.result.id ? `  →  ${r.result.id}` : '';
    console.log(`${GREEN}✅ ${decision === 'approve' ? '已通过' : '已拒绝'}${pubId}${RESET}`);
    if (decision === 'approve' && kind === 'draft') {
      console.log(`${DIM}   已发布到赛事列表（含发布自检），订阅了通知的主办方会收到推送。${RESET}`);
    }
  } else {
    throw new Error((r.result && r.result.message) || r.message || '操作失败');
  }
}

async function cmdGet(opts) {
  const id = opts.rest[0];
  if (!id) throw new Error('缺少赛事 id：hackertrip ops get <hackathonId>');
  const data = await call({ action: 'getHackathon', id }, opts);
  console.log(JSON.stringify(data.doc, null, 2));
}

async function cmdFind(opts) {
  const keyword = opts.rest.join(' ');
  if (!keyword) throw new Error('缺少关键词：hackertrip ops find <关键词>');
  const data = await call({ action: 'findHackathons', keyword }, opts);
  console.log(`\n${BOLD}命中 ${data.count} 条${RESET}`);
  (data.list || []).forEach((d) => {
    const pub = d.isPublished === false ? `${YELLOW}未上架${RESET}` : `${GREEN}已上架${RESET}`;
    console.log(`  ${CYAN}${d.id}${RESET}  ${BOLD}${d.name}${RESET}  ${pub}  ${DIM}${d.startDate || '?'} · ${d.registrationUrl || d.website || '-'}${RESET}`);
  });
}

async function cmdFix(opts) {
  const id = opts.rest[0];
  const keys = Object.keys(opts.sets);
  if (!id || !keys.length) {
    throw new Error('用法：hackertrip ops fix <hackathonId> --set 字段=值 [--set 字段=值 …]\n仅支持白名单展示/报名字段（website/registrationUrl/registrationQrImage/registrationDeadline/summary/location/prizePool/theme 等）');
  }
  console.log(`${DIM}更新 ${id}：${keys.join(', ')} …${RESET}`);
  const data = await call({ action: 'updateHackathon', id, fields: opts.sets }, opts);
  console.log(`${GREEN}✅ 已更新字段：${(data.updated || []).join(', ')}${RESET}`);
}

function printOpsHelp() {
  console.log(`
${CYAN}${BOLD}hackertrip ops${RESET}  ${DIM}— 运营内部命令（需 HACKERTRIP_OPS_TOKEN）${RESET}

${BOLD}USAGE${RESET}
  hackertrip ops <subcommand> [options]

${BOLD}SUBCOMMANDS${RESET}
  ${CYAN}list${RESET}                       待审队列（赛事草稿 + 组织者申请）
  ${CYAN}approve <id>${RESET}               过审草稿（--organizer 则过审组织者申请）
  ${CYAN}reject <id> -r "原因"${RESET}      拒绝草稿（--organizer 则拒绝组织者申请）
  ${CYAN}get <hackathonId>${RESET}          按业务 id 查看已发布赛事完整记录
  ${CYAN}find <关键词>${RESET}              按名称模糊搜索赛事
  ${CYAN}fix <id> --set k=v${RESET}         定向修改赛事白名单字段（可多个 --set）

${BOLD}OPTIONS${RESET}
  --token <token>            运营密钥（env HACKERTRIP_OPS_TOKEN，即云端 OPS_SYNC_TOKEN）
  --url <url>                opsReviewSync HTTP 地址（env HACKERTRIP_OPS_URL，有默认值）

${BOLD}EXAMPLES${RESET}
  hackertrip ops list
  hackertrip ops approve 9b54dbe16a7d…
  hackertrip ops reject 9b54dbe16a7d… -r "封面不清晰，请更换后重新提交"
  hackertrip ops find 贵州
  hackertrip ops fix ht-eonverax-builder-688fb5e6 --set registrationDeadline=2026-09-01
`);
}

export async function opsCommand(args) {
  const sub = args[0];
  const opts = parseCommonFlags(args.slice(1));
  switch (sub) {
    case 'list': return cmdList(opts);
    case 'approve': return cmdDecide('approve', opts);
    case 'reject': return cmdDecide('reject', opts);
    case 'get': return cmdGet(opts);
    case 'find': return cmdFind(opts);
    case 'fix': return cmdFix(opts);
    case 'help':
    case undefined:
      return printOpsHelp();
    default:
      console.log(`${RED}未知子命令：${sub}${RESET}`);
      return printOpsHelp();
  }
}
