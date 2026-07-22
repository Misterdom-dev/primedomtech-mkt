/* ===========================================================================
   app.js — orquestra login, descriptografia e renderização do painel
   =========================================================================== */

const $ = (sel, ctx = document) => ctx.querySelector(sel);
const el = (tag, cls, html) => {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (html != null) n.innerHTML = html;
  return n;
};
// Escapa texto vindo dos dados antes de injetar como HTML
const esc = (s) => String(s == null ? "" : s)
  .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
  .replace(/"/g, "&quot;");

let DADOS = null;

// Erro de senha (chave errada) vem como OperationError no AES-GCM.
const ehErroDeSenha = (e) => e && (e.name === "OperationError" || e.name === "InvalidAccessError");

// Busca o data.enc com timeout — nunca pendura a UI. Distingue os erros:
//  - "carregar" (rede/servidor/timeout)  →  mensagem de ambiente
//  - deixa o erro de senha para o decrypt.
async function carregarPacote() {
  if (!(window.crypto && crypto.subtle)) {
    const err = new Error("Web Crypto indisponível — abra o painel por um endereço https:// ou http://localhost, não pelo arquivo (file://).");
    err.tipo = "carregar";
    throw err;
  }
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 8000);
  let r;
  try {
    // cache-busting (?_=…) garante que nunca peguemos um data.enc antigo do cache
    r = await fetch("data.enc?_=" + Date.now(), { cache: "no-store", signal: ctrl.signal });
  } catch (e) {
    const err = new Error("Não consegui carregar os dados. O preview está no ar? (rode o servidor local e recarregue.)");
    err.tipo = "carregar";
    throw err;
  } finally {
    clearTimeout(timer);
  }
  if (!r.ok) {
    const err = new Error("Arquivo de dados não encontrado (data.enc).");
    err.tipo = "carregar";
    throw err;
  }
  return r.json();
}

/* ---------- Login ---------- */
async function tentarLogin(ev) {
  ev.preventDefault();
  const erro = $("#login-erro");
  const btn = $("#login-btn");
  const senha = $("#senha").value;
  const reverter = () => { btn.disabled = false; btn.textContent = "Entrar"; };
  erro.textContent = "";
  btn.disabled = true;
  btn.textContent = "Abrindo…";

  // Etapa 1: carregar + descriptografar (aqui um erro = senha ou carregamento)
  let dados;
  try {
    const pacote = await carregarPacote();
    dados = await descriptografar(pacote, senha);
  } catch (e) {
    erro.textContent = e && e.tipo === "carregar"
      ? e.message
      : "Senha incorreta. Tente de novo.";
    $("#senha").select();
    reverter();
    return;
  }

  // Senha correta a partir daqui. Guardar a senha não pode derrubar o login.
  DADOS = dados;
  try { sessionStorage.setItem("mkt_senha", senha); } catch (_) { /* modo privado: ok */ }

  // Etapa 2: montar o painel. Um erro aqui NÃO é senha — mostrar o motivo real.
  try {
    entrar();
  } catch (e) {
    erro.textContent = "Erro ao montar o painel: [" + (e && e.name) + "] " + (e && e.message);
    // desfaz o estado pela metade para o usuário ver a mensagem na tela de login
    $("#tela-login").hidden = false;
    $("#app").hidden = true;
    reverter();
  }
}

// Auto-login se a senha ainda estiver na sessão (não repetir a cada navegação)
async function tentarAutoLogin() {
  const senha = sessionStorage.getItem("mkt_senha");
  if (!senha) return false;
  try {
    const pacote = await carregarPacote();
    DADOS = await descriptografar(pacote, senha);
    entrar();
    return true;
  } catch { sessionStorage.removeItem("mkt_senha"); return false; }
}

function entrar() {
  $("#tela-login").hidden = true;
  $("#app").hidden = false;
  renderTudo();
  const secoes = ["inicio", "tarefas", "calendario", "estrategia", "banco", "ideias"];
  const hash = location.hash.replace("#", "");
  mostrarSecao(secoes.includes(hash) ? hash : "inicio");
}

function sair() {
  sessionStorage.removeItem("mkt_senha");
  location.reload();
}

