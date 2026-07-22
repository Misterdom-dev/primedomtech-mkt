/* ===========================================================================
   crypto.js — descriptografia no navegador (Web Crypto API nativa)
   ---------------------------------------------------------------------------
   O painel guarda os dados em `data.enc`, cifrados com AES-GCM. A senha do
   usuário deriva a chave via PBKDF2. Sem a senha correta, o conteúdo é
   apenas bytes embaralhados — nem "ver código-fonte" revela nada.

   Formato do data.enc (JSON):
     { "v": 1, "salt": <base64>, "iv": <base64>, "ct": <base64> }
   =========================================================================== */

const PBKDF2_ITERACOES = 250000; // custo de derivação (mesmo valor no encrypt.mjs)

// Converte base64 -> Uint8Array
function base64ParaBytes(b64) {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

// Deriva a chave AES-GCM a partir da senha + salt
async function derivarChave(senha, salt) {
  const material = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(senha),
    { name: "PBKDF2" },
    false,
    ["deriveKey"]
  );
  return crypto.subtle.deriveKey(
    { name: "PBKDF2", salt, iterations: PBKDF2_ITERACOES, hash: "SHA-256" },
    material,
    { name: "AES-GCM", length: 256 },
    false,
    ["decrypt"]
  );
}

/**
 * Tenta descriptografar o pacote com a senha.
 * @returns {Promise<object>} o conteúdo (objeto JS) se a senha estiver certa.
 * @throws se a senha estiver errada ou o pacote for inválido.
 */
async function descriptografar(pacote, senha) {
  const salt = base64ParaBytes(pacote.salt);
  const iv = base64ParaBytes(pacote.iv);
  const ct = base64ParaBytes(pacote.ct);
  const chave = await derivarChave(senha, salt);
  // AES-GCM lança exceção automaticamente se a senha (chave) estiver errada.
  const claro = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, chave, ct);
  const texto = new TextDecoder().decode(claro);
  return JSON.parse(texto);
}
