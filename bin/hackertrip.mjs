#!/usr/bin/env node

import { scanProject } from '../lib/scan.mjs';
import { fetchHackathons } from '../lib/fetch-hackathons.mjs';
import { matchHackathons } from '../lib/match.mjs';
import { display, displayProjectInfo } from '../lib/display.mjs';
import { publishWork } from '../lib/publish-work.mjs';
import { submitEvent } from '../lib/submit-event.mjs';
import { installSkills } from '../lib/install-skills.mjs';
import { eventStatus } from '../lib/event-status.mjs';
import { opsCommand } from '../lib/ops.mjs';
import { login, readConfig } from '../lib/login.mjs';
import { randomInt } from 'node:crypto';

const API_URL = process.env.HACKERTRIP_API || 'https://hackertrip.space/api/match';
const DEFAULT_SYNC_URL = 'https://test-1-d8gn28apcbf409627-1445960691.ap-shanghai.app.tcloudbase.com/pairSync';
// login 之后凭证落在 ~/.hackertrip/config.json，优先级低于显式环境变量
const SAVED = readConfig();
const SYNC_URL = process.env.HACKERTRIP_SYNC_URL || SAVED.syncUrl || DEFAULT_SYNC_URL;
const SYNC_TOKEN = process.env.HACKERTRIP_SYNC_TOKEN || SAVED.uploadToken || '';
const SYNC_CODE = process.env.HACKERTRIP_SYNC_CODE || '';
// 扫码绑定拿到的长期会话；有它就不需要一次性配对码
const SYNC_SESSION = process.env.HACKERTRIP_SYNC_SESSION || SAVED.sessionToken || '';

const KNOWN_COMMANDS = ['login', 'match', 'publish-work', 'submit-event', 'event-status', 'event', 'install-skills', 'ops', 'help'];

function parseMatchArgs(args) {
  let projectPath = process.cwd();
  let sync = false;
  let syncUrl = SYNC_URL;
  let syncToken = SYNC_TOKEN;
  let syncCode = SYNC_CODE;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--path' && args[i + 1]) {
      projectPath = args[i + 1];
      i++;
    } else if (args[i] === '--sync') {
      sync = true;
    } else if (args[i] === '--sync-url' && args[i + 1]) {
      syncUrl = args[i + 1];
      i++;
    } else if (args[i] === '--sync-token' && args[i + 1]) {
      syncToken = args[i + 1];
      i++;
    } else if (args[i] === '--sync-code' && args[i + 1]) {
      syncCode = args[i + 1];
      i++;
    } else if (!args[i].startsWith('-')) {
      projectPath = args[i];
    }
  }

  return { projectPath, sync, syncUrl, syncToken, syncCode, syncSession: SYNC_SESSION };
}

function makePairCode() {
  return String(randomInt(0, 1000000)).padStart(6, '0');
}

function buildSyncPayload(project, matches, pairCode) {
  const techStack = Array.isArray(project.techStack) ? project.techStack : [];
  const topMatches = matches.slice(0, 5).map((item) => ({
    id: item.id,
    name: item.name || item.shortName || item.id,
    score: item.score || 0,
    reason: Array.isArray(item.matchReasons) ? item.matchReasons.join(', ') : '',
    bestTrack: item.bestTrack || '',
  }));

  return {
    action: 'push',
    pairCode,
    scan: {
      syncedAt: Date.now(),
      source: 'hackertrip-cli',
      project: {
        name: project.name || 'Local project',
        summary: project.description || '由 HackerTrip CLI 扫描生成的项目画像',
        description: project.description || '',
        techStack,
        keywords: Array.isArray(project.keywords) ? project.keywords : [],
      },
      identity: {
        techStack,
        playStyle: techStack.some((t) => /AI|LLM|Agent/i.test(t)) ? 'ai_native' : 'ship_fast',
        lookingFor: 'team_up',
        projects: 1,
        hackathons: 0,
        awards: 0,
      },
      matches: topMatches,
    },
    card: {
      id: `cli-card-${pairCode}`,
      variant: 'identity',
      role: techStack.some((t) => /AI|LLM|Agent/i.test(t)) ? 'model_alchemist' : 'zero_to_one',
      techStack,
      aiTools: techStack.filter((t) => /AI|LLM|Agent|Claude|OpenAI/i.test(t)),
      projects: 1,
      hackathons: 0,
      awards: 0,
    },
  };
}