/* ---------- Navegação ---------- */
function mostrarSecao(id) {
  document.querySelectorAll(".secao").forEach((s) => (s.hidden = s.id !== "sec-" + id));
  document.querySelectorAll(".nav-link").forEach((a) =>
    a.classList.toggle("ativo", a.dataset.sec === id)
  );
  window.scrollTo({ top: 0, behavior: "smooth" });
}

/* ---------- Renderização ---------- */
function renderTudo() {
  renderInicio();
  renderEstrategia();
  renderCalendario();
  renderTarefas();
  renderBanco();
  renderIdeiasClaude();
}

function renderInicio() {
  const v = DADOS.visaoGeral;
  const t = DADOS.tarefasCriativos.itens;
  const prontas = t.filter((i) => !i.depende_cliente).length;
  const aguardando = t.filter((i) => i.depende_cliente).length;
  const pecas = DADOS.calendario.pecas.length;
  const c = $("#sec-inicio");
  c.innerHTML =
    `<div class="hero">
       <p class="hero-data">Atualizado em ${esc(v && DADOS.meta.atualizadoEm)}</p>
       <h1 class="hero-saud">${esc(v.saudacao)}<span class="virg">.</span></h1>
       <p class="hero-sub">${esc(v.resumo)}</p>
     </div>
     <div class="stats">
       <div class="stat -ok"><div class="stat-num">${prontas}</div><div class="stat-lab">Pra começar já</div></div>
       <div class="stat -espera"><div class="stat-num">${aguardando}</div><div class="stat-lab">Aguardando cliente</div></div>
       <div class="stat -total"><div class="stat-num">${pecas}</div><div class="stat-lab">Peças no mês</div></div>
     </div>
     <button class="atalho" id="ir-tarefas">Ver minhas tarefas →</button>
     <h3 class="bloco-tit">As duas marcas</h3>
     <div class="cards" id="inicio-marcas"></div>`;
  const grid = $("#inicio-marcas");
  v.marcas.forEach((m) => {
    grid.appendChild(el("article", "card",
      `<h3>${esc(m.nome)} <span class="tag">${esc(m.instagram)}</span></h3>
       <p>${esc(m.angulo)}</p>
       <ul class="mini">
         <li><strong>Idiomas:</strong> ${esc(m.idiomas)}</li>
         <li><strong>Tom:</strong> ${esc(m.tom)}</li>
       </ul>`));
  });
  $("#ir-tarefas").addEventListener("click", () => {
    location.hash = "tarefas";
    mostrarSecao("tarefas");
  });
}

function renderEstrategia() {
  const e = DADOS.estrategia;
  const c = $("#sec-estrategia .conteudo");
  c.innerHTML = "";
  c.appendChild(el("p", "lead", esc(e.posicionamento)));

  c.appendChild(el("h3", "bloco-tit", "Regras fixas"));
  const regras = el("div", "cards");
  e.regrasFixas.forEach((r) =>
    regras.appendChild(el("article", "card",
      `<h3>${esc(r.titulo)}</h3><p>${esc(r.detalhe)}</p>`)));
  c.appendChild(regras);

  c.appendChild(el("h3", "bloco-tit", "Pilares de conteúdo"));
  e.pilares.forEach((p) => {
    const linha = el("div", "pilar");
    linha.innerHTML =
      `<div class="pilar-topo">
         <span class="dot" style="background:${esc(p.cor)}"></span>
         <strong>${esc(p.nome)}</strong>
         <span class="peso">${esc(p.peso)}%</span>
       </div>
       <div class="barra"><span style="width:${esc(p.peso)}%;background:${esc(p.cor)}"></span></div>
       <p>${esc(p.descricao)}</p>`;
    c.appendChild(linha);
  });
}

