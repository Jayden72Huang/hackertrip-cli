/**
 * hackertrip login —— 扫码把这台电脑连到小程序账号。
 *
 * 旧流程要用户在小程序生成 6 位码和 uploadToken，再手动搬到终端，一共三次复制粘贴。
 * 现在：终端出一张小程序码，微信扫一下就完事，凭证自动存本地。
 *
 *   1. cliStart  申请配对会话，拿到 sessionToken 和小程序码 PNG
 *   2. 本地存图并用系统默认看图程序打开
 *   3. 用户扫码 → 小程序里认领（那一刻才有 openid，授权发生在这里）
 *   4. cliPoll   轮询到绑定成功，把 uploadToken 写进 ~/.hackertrip/config.json
 *
 * 之后 `hackertrip match --sync` 直接读本地凭证推送，不用再输任何东西。
 */

import { writeFileSync, mkdirSync, existsSync, readFileSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
import { homedir, tmpdir } from 'node:os';
import { spawn } from 'node:child_process';

const C = {
  reset: '\x1b[0m',
  dim: '\x1b[2m',
  bold: '\x1b[1m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  red: '\x1b[31m',
  cyan: '\x1b[36m',
};

const DEFAULT_SYNC_URL = 'https://test-1-d8gn28apcbf409627-1445960691.ap-shanghai.app.tcloudbase.com/pairSync';
const CONFIG_DIR = join(homedir(), '.hackertrip');
const CONFIG_FILE = join(CONFIG_DIR, 'config.json');

const POLL_INTERVAL_MS = 2000;
const POLL_TIMEOUT_MS = 5 * 60 * 1000; // 码本身 30 分钟有效，但让终端干等 30 分钟没意义

export function readConfig() {
  try {
    if (!existsSync(CONFIG_FILE)) return {};
    return JSON.parse(readFileSync(CONFIG_FILE, 'utf8')) || {};
  } catch (_) {
    return {};
  }
}

function writeConfig(patch) {
  mkdirSync(CONFIG_DIR, { recursive: true });
  const next = Object.assign(readConfig(), patch);
  // 0600：里面是长期凭证，不该让同机其他用户读到
  writeFileSync(CONFIG_FILE, JSON.stringify(next, null, 2) + '\n', { mode: 0o600 });
  return next;
}

/** 用系统默认看图程序打开小程序码；打不开也不算失败，终端会给出文件路径兜底 */
function openImage(path) {
  const cmd = process.platform === 'darwin' ? 'open'
    : process.platform === 'win32' ? 'cmd'
      : 'xdg-open';
  const args = process.platform === 'win32' ? ['/c', 'start', '', path] : [path];
  try {
    const child = spawn(cmd, args, { stdio: 'ignore', detached: true });
    child.on('error', () => {});
    child.unref();
    return true;
  } catch (_) {
    return false;
  }
}

async function callSync(syncUrl, payload) {
  const res = await fetch(syncUrl, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const text = await res.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch (_) {
    throw new Error(`同步服务返回了非 JSON 内容（HTTP ${res.status}）：${text.slice(0, 200)}`);
  }
  // 云函数 HTTP 触发器有时把结果包在 { result: ... } 里
  return json && json.result ? json.result : json;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export async function login(args = []) {
  let syncUrl = process.env.HACKERTRIP_SYNC_URL || DEFAULT_SYNC_URL;
  let keepOpen = false;
  for (let i = 0; i < args.length; i += 1) {
    if (args[i] === '--sync-url' && args[i + 1]) {
      syncUrl = args[i + 1];
      i += 1;
    } else if (args[i] === '--keep-qr') {
      keepOpen = true;
    }
  }

  console.log(`\n${C.bold}连接 HackerTrip 小程序${C.reset}`);
  console.log(`${C.dim}用微信扫描弹出的小程序码，这台电脑就和你的账号连上了。${C.reset}\n`);

  let start;
  try {
    start = await callSync(syncUrl, {
      action: 'cliStart',
      deviceName: `${process.platform}-${(process.env.USER || process.env.USERNAME || 'cli')}`,
    });
  } catch (e) {
    console.log(`${C.red}无法连接同步服务：${e.message}${C.reset}`);
    console.log(`${C.dim}可用 --sync-url <url> 指定地址，或设置 HACKERTRIP_SYNC_URL。${C.reset}\n`);
    process.exitCode = 1;
    return;
  }

  if (!start || !start.ok || !start.sessionToken || !start.qrBase64) {
    console.log(`${C.red}生成小程序码失败：${(start && start.message) || '未知错误'}${C.reset}\n`);
    process.exitCode = 1;
    return;
  }

  const qrPath = join(tmpdir(), `hackertrip-login-${start.sessionToken.slice(0, 8)}.png`);
  writeFileSync(qrPath, Buffer.from(start.qrBase64, 'base64'));
  const opened = openImage(qrPath);

  console.log(`${C.cyan}小程序码已生成${C.reset}`);
  if (!opened) console.log(`${C.yellow}没能自动打开图片，请手动打开：${C.reset}`);
  console.log(`${C.dim}  ${qrPath}${C.reset}`);
  console.log(`\n${C.dim}等待扫码…（Ctrl+C 可随时退出）${C.reset}`);

  const deadline = Date.now() + POLL_TIMEOUT_MS;
  let dots = 0;
  while (Date.now() < deadline) {
    await sleep(POLL_INTERVAL_MS);
    let poll;
    try {
      poll = await callSync(syncUrl, { action: 'cliPoll', sessionToken: start.sessionToken });
    } catch (_) {
      continue; // 网络抖动不中断整轮等待
    }
    if (poll && poll.ok && poll.bound && poll.uploadToken) {
      writeConfig({
        syncUrl,
        sessionToken: start.sessionToken,
        uploadToken: poll.uploadToken,
        boundAt: new Date().toISOString(),
      });
      process.stdout.write('\r' + ' '.repeat(40) + '\r');
      console.log(`\n${C.green}✓ 已连接${C.reset}`);
      console.log(`${C.dim}凭证已保存到 ${CONFIG_FILE}${C.reset}`);
      console.log(`${C.dim}现在可以运行：${C.reset}${C.bold}hackertrip match --sync${C.reset}\n`);
      if (!keepOpen) {
        try { unlinkSync(qrPath); } catch (_) { /* 删不掉就留着，无伤大雅 */ }
      }
      return;
    }
    // 会话本身失效就没必要继续等了
    if (poll && !poll.ok && /SESSION_(NOT_FOUND|EXPIRED)/.test(poll.code || '')) {
      console.log(`\n${C.red}${poll.message || '配对已失效'}${C.reset}\n`);
      process.exitCode = 1;
      return;
    }
    dots = (dots + 1) % 4;
    process.stdout.write(`\r${C.dim}等待扫码${'.'.repeat(dots)}${' '.repeat(3 - dots)}${C.reset}`);
  }

  console.log(`\n${C.yellow}等待超时，请重新执行 hackertrip login${C.reset}\n`);
  process.exitCode = 1;
}
