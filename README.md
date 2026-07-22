# Painel MKT — `mkt.primedomtech.com`

Painel **interno** de marketing (cliente Altamar & Tropical Aqua). Site estático,
sem build, com o conteúdo **criptografado** e protegido por senha. Serve para o Dom e a
equipe de criativos acompanharem pautas, calendário, tarefas e ideias sem troca manual.

## Como funciona a segurança

- O conteúdo real fica em `build/content.json` (**em claro, NUNCA vai pro git** — está no `.gitignore`).
- O `encrypt.mjs` cifra esse JSON com sua senha (PBKDF2-SHA256 250k + AES-256-GCM) e gera o `data.enc`.
- No site publicado só existe o `data.enc` (bytes embaralhados). O navegador pede a senha,
  deriva a chave e descriptografa **localmente**. Sem a senha, nem "ver código-fonte" revela nada.
- `robots.txt` + `<meta name="robots" noindex>` mantêm o painel fora do Google.

> **Senha:** definida por você ao gerar o `data.enc` (não fica salva em lugar nenhum do código).
> Para trocar, veja "Atualizar o conteúdo" abaixo. Use uma senha **forte** — o repositório é
> público, então o `data.enc` cifrado fica exposto (a segurança depende inteiramente da senha).

## Atualizar o conteúdo (rotina do Dom)

1. Edite **`build/content.json`** (adicionar peça, mudar status de tarefa, nova ideia…).
2. Regenere o arquivo cifrado:
   ```bash
   cd primedomtech-mkt
   node build/encrypt.mjs            # vai pedir a senha
   # ou:  MKT_SENHA="suasenha" node build/encrypt.mjs
   ```
3. Publique: `git add data.enc && git commit -m "atualiza painel" && git push`.

**Trocar a senha:** basta rodar o passo 2 com a senha nova — o `data.enc` passa a exigir a nova senha.

## Preview local

```bash
cd primedomtech-mkt
python3 -m http.server 8000
# abra http://localhost:8000  (senha: a que você usou pra gerar o data.enc)
```
(Servidor local é necessário: o painel lê `data.enc` via fetch, bloqueado em `file://`.)

## Publicar em `mkt.primedomtech.com` (GitHub Pages)

1. **Repositório novo** no GitHub (ex.: `Misterdom-dev/primedomtech-mkt`). Suba esta pasta.
   > ⚠️ Confirme que o `build/content.json` **não** foi commitado (`git status` não deve listá-lo).
2. **Settings → Pages** → Branch `main` / raiz `/`. O `CNAME` já contém `mkt.primedomtech.com`.
3. **DNS na Cloudflare** — registro `CNAME`, nome `mkt`, destino `misterdom-dev.github.io`.
   > Se estiver com o proxy da Cloudflare ligado (nuvem laranja), pode dar conflito de
   > certificado no começo. Se o HTTPS não subir, deixe o registro como **DNS only**
   > (nuvem cinza) para o GitHub emitir o certificado, e reative o proxy depois se quiser.
4. Aguarde a propagação (minutos a ~1h). O GitHub emite o HTTPS automaticamente.
   Pronto: `https://mkt.primedomtech.com`.

> Isso é **independente** do site principal `primedomtech.com` (outro repositório). Um não afeta o outro.

## Estrutura

```
primedomtech-mkt/
├── index.html              # tela de login + app
├── data.enc                # conteúdo CIFRADO (publicado)
├── CNAME                   # mkt.primedomtech.com
├── robots.txt              # noindex
├── favicon.svg
├── assets/
│   ├── css/styles.css
│   └── js/
│       ├── crypto.js       # descriptografia no navegador
│       └── app.js          # login + render das seções
└── build/
    ├── content.json        # FONTE DA VERDADE em claro — NÃO commitar
    └── encrypt.mjs         # gera o data.enc
```

## Seções do painel

Visão geral · Tarefas dos criativos · Calendário do mês · Estratégia · Banco de ideias · Ideias novas (Claude).
