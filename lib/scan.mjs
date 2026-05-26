import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';

const TECH_MAP = {
  'react': 'React', 'react-dom': 'React', 'next': 'Next.js',
  'vue': 'Vue', 'nuxt': 'Nuxt', 'svelte': 'Svelte', 'angular': 'Angular',
  'astro': 'Astro', 'gatsby': 'Gatsby', 'remix': 'Remix',
  'express': 'Express', 'fastify': 'Fastify', 'koa': 'Koa', 'hono': 'Hono',
  'typescript': 'TypeScript', 'tailwindcss': 'Tailwind CSS',
  'prisma': 'Prisma', 'drizzle-orm': 'Drizzle ORM', 'mongoose': 'MongoDB',
  '@neondatabase/serverless': 'Neon DB',
  'openai': 'LLM', '@anthropic-ai/sdk': 'LLM', 'langchain': 'LLM',
  '@langchain/core': 'LLM', 'llamaindex': 'LLM',
  '@ai-sdk/anthropic': 'AI SDK', '@ai-sdk/openai': 'AI SDK', 'ai': 'AI SDK',
  'tensorflow': 'AI/ML', '@tensorflow/tfjs': 'AI/ML',
  'torch': 'AI/ML', 'transformers': 'AI/ML', 'scikit-learn': 'AI/ML',
  'ethers': 'Web3', 'web3': 'Web3', 'hardhat': 'Web3', 'foundry': 'Web3',
  '@solana/web3.js': 'Web3', 'viem': 'Web3', 'wagmi': 'Web3',
  'three': 'Three.js', '@react-three/fiber': 'Three.js', '@react-three/drei': 'Three.js',
  'unity': 'Game', 'pygame': 'Game', 'phaser': 'Game',
  'flutter': 'Flutter', 'react-native': 'React Native',
  'electron': 'Electron', 'tauri': 'Tauri',
  'stripe': 'Fintech', 'plaid': 'Fintech',
  'firebase': 'Firebase', 'supabase': 'Supabase', '@supabase/supabase-js': 'Supabase',
  'docker': 'Docker', 'kubernetes': 'Kubernetes',
  '@mendable/firecrawl-js': 'Web Scraping', 'cheerio': 'Web Scraping',
  'puppeteer': 'Web Scraping', 'playwright': 'Web Scraping',
  'remotion': 'Video', '@remotion/cli': 'Video',
  'maplibre-gl': 'Maps', 'mapbox-gl': 'Maps', 'leaflet': 'Maps',
  'resend': 'Email', 'nodemailer': 'Email',
  'next-auth': 'Auth', '@auth/core': 'Auth', 'better-auth': 'Auth',
  'gsap': 'Animation', 'framer-motion': 'Animation',
  '@aws-sdk/client-s3': 'AWS S3', 'wrangler': 'Cloudflare',
  'socket.io': 'WebSocket', 'ws': 'WebSocket',
  'd3': 'Data Visualization', 'chart.js': 'Data Visualization', 'echarts': 'Data Visualization',
  'jose': 'Auth/JWT',
};

