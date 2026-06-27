#!/usr/bin/env bun
/**
 * Prepara e valida o ambiente E2E em modo fail-fast.
 *
 *  1) Se .env.test não existir, copia de .env.test.example e aborta.
 *  2) Carrega .env.test em process.env (sem sobrescrever valores já existentes).
 *  3) Valida CADA variável obrigatória individualmente e imprime uma tabela
 *     mostrando exatamente o que está OK, ausente ou inválido — antes de
 *     qualquer teste rodar. Sai com código 1 ao primeiro problema agregado.
 */
import { existsSync, copyFileSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const ROOT = process.cwd();
const ENV_FILE = resolve(ROOT, ".env.test");
const EXAMPLE_FILE = resolve(ROOT, ".env.test.example");

type Rule = {
  key: string;
  // valor inválido -> mensagem; null = ok
  validate: (v: string) => string | null;
  hint: string;
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ZERO_UUID = "00000000-0000-0000-0000-000000000000";

const RULES: Rule[] = [
  {
    key: "E2E_BASE_URL",
    hint: "ex.: http://localhost:8080",
    validate: (v) => {
      try {
        const u = new URL(v);
        if (!/^https?:$/.test(u.protocol)) return "deve usar http:// ou https://";
        return null;
      } catch {
        return "URL inválida";
      }
    },
  },
  {
    key: "E2E_TENANT_EMAIL",
    hint: "e-mail real de um tenant de teste cadastrado",
    validate: (v) => {
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)) return "formato de e-mail inválido";
      if (/@exemplo\.com$/i.test(v)) return "ainda usando placeholder @exemplo.com";
      return null;
    },
  },
  {
    key: "E2E_TENANT_PASSWORD",
    hint: "senha real do tenant de teste (>= 8 chars)",
    validate: (v) => {
      if (/troque-esta-senha/i.test(v)) return "ainda usando placeholder 'troque-esta-senha'";
      if (v.length < 8) return "muito curta (< 8 caracteres)";
      return null;
    },
  },
  {
    key: "E2E_PROPERTY_ID",
    hint: "UUID de um imóvel publicado não desbloqueado pelo tenant",
    validate: (v) => {
      if (!UUID_RE.test(v)) return "não é um UUID válido";
      if (v.toLowerCase() === ZERO_UUID) return "ainda usando UUID zerado de placeholder";
      return null;
    },
  },
  {
    key: "SUPABASE_URL",
    hint: "ex.: https://<ref>.supabase.co",
    validate: (v) => {
      try {
        const u = new URL(v);
        if (u.protocol !== "https:") return "deve usar https://";
        if (!/\.supabase\.co$/i.test(u.hostname)) return "host deve terminar em .supabase.co";
        return null;
      } catch {
        return "URL inválida";
      }
    },
  },
  {
    key: "SUPABASE_SERVICE_ROLE_KEY",
    hint: "service role (apenas local) — começa com 'eyJ' ou 'sb_secret_'",
    validate: (v) => {
      if (/cole-aqui/i.test(v)) return "ainda usando placeholder 'cole-aqui...'";
      if (v.length < 40) return "comprimento suspeito (< 40 chars)";
      if (!/^eyJ/.test(v) && !/^sb_secret_/.test(v))
        return "formato inesperado (esperado JWT 'eyJ...' ou 'sb_secret_...')";
      return null;
    },
  },
];

const C = {
  ok: "\x1b[32m✓\x1b[0m",
  bad: "\x1b[31m✗\x1b[0m",
  miss: "\x1b[33m∅\x1b[0m",
  dim: (s: string) => `\x1b[2m${s}\x1b[0m`,
  bold: (s: string) => `\x1b[1m${s}\x1b[0m`,
};

function abort(msg: string): never {
  console.error(`\x1b[31m❌ ${msg}\x1b[0m`);
  process.exit(1);
}

// 1) bootstrap .env.test
if (!existsSync(ENV_FILE)) {
  if (!existsSync(EXAMPLE_FILE))
    abort("Nem .env.test nem .env.test.example existem na raiz do projeto.");
  copyFileSync(EXAMPLE_FILE, ENV_FILE);
  abort(".env.test criado a partir de .env.test.example — preencha os valores e rode novamente.");
}

// 2) parser .env minimalista
const parsed: Record<string, string> = {};
for (const raw of readFileSync(ENV_FILE, "utf8").split(/\r?\n/)) {
  const line = raw.trim();
  if (!line || line.startsWith("#")) continue;
  const eq = line.indexOf("=");
  if (eq < 0) continue;
  const key = line.slice(0, eq).trim();
  let value = line.slice(eq + 1).trim();
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    value = value.slice(1, -1);
  }
  parsed[key] = value;
  if (process.env[key] === undefined) process.env[key] = value;
}

// 3) valida cada regra
console.log(C.bold("\n🔎 Validando variáveis E2E (.env.test)\n"));

const missing: string[] = [];
const invalid: { key: string; reason: string; hint: string }[] = [];

for (const rule of RULES) {
  const value = (process.env[rule.key] ?? parsed[rule.key] ?? "").trim();
  if (!value) {
    missing.push(rule.key);
    console.log(`  ${C.miss} ${rule.key.padEnd(28)} ${C.dim("ausente — " + rule.hint)}`);
    continue;
  }
  const err = rule.validate(value);
  if (err) {
    invalid.push({ key: rule.key, reason: err, hint: rule.hint });
    console.log(`  ${C.bad} ${rule.key.padEnd(28)} ${err}  ${C.dim("(" + rule.hint + ")")}`);
  } else {
    console.log(`  ${C.ok} ${rule.key.padEnd(28)} ${C.dim("ok")}`);
  }
}

const total = missing.length + invalid.length;
if (total > 0) {
  console.error(
    `\n\x1b[31m❌ ${total} problema(s) em .env.test — corrija acima e rode novamente.\x1b[0m\n`,
  );
  if (missing.length) console.error(`   ausentes: ${missing.join(", ")}`);
  if (invalid.length) console.error(`   inválidas: ${invalid.map((i) => i.key).join(", ")}`);
  process.exit(1);
}

console.log(`\n\x1b[32m✅ Ambiente E2E validado — ${RULES.length}/${RULES.length} variáveis OK.\x1b[0m\n`);
