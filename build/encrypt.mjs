/* ===========================================================================
   encrypt.mjs — gera o data.enc a partir do content.json (Node 18+)
   ---------------------------------------------------------------------------
   Uso:
     node build/encrypt.mjs                → pede a senha interativamente
     MKT_SENHA="suasenha" node build/encrypt.mjs   → senha via variável

   Lê  build/content.json  (fonte da verdade, em claro — não vai pro git)
   Grava  data.enc         (cifrado — este SIM é publicado)

   Mesmo esquema do navegador: PBKDF2-SHA256 (250k) + AES-256-GCM.
   =========================================================================== */

import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { createInterface } from "node:readline";

const PBKDF2_ITERACOES = 250000;
const __dirname = dirname(fileURLToPath(import.meta.url));
const RAIZ = join(__dirname, "..");

function perguntaSenha() {
  if (process.env.MKT_SENHA) return Promise.resolve(process.env.MKT_SENHA);
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) =>
    rl.question("Senha do painel: ", (r) => { rl.close(); resolve(r); })
  );
}

async function derivarChave(senha, salt) {
  const material = await crypto.subtle.importKey(
    "raw", new TextEncoder().encode(senha), { name: "PBKDF2" }, false, ["deriveKey"]
  );
  return crypto.subtle.deriveKey(
    { name: "PBKDF2", salt, iterations: PBKDF2_ITERACOES, hash: "SHA-256" },
    material, { name: "AES-GCM", length: 256 }, false, ["encrypt"]
  );
}

const b64 = (bytes) => Buffer.from(bytes).toString("base64");

async function main() {
  const senha = (await perguntaSenha()).trim();
  if (!senha) { console.error("✗ Senha vazia. Abortado."); process.exit(1); }

  const conteudo = await readFile(join(RAIZ, "build", "content.json"), "utf8");
  JSON.parse(conteudo); // valida o JSON antes de cifrar

  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const chave = await derivarChave(senha, salt);
  const ct = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv }, chave, new TextEncoder().encode(conteudo)
  );

  const pacote = { v: 1, salt: b64(salt), iv: b64(iv), ct: b64(new Uint8Array(ct)) };
  await writeFile(join(RAIZ, "data.enc"), JSON.stringify(pacote));
  console.log("✓ data.enc gerado. Publique este arquivo (o content.json NÃO vai pro git).");
}

main().catch((e) => { console.error("✗ Erro:", e.message); process.exit(1); });