function renderCalendario() {
  const cal = DADOS.calendario;
  const c = $("#sec-calendario .conteudo");
  c.innerHTML = "";
  c.appendChild(el("p", "lead",
    `<strong>${esc(cal.marca)} — ${esc(cal.mes)}.</strong> ${cal.pecas.length} peças no mês.`));

  cal.pecas.forEach((p) => {
    const card = el("article", "peca" + (p.destaque ? " destaque" : ""));
    card.innerHTML =
      `<div class="peca-topo">
         <span class="data">${esc(p.data)}</span>
         <span class="badge">${esc(p.formato)}</span>
         <span class="status s-${esc(p.status).replace(/\s+/g, "-")}">${esc(p.status)}</span>
       </div>
       <h3>${p.destaque ? "⭐ " : ""}${esc(p.titulo)}</h3>
       <ul class="mini">
         <li><strong>Pilar:</strong> ${esc(p.pilar)}</li>
         <li><strong>Idioma:</strong> ${esc(p.idioma)} · <strong>CTA:</strong> ${esc(p.cta)}</li>
         <li><strong>Ativo:</strong> ${esc(p.ativo)}</li>
       </ul>`;
    c.appendChild(card);
  });
}

function renderTarefas() {
  const t = DADOS.tarefasCriativos;
  const c = $("#sec-tarefas .conteudo");
  c.innerHTML = "";
  c.appendChild(el("p", "lead", esc(t.intro)));

  const prontas = t.itens.filter((i) => !i.depende_cliente);
  const aguardando = t.itens.filter((i) => i.depende_cliente);

  const bloco = (titulo, itens, classe) => {
    if (!itens.length) return;
    c.appendChild(el("h3", "bloco-tit", titulo));
    itens.forEach((i) => {
      const card = el("article", "tarefa " + classe);
      card.innerHTML =
        `<div class="peca-topo">
           <span class="badge">${esc(i.formato)}</span>
           <span class="data">📅 ${esc(i.prazo)}</span>
         </div>
         <p class="tarefa-txt">${esc(i.o_que_fazer)}</p>
         <p class="obs">${esc(i.obs)}</p>`;
      c.appendChild(card);
    });
  };
  bloco("✅ Pode começar agora (não depende do cliente)", prontas, "ok");
  bloco("⏳ Aguardando material do cliente", aguardando, "hold");
}

function renderBanco() {
  const b = DADOS.bancoIdeias;
  const c = $("#sec-banco .conteudo");
  c.innerHTML = "";
  c.appendChild(el("p", "lead", esc(b.intro)));
  b.grupos.forEach((g) => {
    const det = el("details", "grupo");
    det.appendChild(el("summary", null, esc(g.pilar)));
    const ul = el("ul", "lista");
    g.ideias.forEach((i) => ul.appendChild(el("li", null, esc(i))));
    det.appendChild(ul);
    c.appendChild(det);
  });
}

function renderIdeiasClaude() {
  const ic = DADOS.ideiasClaude;
  const c = $("#sec-ideias .conteudo");
  c.innerHTML = "";
  c.appendChild(el("p", "lead", esc(ic.intro)));
  const ul = el("ul", "lista destaque-lista");
  ic.itens.forEach((i) => ul.appendChild(el("li", null, esc(i))));
  c.appendChild(ul);
}

/* ---------- Rede de segurança: nenhum erro falha em silêncio ---------- */
function mostrarErroGlobal(msg) {
  const erro = document.getElementById("login-erro");
  const login = document.getElementById("tela-login");
  if (erro && login && !login.hidden) erro.textContent = "Falha: " + msg;
}
window.addEventListener("error", (e) =>
  mostrarErroGlobal((e.error && e.error.name ? "[" + e.error.name + "] " : "") + (e.message || e.error)));
window.addEventListener("unhandledrejection", (e) =>
  mostrarErroGlobal("promessa: " + (e.reason && e.reason.message ? e.reason.message : e.reason)));

/* ---------- Boot ---------- */
document.addEventListener("DOMContentLoaded", async () => {
  $("#login-form").addEventListener("submit", tentarLogin);
  $("#sair").addEventListener("click", sair);
  document.querySelectorAll(".nav-link").forEach((a) =>
    a.addEventListener("click", (e) => {
      e.preventDefault();
      location.hash = a.dataset.sec;
      mostrarSecao(a.dataset.sec);
    })
  );
  const entrou = await tentarAutoLogin();
  if (!entrou) $("#senha").focus();
});