const PY_TECH_MAP = {
  'fastapi': 'FastAPI', 'flask': 'Flask', 'django': 'Django',
  'uvicorn': 'FastAPI', 'selenium': 'Web Scraping', 'beautifulsoup4': 'Web Scraping',
  'scrapy': 'Web Scraping', 'requests': 'Python HTTP', 'httpx': 'Python HTTP',
  'torch': 'PyTorch', 'tensorflow': 'TensorFlow', 'transformers': 'HuggingFace',
  'langchain': 'LangChain', 'openai': 'LLM', 'anthropic': 'LLM',
  'pandas': 'Data Analysis', 'numpy': 'Data Analysis', 'scikit-learn': 'ML',
  'opencv-python': 'Computer Vision', 'pillow': 'Image Processing',
  'sqlalchemy': 'SQLAlchemy', 'pydantic': 'Pydantic',
  'streamlit': 'Streamlit', 'gradio': 'Gradio',
  'web3': 'Web3', 'eth-brownie': 'Web3',
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
  '3D', 'WebGL', 'three.js', 'spatial',
  'video', 'streaming', 'media',
  'map', 'geolocation', 'travel',
  'OCR', 'computer vision', 'image recognition',
  'scraping', 'crawler', 'automation',
  'hackathon', 'competition',
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
    const deps = { ...pkg.dependencies, ...pkg.devDependencies };
    const techs = new Set();
    for (const dep of Object.keys(deps)) {
      const key = dep.toLowerCase();
      if (TECH_MAP[key]) techs.add(TECH_MAP[key]);
      if (TECH_MAP[dep]) techs.add(TECH_MAP[dep]);
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
    const pkg = line.trim().split(/[=<>!~\[]/)[0].replace(/-/g, '').toLowerCase();
    const originalPkg = line.trim().split(/[=<>!~\[]/)[0].toLowerCase();
    if (PY_TECH_MAP[originalPkg]) techs.add(PY_TECH_MAP[originalPkg]);
    else if (PY_TECH_MAP[pkg]) techs.add(PY_TECH_MAP[pkg]);
  }
  return [...techs];
}

function extractFromPyproject(content) {
  const techs = new Set();
  const depSection = content.match(/\[project\.dependencies\]([\s\S]*?)(\[|$)/)?.[1] || '';
  for (const line of depSection.split('\n')) {
    const pkg = line.trim().replace(/[",]/g, '').split(/[=<>!~\[]/)[0].toLowerCase();
    if (PY_TECH_MAP[pkg]) techs.add(PY_TECH_MAP[pkg]);
  }
  return [...techs];
}

function extractFromCargoToml(content) {
  const techs = new Set(['Rust']);
  if (content.includes('actix') || content.includes('axum') || content.includes('rocket')) techs.add('Web Server');
  if (content.includes('wasm')) techs.add('WebAssembly');
  if (content.includes('tokio')) techs.add('Async Runtime');
  return [...techs];
}

function extractFromGoMod(content) {
  const techs = new Set(['Go']);
  if (content.includes('gin-gonic') || content.includes('fiber') || content.includes('echo')) techs.add('Web Server');
  if (content.includes('ethereum')) techs.add('Web3');
  return [...techs];
}

function extractKeywords(text) {
  if (!text) return [];
  const lower = text.toLowerCase();
  return KEYWORD_PATTERNS.filter((kw) => lower.includes(kw.toLowerCase()));
}

function extractFromClaudeMd(content) {
  const techs = new Set();
  const keywords = new Set();

  const techPatterns = [
    [/next\.?js/i, 'Next.js'], [/react/i, 'React'], [/vue/i, 'Vue'],
    [/typescript/i, 'TypeScript'], [/tailwind/i, 'Tailwind CSS'],
    [/drizzle/i, 'Drizzle ORM'], [/prisma/i, 'Prisma'],
    [/supabase/i, 'Supabase'], [/firebase/i, 'Firebase'],
    [/neon/i, 'Neon DB'], [/postgres/i, 'PostgreSQL'],
    [/three\.?js/i, 'Three.js'], [/cloudflare/i, 'Cloudflare'],
    [/vercel/i, 'Vercel'], [/docker/i, 'Docker'],
    [/anthropic|claude/i, 'LLM'], [/openai|gpt/i, 'LLM'],
    [/web3|ethereum|solidity/i, 'Web3'],
    [/python/i, 'Python'], [/rust/i, 'Rust'], [/go\b/i, 'Go'],
    [/fastapi/i, 'FastAPI'], [/django/i, 'Django'], [/flask/i, 'Flask'],
  ];

  for (const [pattern, tech] of techPatterns) {
    if (pattern.test(content)) techs.add(tech);
  }

  extractKeywords(content).forEach((k) => keywords.add(k));

  return { techs: [...techs], keywords: [...keywords] };
}

function extractFromEnvExample(content) {
  const services = new Set();
  const lines = content.split('\n');
  for (const line of lines) {
    const upper = line.toUpperCase();
    if (upper.includes('STRIPE')) services.add('Fintech');
    if (upper.includes('SUPABASE')) services.add('Supabase');
    if (upper.includes('FIREBASE')) services.add('Firebase');
    if (upper.includes('OPENAI') || upper.includes('ANTHROPIC')) services.add('LLM');
    if (upper.includes('AWS') || upper.includes('S3')) services.add('AWS');
    if (upper.includes('CLOUDFLARE') || upper.includes('R2')) services.add('Cloudflare');
    if (upper.includes('RESEND') || upper.includes('SENDGRID')) services.add('Email');
    if (upper.includes('REDIS')) services.add('Redis');
    if (upper.includes('GITHUB')) services.add('GitHub API');
    if (upper.includes('DATABASE') || upper.includes('POSTGRES') || upper.includes('NEON')) services.add('PostgreSQL');
  }
  return [...services];
}

async function detectDirSignals(dir) {
  const signals = [];
  try {
    const entries = await readdir(dir);
    if (entries.includes('contracts') || entries.includes('hardhat.config.js') || entries.includes('hardhat.config.ts') || entries.includes('foundry.toml')) {
      signals.push('Web3');
    }
    if (entries.includes('models') || entries.includes('notebooks') || entries.includes('.ipynb_checkpoints')) {
      signals.push('AI/ML');
    }
    if (entries.includes('Dockerfile') || entries.includes('docker-compose.yml') || entries.includes('docker-compose.yaml')) {
      signals.push('Docker');
    }
    if (entries.includes('ios') || entries.includes('android')) {
      signals.push('Mobile');
    }
    if (entries.includes('prisma')) {
      signals.push('Prisma');
    }
    if (entries.includes('drizzle')) {
      signals.push('Drizzle ORM');
    }
    if (entries.includes('supabase')) {
      signals.push('Supabase');
    }
  } catch {
    // ignore
  }
  return signals;
}

async function detectEntryImports(dir) {
  const techs = new Set();
  const entryFiles = [
    'app/page.tsx', 'app/page.jsx', 'src/App.tsx', 'src/App.jsx',
    'src/main.ts', 'src/main.tsx', 'src/index.ts', 'src/index.tsx',
    'main.py', 'app.py', 'src/main.py', 'src/main.rs',
  ];

  for (const entry of entryFiles) {
    const content = await tryReadFile(join(dir, entry));
    if (!content) continue;

    const lines = content.split('\n').slice(0, 40);
    const importText = lines.join('\n');

    if (/from\s+['"]three/i.test(importText) || /import.*three/i.test(importText)) techs.add('Three.js');
    if (/from\s+['"]@react-three/i.test(importText)) techs.add('Three.js');
    if (/from\s+['"]framer-motion/i.test(importText)) techs.add('Animation');
    if (/from\s+['"]gsap/i.test(importText)) techs.add('Animation');
    if (/from\s+['"]@anthropic/i.test(importText)) techs.add('LLM');
    if (/from\s+['"]openai/i.test(importText)) techs.add('LLM');
    if (/from\s+['"]ethers/i.test(importText)) techs.add('Web3');
    if (/from\s+['"]remotion/i.test(importText)) techs.add('Video');

    break; // only read the first match
  }

  return [...techs];
}

export async function scanProject(dir) {
  const techStack = new Set();
  const keywords = new Set();
  let description = '';
  let projectName = '';

  // 1. package.json
  const packageJson = await tryReadFile(join(dir, 'package.json'));
  if (packageJson) {
    const result = extractFromPackageJson(packageJson);
    result.techs.forEach((t) => techStack.add(t));
    if (result.description) description = result.description;
    if (result.name) projectName = result.name;
  }

  // 2. Python files
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

  // 3. Other languages
  const cargo = await tryReadFile(join(dir, 'Cargo.toml'));
  if (cargo) extractFromCargoToml(cargo).forEach((t) => techStack.add(t));

  const gomod = await tryReadFile(join(dir, 'go.mod'));
  if (gomod) extractFromGoMod(gomod).forEach((t) => techStack.add(t));

  const gemfile = await tryReadFile(join(dir, 'Gemfile'));
  if (gemfile) techStack.add('Ruby');

  const pubspec = await tryReadFile(join(dir, 'pubspec.yaml'));
  if (pubspec) techStack.add('Flutter');

  // 4. CLAUDE.md (project architecture description)
  const claudeMd = await tryReadFile(join(dir, 'CLAUDE.md'));
  if (claudeMd) {
    const result = extractFromClaudeMd(claudeMd);
    result.techs.forEach((t) => techStack.add(t));
    result.keywords.forEach((k) => keywords.add(k));
  }

  // 5. .env.example / .env.sample (service integrations)
  const envExample = await tryReadFile(join(dir, '.env.example')) || await tryReadFile(join(dir, '.env.sample'));
  if (envExample) {
    extractFromEnvExample(envExample).forEach((t) => techStack.add(t));
  }

  // 6. README.md
  const readme = await tryReadFile(join(dir, 'README.md')) || await tryReadFile(join(dir, 'README'));
  if (readme) {
    extractKeywords(readme).forEach((k) => keywords.add(k));
    if (!description) {
      const firstPara = readme.split('\n\n').find((p) => p.trim() && !p.startsWith('#'));
      if (firstPara) description = firstPara.trim().slice(0, 200);
    }
  }

  // 7. Directory-level signals
  const dirSignals = await detectDirSignals(dir);
  dirSignals.forEach((s) => techStack.add(s));

  // 8. Entry file imports
  const entryTechs = await detectEntryImports(dir);
  entryTechs.forEach((t) => techStack.add(t));

  // 9. Extract keywords from descriptions and tech stack
  if (description) extractKeywords(description).forEach((k) => keywords.add(k));
  for (const tech of techStack) {
    extractKeywords(tech).forEach((k) => keywords.add(k));
  }

  return {
    name: projectName,
    techStack: [...techStack],
    keywords: [...keywords],
    description,
  };
}