async function pushToMiniProgram(project, matches, syncUrl, syncToken, syncCode, syncSession) {
  if (!syncUrl) {
    console.log('\n\x1b[33m同步地址缺失。设置 HACKERTRIP_SYNC_URL 或用 --sync-url <url> 指定。\x1b[0m');
    return;
  }
  if (!syncToken) {
    console.log('\n\x1b[33m还没有连接小程序。\x1b[0m');
    console.log('\x1b[2m先运行一次 \x1b[0m\x1b[1mhackertrip login\x1b[0m\x1b[2m 扫码绑定，之后同步不用再输任何东西。\x1b[0m\n');
    return;
  }

  // 扫码绑定过就走长期会话：不用每次生成配对码，也不用回小程序手动拉取
  const useSession = /^[0-9a-f]{24}$/.test(syncSession || '');
  const pairCode = useSession ? '' : (syncCode || makePairCode());
  if (!useSession && !/^\d{6}$/.test(pairCode)) {
    throw new Error('配对码必须是小程序生成的 6 位数字。');
  }

  const payload = buildSyncPayload(project, matches, pairCode || 'session');
  // 顺带把这台机器的协作数据推上去，小程序「桌面端 CLI 协作」卡读它。
  // 采集失败不影响同步本身——匹配结果才是这条命令的主产物。
  try {
    const { collectProcessStats } = await import('../lib/process-stats.mjs');
    const stats = await collectProcessStats(process.cwd());
    if (stats) payload.processStats = stats;
  } catch (_) { /* 没有 git 或没有 Claude 日志时拿不到，静默跳过 */ }
  // 设备画像随同步补写：login 之前绑的老会话靠这个把机器信息补上
  try {
    const { describeDevice } = await import('../lib/login.mjs');
    payload.device = describeDevice();
  } catch (_) { /* 拿不到就算了，不影响同步 */ }
  if (useSession) {
    payload.sessionToken = syncSession;
    delete payload.pairCode;
  }

  const res = await fetch(syncUrl, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-sync-token': syncToken,
    },
    body: JSON.stringify(payload),
  });
  const json = await res.json().catch(() => null);
  const result = json && json.result ? json.result : json;
  if (!res.ok || !result || !result.ok) {
    const message = result && result.message ? result.message : `HTTP ${res.status}`;
    // 绑定失效是最常见的失败，直接告诉用户怎么恢复，而不是甩一句错误码
    if (result && /SESSION_(NOT_FOUND|EXPIRED|UNCLAIMED)/.test(result.code || '')) {
      console.log(`\n\x1b[33m${message}\x1b[0m`);
      console.log('\x1b[2m运行 \x1b[0m\x1b[1mhackertrip login\x1b[0m\x1b[2m 重新扫码连接。\x1b[0m\n');
      return;
    }
    throw new Error(`同步失败：${message}`);
  }

  if (useSession) {
    console.log('\n\x1b[32m✓ 已同步到小程序\x1b[0m');
    console.log('\x1b[2m打开小程序即可看到本次匹配结果。\x1b[0m');
  } else {
    console.log('\n\x1b[36m小程序同步就绪\x1b[0m');
    console.log(`   配对码：\x1b[1m${pairCode}\x1b[0m`);
    console.log('   回小程序 -> 我的 -> 连接桌面端，点「拉取同步结果」。');
  }
}

async function runMatch(args) {
  const { projectPath, sync, syncUrl, syncToken, syncCode, syncSession } = parseMatchArgs(args);

  console.log('\n\x1b[36m🔍 Scanning project...\x1b[0m');

  const project = await scanProject(projectPath);
  displayProjectInfo(project);

  console.log('\n\x1b[36m📡 Fetching hackathons...\x1b[0m');

  const { hackathons, source } = await fetchHackathons(API_URL);

  if (!hackathons.length) {
    console.log('\x1b[33m   No hackathon data available.\x1b[0m');
    process.exit(0);
  }

  console.log(`\x1b[2m   Found ${hackathons.length} hackathons (${source})\x1b[0m`);

  const matches = matchHackathons(project, hackathons);

  display(matches, source);

  if (sync) {
    await pushToMiniProgram(project, matches, syncUrl, syncToken, syncCode, syncSession);
  }
}

