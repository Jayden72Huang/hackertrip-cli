import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { homedir } from 'node:os';

const CACHE_PATH = join(homedir(), '.hackertrip', 'cache', 'hackathons.json');
const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

const __dirname = dirname(fileURLToPath(import.meta.url));
const BUNDLED_PATH = join(__dirname, '..', 'data', 'hackathons-bundled.json');

async function tryReadJson(path) {
  try {
    return JSON.parse(await readFile(path, 'utf-8'));
  } catch {
    return null;
  }
}

async function saveCache(hackathons) {
  try {
    await mkdir(dirname(CACHE_PATH), { recursive: true });
    await writeFile(CACHE_PATH, JSON.stringify({ hackathons, cachedAt: Date.now() }));
  } catch {
    // cache write failure is non-critical
  }
}

async function loadCache() {
  const data = await tryReadJson(CACHE_PATH);
  if (!data || !data.hackathons) return null;
  if (Date.now() - (data.cachedAt || 0) > CACHE_TTL_MS) return null;
  return data.hackathons;
}

async function loadBundled() {
  const data = await tryReadJson(BUNDLED_PATH);
  return Array.isArray(data) ? data : null;
}

export async function fetchHackathons(apiUrl) {
  // Tier 1: Try API (5s timeout)
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);
    const res = await fetch(`${apiUrl}?limit=50`, { signal: controller.signal });
    clearTimeout(timeout);

    if (res.ok) {
      const data = await res.json();
      const hackathons = data.hackathons || [];
      if (hackathons.length > 0) {
        await saveCache(hackathons);
        return { hackathons, source: 'api' };
      }
    }
  } catch {
    // API failed, try fallbacks
  }

  // Tier 2: Try local cache
  const cached = await loadCache();
  if (cached && cached.length > 0) {
    return { hackathons: cached, source: 'cache' };
  }

  // Tier 3: Bundled data
  const bundled = await loadBundled();
  if (bundled && bundled.length > 0) {
    return { hackathons: bundled, source: 'bundled' };
  }

  return { hackathons: [], source: 'none' };
}
