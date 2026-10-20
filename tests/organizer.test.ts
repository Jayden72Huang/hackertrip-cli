import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync, readdirSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { test } from 'node:test';

const cli = resolve(import.meta.dirname, '../bin/hackertrip.mjs');
const form = { name: 'CLI contract test', city: '线上', startDate: '2026-11-03', endDate: '2026-11-04', website: 'https://example.com', registrationStartTime: '09:00', agenda: [{ date: '2026-11-03', time: '09:00', title: '开始' }], live: { channelsName: '测试', sessions: [] }, relayRequested: true, relaySignalType: 'director', relayConsent: true };

function run(event: object, flags: string[] = [], mode = 'success', command = 'submit-event') {
  const dir = mkdtempSync(join(tmpdir(), 'ht-organizer-contract-'));
  try {
    const file = join(dir, 'event.json');
    writeFileSync(file, JSON.stringify(event));
    // Exercise the real CLI process while replacing only HTTP transport.
    // No real credentials or production requests are used by this suite.
    const hook = `globalThis.fetch = async (url, opts) => {
      console.log('REQUEST:'+JSON.stringify({url, body:JSON.parse(opts.body), headers:opts.headers}));
      return {ok:${mode !== 'http-error'}, status:${mode === 'http-error' ? 503 : 200}, json:async()=>(${mode === 'legacy' ? "{ok:true,id:'synthetic-draft',status:'pending_manual_review'}" : mode === 'rejected' ? "{ok:false,code:'BAD_SUBMIT_KEY',message:'invalid key'}" : "{ok:true,id:'synthetic-draft',status:'pending_submission',items:[{id:'synthetic-draft',name:'查询测试',status:'pending_submission',missing:['封面'],note:'请补充资料'}]}"})};
    };`;
    const result = spawnSync(process.execPath, ['--import', 'data:text/javascript,' + encodeURIComponent(hook), cli, command, '--organizer-no', 'HT-TEST', '--submit-key', 'synthetic-key', '--from', file, ...flags], { encoding: 'utf8', env: { ...process.env, HACKERTRIP_EVENT_URL: '', HACKERTRIP_ORGANIZER_NO: '', HACKERTRIP_SUBMIT_KEY: '' } });
    const line = result.stdout.split('\n').find(value => value.startsWith('REQUEST:'));
    return { ...result, request: line ? JSON.parse(line.slice(8)) : null };
  } finally { rmSync(dir, { recursive: true, force: true }); }
}

test('current mini-program template retains fields and uses built-in endpoint', () => {
  const r = run(form);
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.match(r.request.url, /\/eventSync$/);
  assert.equal(r.request.body.organizerNo, 'HT-TEST');
  assert.equal(r.request.body.submitKey, 'synthetic-key');
  const { relayRequested, relaySignalType, relayConsent, ...rest } = form;
  assert.deepEqual(r.request.body.event, { ...rest, live: { ...form.live, relayRequested, relaySignalType, relayConsent } });
  assert.match(r.stdout, /synthetic-draft/);
});
test('false relay consent is preserved', () => {
  const r = run({ ...form, relayRequested: false, relayConsent: false });
  assert.equal(r.request.body.event.live.relayConsent, false);
  assert.equal(r.request.body.event.live.relayRequested, false);
});
test('nested live relay fields pass through unchanged', () => {
  const { relayRequested, relaySignalType, relayConsent, ...rest } = form;
  const event = { ...rest, live: { ...form.live, relayRequested, relaySignalType, relayConsent } };
  const r = run(event); assert.equal(r.status, 0); assert.deepEqual(r.request.body.event, event);
});
for (const [name, event] of [
  ['invalid date', { ...form, startDate: '2026-02-30' }],
  ['reversed dates', { ...form, endDate: '2026-11-01' }],
  ['invalid relay signal', { ...form, relaySignalType: 'invalid' }],
  ['missing website', { ...form, website: '' }],
] as const) test(name + ' fails before HTTP', () => {
  const r = run(event); assert.equal(r.status, 1); assert.equal(r.request, null);
});
test('server rejection returns nonzero', () => {
  const r = run(form, [], 'rejected'); assert.equal(r.status, 1); assert.match(r.stdout, /BAD_SUBMIT_KEY/);
});
test('HTTP error cannot report success even with an ok JSON body', () => {
  const r = run(form, [], 'http-error'); assert.equal(r.status, 1); assert.doesNotMatch(r.stdout, /✓ 已保存/);
});
test('legacy server review receipt is not reported as a saved unsubmitted draft', () => {
  const r = run(form, [], 'legacy'); assert.equal(r.status, 1); assert.match(r.stdout, /synthetic-draft/); assert.doesNotMatch(r.stdout, /✓ 已保存/);
});
test('status is read-only and shows ID, missing fields and review note', () => {
  const r = run({}, [], 'success', 'event-status');
  assert.equal(r.status, 0); assert.equal(r.request.body.action, 'status');
  assert.equal(r.request.body.event, undefined);
  for (const value of ['synthetic-draft', '封面', '请补充资料']) assert(r.stdout.includes(value));
});
test('status rejects invalid credentials and HTTP errors', () => {
  for (const mode of ['rejected', 'http-error']) {
    const r = run({}, [], mode, 'event-status'); assert.equal(r.status, 1);
  }
});
test('standard help and version do not scan a project or make HTTP requests', () => {
  for (const flag of ['--help', '-h', '--version', '-v']) {
    const r = spawnSync(process.execPath, [cli, flag], { encoding: 'utf8', timeout: 5000 });
    assert.equal(r.status, 0); assert.doesNotMatch(r.stdout, /Scanning project|Fetching hackathons/);
    assert.match(r.stdout, flag.includes('h') ? /event-status/ : /^1\.4\.1\s*$/);
  }
});
test('organizer installation contains both skills and preserves existing edits without force', () => {
  const dir = mkdtempSync(join(tmpdir(), 'ht-skills-contract-'));
  try {
    const runInstall = (flags: string[] = []) => spawnSync(process.execPath, [cli, 'install-skills', '--organizer', '--dest', dir, ...flags], { encoding: 'utf8' });
    assert.equal(runInstall().status, 0);
    assert.deepEqual(readdirSync(dir).sort(), ['HackerTrip-event-status', 'HackerTrip-submit-event']);
    const file = join(dir, 'HackerTrip-event-status/SKILL.md');
    writeFileSync(file, 'user edit'); assert.equal(runInstall().status, 0); assert.equal(readFileSync(file, 'utf8'), 'user edit');
    assert.equal(runInstall(['--force']).status, 0); assert.match(readFileSync(file, 'utf8'), /event-status/);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