function printHelp() {
  const C = '\x1b[36m';
  const B = '\x1b[1m';
  const D = '\x1b[2m';
  const R = '\x1b[0m';
  console.log(`
${C}${B}HackerTrip CLI${R}  ${D}— scan your project, match hackathons, publish work, submit events${R}

${B}USAGE${R}
  hackertrip <command> [options]

${B}COMMANDS${R}
  ${C}match${R}          Scan the local project and rank matching hackathons (default).
                 ${D}Run with no command, or "hackertrip ." , to use this.${R}
  ${C}publish-work${R}   Upload your project as a work to your HackerTrip profile.
  ${C}submit-event${R}   Submit a hackathon/event to the HackerTrip review drafts.
  ${C}event-status${R}   Check the review status of events you submitted.
  ${C}install-skills${R} Install the Claude Code skills into ~/.claude/skills.
  ${C}login${R}          扫码把这台电脑连到小程序账号（连一次，之后同步免输入）。
  ${C}help${R}           Show this help.

${B}login options${R}
  --sync-url <url>      pairSync HTTP trigger URL（默认已内置，通常不用填）。
  --keep-qr             绑定成功后保留本地的小程序码图片，默认会删掉。

${B}match options${R}
  --path <dir>          Project directory to scan (default: cwd).
  --sync                Push the scan + matches to the mini program.
                        跑过 login 就不用再带 --sync-token / --sync-code。
  --sync-url <url>      pairSync HTTP trigger URL (env HACKERTRIP_SYNC_URL).
  --sync-token <token>  Sync token / uploadToken (env HACKERTRIP_SYNC_TOKEN).
  --sync-code <code>    6-digit pair code from the mini program (env HACKERTRIP_SYNC_CODE).

${B}publish-work options${R}
  --path <dir>          Project directory to scan for defaults (default: cwd).
  --pair-code <code>    6-digit code from 小程序 我的→Skills同步 (required).
  --sync-url <url>      pairSync HTTP trigger URL (env HACKERTRIP_SYNC_URL).
  --sync-token <token>  uploadToken from pairing (env HACKERTRIP_SYNC_TOKEN).
  --name <text>         Work name (default: detected project name).
  --summary <text>      Work summary (default: detected description).
  --repo <url>          Source repository URL.
  --demo <url>          Live demo URL.
  --cover <url>         Cover image URL.
  --awards <text>       Awards / honors.
  --tech <list>         Comma-separated tech stack (default: detected stack).
  --no-process-stats    Skip the local process-stats snapshot (commits / active days / AI usage aggregates).

${B}submit-event options${R}
  --pair-code <code>    6-digit 提交配对码，先在小程序「主办方后台→生成提交码」生成 (required).
  --event-url <url>     eventSync endpoint (env HACKERTRIP_EVENT_URL).
  --from <file>         Read fields from a JSON or key:value/md file.
  --sync-token <tok>    uploadToken / x-sync-token (env HACKERTRIP_SYNC_TOKEN).
  --name <text>         Event name (required).
  --city <text>         City (required).
  --start <date>        Start date (required).
  --end <date>          End date (required).
  --website <url>       Event website (required).
  --mode <text>         online / offline / hybrid.
  --prize <text>        Prize pool.
  --tracks <list>       Comma-separated tracks.
  --summary <text>      Event summary.
  --organizer <text>    Organizer name.
  --contact <text>      Contact info.

${B}event-status options${R}
  --pair-code <code>    6-digit 提交配对码（小程序「主办方后台」生成，刚提交用过的也可查询）.
  --event-url <url>     eventSync endpoint (env HACKERTRIP_EVENT_URL).
  --sync-token <tok>    uploadToken (env HACKERTRIP_SYNC_TOKEN).

${B}install-skills options${R}
  --player              Only install the player kit skill (HackerTrip-publish-work).
  --organizer           Only install the organizer kit skill (HackerTrip-submit-event).
  --dest <dir>          Target skills directory (default: ~/.claude/skills).
  --force               Overwrite skills that already exist.

${D}Powered by HackerTrip  ${C}https://hackertrip.space${R}
`);
}

async function main() {
  const argv = process.argv.slice(2);
  let command = argv[0];

  // Backward compatible: no command, or a non-command first arg (e.g. "." or "--path"),
  // falls through to match.
  if (!command || command.startsWith('-') || command === '.' || !KNOWN_COMMANDS.includes(command)) {
    return runMatch(argv);
  }

  const rest = argv.slice(1);
  switch (command) {
    case 'login':
      return login(rest);
    case 'match':
      return runMatch(rest);
    case 'publish-work':
      return publishWork(rest);
    case 'submit-event':
      return submitEvent(rest);
    case 'install-skills':
      return installSkills(rest);
    case 'event-status':
      return eventStatus(rest);
    case 'ops':
      // 运营内部命令：审核 / 查数 / 修数（需 HACKERTRIP_OPS_TOKEN）
      return opsCommand(rest);
    case 'event':
      // 支持 "hackertrip event status" 两段式写法
      if (rest[0] === 'status') return eventStatus(rest.slice(1));
      return printHelp();
    case 'help':
      return printHelp();
    default:
      return runMatch(argv);
  }
}

if (process.argv.includes('--help') || process.argv.includes('-h')) {
  printHelp();
} else {
  main().catch((err) => {
    console.error('\x1b[31mError:\x1b[0m', err.message);
    process.exit(1);
  });
}
