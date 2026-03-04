#!/usr/bin/env node
// sync.js — keep web twin in sync with the extension (source of truth)
//
// Extracts COLORS, SIZES, and AcmeLandingCard from the extension's index.js
// and patches them into the web twin's App.jsx, then optionally pushes.
//
// Usage:
//   node sync.js            # dry run — shows what changed, writes file
//   node sync.js --push     # write + git commit + push → Vercel auto-deploys

import { readFileSync, writeFileSync } from 'fs';
import { execSync } from 'child_process';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SOURCE = resolve(__dirname, '../feedback-sandbox/frontend/index.js');
const TARGET = resolve(__dirname, 'src/App.jsx');
const PUSH = process.argv.includes('--push');

// Section delimiters — must match the comment headers in both files exactly (prefix match)
const BLOCKS = [
    {
        name: 'Visual Constants (COLORS + SIZES)',
        start: '// ─── Visual Constants',
        end:   '// ─── Animated Dots',
    },
    {
        name: 'AcmeLandingCard',
        start: '// ─── Acme Landing Card',
        end:   '// ─── App',
    },
];

function findBoundary(text, marker, after = 0) {
    const idx = text.indexOf(marker, after);
    if (idx === -1) throw new Error(`Marker not found: "${marker}"`);
    return idx;
}

function extractBlock(text, startMarker, endMarker) {
    const start = findBoundary(text, startMarker);
    const end   = findBoundary(text, endMarker, start + startMarker.length);
    return text.slice(start, end);
}

function replaceBlock(text, startMarker, endMarker, replacement) {
    const start = findBoundary(text, startMarker);
    const end   = findBoundary(text, endMarker, start + startMarker.length);
    return text.slice(0, start) + replacement + text.slice(end);
}

const source = readFileSync(SOURCE, 'utf8');
let target   = readFileSync(TARGET, 'utf8');
const original = target;

for (const { name, start, end } of BLOCKS) {
    const block = extractBlock(source, start, end);
    target = replaceBlock(target, start, end, block);
    console.log(`✓ Synced: ${name}`);
}

if (target === original) {
    console.log('No changes — web twin already matches extension.');
    process.exit(0);
}

writeFileSync(TARGET, target);
console.log(`✓ Wrote ${TARGET}`);

if (PUSH) {
    execSync('git add src/App.jsx', { stdio: 'inherit', cwd: __dirname });
    execSync(
        'git commit -m "sync: apply extension changes to web twin [auto]"',
        { stdio: 'inherit', cwd: __dirname }
    );
    execSync('git push', { stdio: 'inherit', cwd: __dirname });
    console.log('✓ Pushed — Vercel auto-deploy triggered (~30s)');
} else {
    console.log('Run with --push to commit and deploy.');
}
