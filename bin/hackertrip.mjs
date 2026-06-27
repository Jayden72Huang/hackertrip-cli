#!/usr/bin/env node

import { scanProject } from '../lib/scan.mjs';
import { fetchHackathons } from '../lib/fetch-hackathons.mjs';
import { matchHackathons } from '../lib/match.mjs';
import { display, displayProjectInfo } from '../lib/display.mjs';
import { publishWork } from '../lib/publish-work.mjs';
import { submitEvent } from '../lib/submit-event.mjs';
import { randomInt } from 'node:crypto';

const API_URL = process.env.HACKERTRIP_API || 'https://hackertrip.space/api/match';
const SYNC_URL = process.env.HACKERTRIP_SYNC_URL || '';
const SYNC_TOKEN = process.env.HACKERTRIP_SYNC_TOKEN || '';
const SYNC_CODE = process.env.HACKERTRIP_SYNC_CODE || '';

const KNOWN_COMMANDS = ['match', 'publish-work', 'submit-event', 'help'];

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

  return { projectPath, sync, syncUrl, syncToken, syncCode };
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

async function pushToMiniProgram(project, matches, syncUrl, syncToken, syncCode) {
  if (!syncUrl) {
    console.log('\n\x1b[33mSync URL missing. Set HACKERTRIP_SYNC_URL or pass --sync-url <url>.\x1b[0m');
    console.log('\x1b[2mThe URL should point to the pairSync HTTP trigger and accept { action: "push", pairCode, scan, card }.\x1b[0m');
    return;
  }
  if (!syncToken) {
    throw new Error('Sync token missing. Set HACKERTRIP_SYNC_TOKEN or pass --sync-token <token>.');
  }

  const pairCode = syncCode || makePairCode();
  if (!/^\d{6}$/.test(pairCode)) {
    throw new Error('Sync code must be a 6-digit code from the mini program.');
  }
  const payload = buildSyncPayload(project, matches, pairCode);
  const res = await fetch(syncUrl, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-sync-token': syncToken,
    },
    body: JSON.stringify(payload),
  });
  const json = await res.json().catch(() => null);
  if (!res.ok || !json || !json.ok) {
    const message = json && json.message ? json.message : `HTTP ${res.status}`;
    throw new Error(`Sync failed: ${message}`);
  }

  console.log('\n\x1b[36mMini Program sync ready\x1b[0m');
  console.log(`   Pair code: \x1b[1m${pairCode}\x1b[0m`);
  console.log('   回到 HackerTrip 小程序 -> 我的 -> Skills 同步，点击「拉取同步结果」。');
}

async function runMatch(args) {
  const { projectPath, sync, syncUrl, syncToken, syncCode } = parseMatchArgs(args);

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
    await pushToMiniProgram(project, matches, syncUrl, syncToken, syncCode);
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
  ${C}help${R}           Show this help.

${B}match options${R}
  --path <dir>          Project directory to scan (default: cwd).
  --sync                Push the scan + matches to the mini program.
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
    case 'match':
      return runMatch(rest);
    case 'publish-work':
      return publishWork(rest);
    case 'submit-event':
      return submitEvent(rest);
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
