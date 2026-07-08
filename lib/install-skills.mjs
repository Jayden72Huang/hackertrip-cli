import { existsSync, mkdirSync, cpSync, readdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const C = '\x1b[36m';
const B = '\x1b[1m';
const D = '\x1b[2m';
const Y = '\x1b[33m';
const G = '\x1b[32m';
const R = '\x1b[0m';

const PACKAGE_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

const ROLES = {
  player: {
    label: '选手包',
    skillsDir: join(PACKAGE_ROOT, 'packages', 'player', 'skills'),
    hint: '对 Claude 说「帮我把黑客松作品发到 HackerTrip」即可触发。',
  },
  organizer: {
    label: '主办方包',
    skillsDir: join(PACKAGE_ROOT, 'packages', 'organizer', 'skills'),
    hint: '对 Claude 说「帮我把这个黑客松发到 HackerTrip」并附海报图即可触发。',
  },
};

function parseArgs(args) {
  const opts = {
    roles: [],
    dest: join(homedir(), '.claude', 'skills'),
    force: false,
  };
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--player') opts.roles.push('player');
    else if (args[i] === '--organizer') opts.roles.push('organizer');
    else if (args[i] === '--dest' && args[i + 1]) {
      opts.dest = resolve(args[i + 1]);
      i++;
    } else if (args[i] === '--force') opts.force = true;
  }
  if (!opts.roles.length) opts.roles = ['player', 'organizer'];
  return opts;
}

export async function installSkills(args) {
  const opts = parseArgs(args);

  console.log(`\n${C}${B}HackerTrip install-skills${R}  ${D}→ ${opts.dest}${R}\n`);
  mkdirSync(opts.dest, { recursive: true });

  const installed = [];
  const skipped = [];

  for (const role of opts.roles) {
    const { label, skillsDir, hint } = ROLES[role];
    if (!existsSync(skillsDir)) {
      console.log(`${Y}⚠ ${label}的 skills 目录不存在：${skillsDir}${R}`);
      console.log(`${D}  npm 全局安装或源码 clone 均应包含 packages/，请重新安装 hackertrip。${R}`);
      continue;
    }
    for (const skillName of readdirSync(skillsDir)) {
      const src = join(skillsDir, skillName);
      const dst = join(opts.dest, skillName);
      if (existsSync(dst) && !opts.force) {
        skipped.push(skillName);
        console.log(`${Y}↷ 跳过 ${B}${skillName}${R}${Y}（已存在，用 --force 覆盖更新）${R}`);
        continue;
      }
      cpSync(src, dst, { recursive: true });
      installed.push(skillName);
      console.log(`${G}✓ 已安装 ${B}${skillName}${R}  ${D}(${label})${R}`);
      console.log(`${D}  ${hint}${R}`);
    }
  }

  console.log('');
  if (installed.length) {
    console.log(`${G}${B}完成${R} — ${installed.length} 个 skill 已装入 ${opts.dest}`);
    console.log(`${D}重启 Claude Code 会话即可生效。配对码在小程序「我的 → Skills 同步」或「主办方后台」生成。${R}\n`);
  } else if (skipped.length) {
    console.log(`${D}没有新安装的 skill。加 ${R}--force${D} 可覆盖更新已存在的版本。${R}\n`);
  } else {
    console.log(`${Y}没有找到可安装的 skill。${R}\n`);
  }
}
