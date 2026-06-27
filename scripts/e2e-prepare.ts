#!/usr/bin/env bun
/**
 * Prepara o ambiente E2E:
 *  1) Se .env.test não existir, copia de .env.test.example.
 *  2) Carrega .env.test em process.env.
 *  3) Valida que todas as variáveis obrigatórias estão preenchidas
 *     e não contêm placeholders (ex.: "cole-aqui", "troque-esta-senha",
 *     "00000000-0000-0000-0000-000000000000").
 *
 * Sai com código 1 (bloqueando os testes) se algo estiver faltando.
 */
import { existsSync, copyFileSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const ROOT = process.cwd();
const ENV_FILE = resolve(ROOT, ".env.test");
const EXAMPLE_FILE = resolve(ROOT, ".env.test.example");

const REQUIRED = [
  "E2E_BASE_URL",
  "E2E_TENANT_EMAIL",
  "E2E_TENANT_PASSWORD",
  "E2E_PROPERTY_ID",
  "SUPABASE_URL",
  "SUPABASE_SERVICE_ROLE_KEY",
] as const;

const PLACEHOLDER_PATTERNS = [
  /cole-aqui/i,
  /troque-esta-senha/i,
  /^0{8}-0{4}-0{4}-0{4}-0{12}$/,
  /exemplo\.com$/i,
];

function log(level: "info" | "warn" | "error", msg: string) {
  const tag = { info: "ℹ️ ", warn: "⚠️ ", error: "❌" }[level];
  console.log(`${tag} ${msg}`);
}

if (!existsSync(ENV_FILE)) {
  if (!existsSync(EXAMPLE_FILE)) {
    log("error", "Nem .env.test nem .env.test.example existem na raiz.");
    process.exit(1);
  }
  copyFileSync(EXAMPLE_FILE, ENV_FILE);
  log("info", ".env.test criado a partir de .env.test.example — preencha os valores e rode novamente.");
  process.exit(1);
}

// Parser .env minimalista (KEY=VALUE, ignora # e linhas vazias, tira aspas).
const parsed: Record<string, string> = {};
for (const raw of readFileSync(ENV_FILE, "utf8").split(/\r?\n/)) {
  const line = raw.trim();
  if (!line || line.startsWith("#")) continue;
  const eq = line.indexOf("=");
  if (eq < 0) continue;
  const key = line.slice(0, eq).trim();
  let value = line.slice(eq + 1).trim();
  if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
    value = value.slice(1, -1);
  }
  parsed[key] = value;
  if (process.env[key] === undefined) process.env[key] = value;
}

const missing: string[] = [];
const placeholders: string[] = [];

for (const key of REQUIRED) {
  const value = (process.env[key] ?? parsed[key] ?? "").trim();
  if (!value) {
    missing.push(key);
    continue;
  }
  if (PLACEHOLDER_PATTERNS.some((re) => re.test(value))) {
    placeholders.push(key);
  }
}

if (missing.length || placeholders.length) {
  if (missing.length) log("error", `Variáveis ausentes em .env.test: ${missing.join(", ")}`);
  if (placeholders.length)
    log("error", `Variáveis com valor de placeholder em .env.test: ${placeholders.join(", ")}`);
  log("info", "Edite .env.test, preencha com valores reais e rode novamente.");
  process.exit(1);
}

log("info", "Ambiente E2E validado — todas as variáveis estão preenchidas.");
