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
    r = await fetch("data.enc", { cache: "no-store", signal: ctrl.signal });
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
  erro.textContent = "";
  btn.disabled = true;
  btn.textContent = "Abrindo…";
  try {
    const pacote = await carregarPacote();
    DADOS = await descriptografar(pacote, senha);
    sessionStorage.setItem("mkt_senha", senha); // some ao fechar a aba
    entrar();
  } catch (e) {
    // Mensagem específica: problema de carregamento vs. senha incorreta.
    erro.textContent = e && e.tipo === "carregar"
      ? e.message
      : "Senha incorreta. Tente de novo.";
    $("#senha").select();
  } finally {
    // Garante que o botão NUNCA fique preso em "Abrindo…".
    btn.disabled = false;
    btn.textContent = "Entrar";
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
  const hash = location.hash.replace("#", "") || "geral";
  mostrarSecao(hash);
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
  $("#menu-mobile").checked = false;
  window.scrollTo({ top: 0, behavior: "smooth" });
}

/* ---------- Renderização ---------- */
function renderTudo() {
  renderCabecalho();
  renderGeral();
  renderEstrategia();
  renderCalendario();
  renderTarefas();
  renderBanco();
  renderIdeiasClaude();
}

function renderCabecalho() {
  $("#atualizado").textContent = "Atualizado em " + esc(DADOS.meta.atualizadoEm);
}

function renderGeral() {
  const v = DADOS.visaoGeral;
  const c = $("#sec-geral .conteudo");
  c.innerHTML = "";
  c.appendChild(el("p", "lead", esc(v.resumo)));

  const grid = el("div", "cards");
  v.marcas.forEach((m) => {
    grid.appendChild(el("article", "card",
      `<h3>${esc(m.nome)} <span class="tag">${esc(m.instagram)}</span></h3>
       <p>${esc(m.angulo)}</p>
       <ul class="mini">
         <li><strong>Idiomas:</strong> ${esc(m.idiomas)}</li>
         <li><strong>Seguidores:</strong> ${esc(m.seguidores)}</li>
       </ul>`));
  });
  c.appendChild(grid);

  const a = v.acordo;
  c.appendChild(el("div", "box",
    `<h3>Acordo comercial</h3>
     <ul class="mini">
       <li><strong>Modelo:</strong> ${esc(a.modelo)}</li>
       <li><strong>Honorários:</strong> ${esc(a.honorarios)}</li>
       <li><strong>Verba de mídia:</strong> ${esc(a.verbaMidia)}</li>
       <li><strong>Reavaliação:</strong> ${esc(a.reavaliacao)}</li>
       <li><strong>Conversão:</strong> ${esc(a.conversao)}</li>
     </ul>`));
}

function renderEstrategia() {
  const e = DADOS.estrategia;
  const c = $("#sec-estrategia .conteudo");
  c.innerHTML = "";
  c.appendChild(el("p", "lead", esc(e.posicionamento)));

  c.appendChild(el("h3", null, "Regras fixas"));
  const regras = el("div", "cards");
  e.regrasFixas.forEach((r) =>
    regras.appendChild(el("article", "card",
      `<h3>${esc(r.titulo)}</h3><p>${esc(r.detalhe)}</p>`)));
  c.appendChild(regras);

  c.appendChild(el("h3", null, "Pilares de conteúdo"));
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
    c.appendChild(el("h3", null, titulo));
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
