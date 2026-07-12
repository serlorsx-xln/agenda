#!/usr/bin/env node
/**
 * Ensures th.json and en.json have identical key paths.
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const thPath = join(root, "apps/web/messages/th.json");
const enPath = join(root, "apps/web/messages/en.json");

function collectKeys(obj, prefix = "") {
  const keys = [];
  for (const [key, value] of Object.entries(obj)) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (value !== null && typeof value === "object" && !Array.isArray(value)) {
      keys.push(...collectKeys(value, path));
    } else {
      keys.push(path);
    }
  }
  return keys;
}

const th = JSON.parse(readFileSync(thPath, "utf8"));
const en = JSON.parse(readFileSync(enPath, "utf8"));

const thKeys = new Set(collectKeys(th));
const enKeys = new Set(collectKeys(en));

const onlyTh = [...thKeys].filter((k) => !enKeys.has(k)).sort();
const onlyEn = [...enKeys].filter((k) => !thKeys.has(k)).sort();

if (onlyTh.length || onlyEn.length) {
  console.error("i18n key mismatch between th.json and en.json\n");
  if (onlyTh.length) {
    console.error(`Only in th.json (${onlyTh.length}):`);
    for (const k of onlyTh) console.error(`  + ${k}`);
  }
  if (onlyEn.length) {
    console.error(`Only in en.json (${onlyEn.length}):`);
    for (const k of onlyEn) console.error(`  - ${k}`);
  }
  process.exit(1);
}

console.log(`i18n parity OK (${thKeys.size} keys)`);
