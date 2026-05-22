import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';

const TECH_MAP = {
  'react': 'React', 'react-dom': 'React', 'next': 'Next.js',
  'vue': 'Vue', 'nuxt': 'Nuxt', 'svelte': 'Svelte', 'angular': 'Angular',
  'express': 'Express', 'fastify': 'Fastify', 'koa': 'Koa', 'hono': 'Hono',
  'typescript': 'TypeScript', 'tailwindcss': 'Tailwind CSS',
  'prisma': 'Prisma', 'drizzle-orm': 'Drizzle', 'mongoose': 'MongoDB',
  'openai': 'LLM', '@anthropic-ai/sdk': 'LLM', 'langchain': 'LLM',
  '@langchain/core': 'LLM', 'llamaindex': 'LLM',
  'tensorflow': 'AI/ML', '@tensorflow/tfjs': 'AI/ML',
  'torch': 'AI/ML', 'transformers': 'AI/ML', 'scikit-learn': 'AI/ML',
  'ethers': 'Web3', 'web3': 'Web3', 'hardhat': 'Web3', 'foundry': 'Web3',
  '@solana/web3.js': 'Web3', 'viem': 'Web3', 'wagmi': 'Web3',
  'three': '3D', '@react-three/fiber': '3D',
  'unity': 'Game', 'pygame': 'Game', 'phaser': 'Game',
  'flutter': 'Flutter', 'react-native': 'React Native',
  'electron': 'Electron', 'tauri': 'Tauri',
  'stripe': 'Fintech', 'plaid': 'Fintech',
  'firebase': 'Firebase', 'supabase': 'Supabase',
  'docker': 'Docker', 'kubernetes': 'Kubernetes',
};

const KEYWORD_PATTERNS = [
  'AI', 'machine learning', 'deep learning', 'NLP', 'LLM', 'GPT', 'agent',
  'Web3', 'blockchain', 'DeFi', 'NFT', 'crypto', 'smart contract', 'solidity',
  'health', 'healthcare', 'medical', 'biotech',
  'education', 'edtech', 'learning platform',
  'fintech', 'finance', 'payment', 'trading',
  'game', 'gaming', 'metaverse', 'VR', 'AR', 'XR',
  'climate', 'sustainability', 'green', 'environment',
  'developer tools', 'devtools', 'CLI', 'API', 'SDK',
  'social', 'community', 'chat', 'messaging',
  'e-commerce', 'marketplace', 'SaaS',
  'robotics', 'IoT', 'hardware', 'embedded',
  'security', 'cybersecurity', 'privacy',
  'data', 'analytics', 'visualization',
  'creative', 'art', 'music', 'design', 'content',
];

async function tryReadFile(path) {
  try {
    return await readFile(path, 'utf-8');
  } catch {
    return null;
  }
}

function extractFromPackageJson(content) {
  try {
    const pkg = JSON.parse(content);
    const deps = {
      ...pkg.dependencies,
      ...pkg.devDependencies,
    };
    const techs = new Set();
    for (const dep of Object.keys(deps)) {
      const key = dep.toLowerCase();
      if (TECH_MAP[key]) techs.add(TECH_MAP[key]);
    }
    return {
      techs: [...techs],
      description: pkg.description || '',
      name: pkg.name || '',
    };
  } catch {
    return { techs: [], description: '', name: '' };
  }
}

function extractFromRequirements(content) {
  const techs = new Set();
  for (const line of content.split('\n')) {
    const pkg = line.trim().split(/[=<>!~]/)[0].toLowerCase();
    if (TECH_MAP[pkg]) techs.add(TECH_MAP[pkg]);
  }
  return [...techs];
}

function extractFromPyproject(content) {
  const techs = new Set();
  const depSection = content.match(/\[project\.dependencies\]([\s\S]*?)(\[|$)/)?.[1] || '';
  for (const line of depSection.split('\n')) {
    const pkg = line.trim().replace(/[",]/g, '').split(/[=<>!~]/)[0].toLowerCase();
    if (TECH_MAP[pkg]) techs.add(TECH_MAP[pkg]);
  }
  return [...techs];
}

function extractFromCargoToml(content) {
  const techs = new Set();
  techs.add('Rust');
  if (content.includes('actix') || content.includes('axum') || content.includes('rocket')) techs.add('Web Server');
  if (content.includes('wasm')) techs.add('WebAssembly');
  return [...techs];
}

function extractFromGoMod(content) {
  const techs = new Set();
  techs.add('Go');
  if (content.includes('gin-gonic') || content.includes('fiber') || content.includes('echo')) techs.add('Web Server');
  return [...techs];
}

function extractKeywords(text) {
  if (!text) return [];
  const lower = text.toLowerCase();
  return KEYWORD_PATTERNS.filter((kw) => lower.includes(kw.toLowerCase()));
}

async function detectDirSignals(dir) {
  const signals = [];
  try {
    const entries = await readdir(dir);
    if (entries.includes('contracts') || entries.includes('hardhat.config.js') || entries.includes('foundry.toml')) {
      signals.push('Web3');
    }
    if (entries.includes('models') || entries.includes('notebooks') || entries.includes('.ipynb_checkpoints')) {
      signals.push('AI/ML');
    }
    if (entries.includes('Dockerfile') || entries.includes('docker-compose.yml')) {
      signals.push('Docker');
    }
    if (entries.includes('ios') || entries.includes('android')) {
      signals.push('Mobile');
    }
  } catch {
    // ignore
  }
  return signals;
}

export async function scanProject(dir) {
  const techStack = new Set();
  const keywords = new Set();
  let description = '';

  const packageJson = await tryReadFile(join(dir, 'package.json'));
  if (packageJson) {
    const result = extractFromPackageJson(packageJson);
    result.techs.forEach((t) => techStack.add(t));
    if (result.description) description = result.description;
  }

  const requirements = await tryReadFile(join(dir, 'requirements.txt'));
  if (requirements) {
    techStack.add('Python');
    extractFromRequirements(requirements).forEach((t) => techStack.add(t));
  }

  const pyproject = await tryReadFile(join(dir, 'pyproject.toml'));
  if (pyproject) {
    techStack.add('Python');
    extractFromPyproject(pyproject).forEach((t) => techStack.add(t));
  }

  const cargo = await tryReadFile(join(dir, 'Cargo.toml'));
  if (cargo) extractFromCargoToml(cargo).forEach((t) => techStack.add(t));

  const gomod = await tryReadFile(join(dir, 'go.mod'));
  if (gomod) extractFromGoMod(gomod).forEach((t) => techStack.add(t));

  const gemfile = await tryReadFile(join(dir, 'Gemfile'));
  if (gemfile) techStack.add('Ruby');

  const pubspec = await tryReadFile(join(dir, 'pubspec.yaml'));
  if (pubspec) techStack.add('Flutter');

  const readme = await tryReadFile(join(dir, 'README.md')) || await tryReadFile(join(dir, 'README'));
  if (readme) {
    extractKeywords(readme).forEach((k) => keywords.add(k));
    if (!description) {
      const firstPara = readme.split('\n\n').find((p) => p.trim() && !p.startsWith('#'));
      if (firstPara) description = firstPara.trim().slice(0, 150);
    }
  }

  const dirSignals = await detectDirSignals(dir);
  dirSignals.forEach((s) => techStack.add(s));

  if (readme) extractKeywords(readme).forEach((k) => keywords.add(k));
  if (description) extractKeywords(description).forEach((k) => keywords.add(k));

  return {
    techStack: [...techStack],
    keywords: [...keywords],
    description,
  };
}
