/**
 * ============================================================================
 *  ÁREA DO PROFESSOR
 * ============================================================================
 *  Fluxo:
 *   Login → [escolha do componente, só se tiver mais de um] → Confirmação
 *   → Ficha de cada estudante (foto, nome, menção e perguntas) → Revisão → Envio
 *
 *  As respostas são salvas automaticamente no aparelho (localStorage) a cada
 *  toque, para não se perderem se a página for fechada ou atualizada.
 * ============================================================================
 */
(function () {
  'use strict';
  const { ESCALAS, NAO_OBSERVADO, MENCOES, INDICACOES, IND_ACOMP, IND_DISC, esc, doisDigitos, plural, aviso } = PC;

  const app = document.getElementById('app');
  const rodape = document.getElementById('rodape');
  const sobre = document.getElementById('sobreposicao');
  const topoSub = document.getElementById('topo-sub');
  const topoAcoes = document.getElementById('topo-acoes');
  document.getElementById('faixa').innerHTML = PC.faixaDemo();

  const CHAVE_SESSAO = 'pc_prof_sessao';
  const MIN_TEXTO = 10;

  /** Estado da aplicação. */
  const E = {
    sessao: null,      // { token, login, nome, atribuicoes, periodo, aberto }
    turma: '', componente: '',
    estudantes: [],    // [{ numero, nome }]
    fotos: {},         // { nome: dataURL }
    envio: null,       // envio anterior (se houver)
    anteriores: [],
    lista: [],         // nomes, na ordem da chamada
    respostas: {},     // { nome: { mencao, competencias, ..., indicacao } }
    indice: 0
  };

  /* ------------------------------------------------------------------------
   * Utilitários
   * ---------------------------------------------------------------------- */

  function render(html, htmlRodape) {
    fecharLista();
    app.innerHTML = html;
    rodape.innerHTML = htmlRodape ? '<div class="rodape-fixo"><div class="rodape-interno">' + htmlRodape + '</div></div>' : '';
    window.scrollTo(0, 0);
  }

  function carregando(msg) {
    render('<div class="carregando"><div class="giro"></div>' + esc(msg || 'Carregando…') + '</div>');
  }

  function atualizarTopo() {
    if (E.sessao) {
      topoSub.textContent = E.sessao.nome;
      topoAcoes.innerHTML = '<button class="btn-link" id="btn-sair" type="button">Sair</button>';
      document.getElementById('btn-sair').onclick = sair;
    } else {
      topoSub.textContent = window.CONFIG.NOME_ESCOLA || '';
      topoAcoes.innerHTML = '';
    }
  }

  function chaveRascunho() {
    return ['pc_rascunho', E.sessao.login, E.sessao.periodo, E.turma, E.componente].join('|');
  }

  function salvarRascunho() {
    if (!E.sessao || !E.turma) return;
    PC.local.gravar(chaveRascunho(), { respostas: E.respostas, indice: E.indice, salvoEm: new Date().toISOString() });
  }

  function estudante(nome) { return E.estudantes.find(e => e.nome === nome) || { nome: nome, numero: null }; }

  /** Campos que ainda faltam na ficha de um estudante. */
  function faltando(r) {
    r = r || {};
    const f = [];
    if (!r.mencao) f.push('mencao');
    ESCALAS.forEach(s => { if (!r[s.id]) f.push(s.id); });
    if (!r.haRegistro) f.push('haRegistro');
    else if (r.haRegistro === 'Sim' && String(r.registro || '').trim().length < MIN_TEXTO) f.push('registro');
    if (!r.indicacao) f.push('indicacao');
    return f;
  }
  function completo(nome) { return faltando(E.respostas[nome]).length === 0; }
  function iniciado(nome) {
    const r = E.respostas[nome];
    return !!r && Object.keys(r).some(k => r[k]);
  }

  function tratarErro(err) {
    if (err.codigo === 'SESSAO') {
      PC.sessao.remover(CHAVE_SESSAO);
      E.sessao = null;
      atualizarTopo();
      telaLogin('Sua sessão expirou. Entre novamente — suas respostas continuam salvas neste aparelho.');
      return;
    }
    aviso(err.message, 'erro');
  }

  function periodoCurto() {
    // "3º Bimestre/2026" → "3º bimestre"
    const p = String(E.sessao.periodo || '').split('/')[0].trim();
    return p ? p.charAt(0) + p.slice(1).toLowerCase() : 'período';
  }

  /* ------------------------------------------------------------------------
   * 1. LOGIN
   * ---------------------------------------------------------------------- */

  function telaLogin(mensagem) {
    atualizarTopo();
    render(
      '<h1>PRÉ-CONSELHO PEDAGÓGICO</h1>' +
      '<div class="intro">' +
      '<p>Este instrumento tem como objetivo contribuir para o acompanhamento pedagógico dos estudantes e subsidiar as discussões do Conselho de Classe.</p>' +
      '<p>Os registros devem considerar situações observáveis relacionadas ao processo de ensino e aprendizagem, evitando julgamentos pessoais ou juízos de valor.</p>' +
      '</div>' +
      (mensagem ? '<div class="alerta">' + esc(mensagem) + '</div>' : '') +
      '<form class="cartao" id="form-login" autocomplete="on">' +
      '<h2>Entrar</h2>' +
      '<div class="campo"><label for="login">Login</label>' +
      '<input id="login" name="username" autocomplete="username" autocapitalize="none" spellcheck="false" required></div>' +
      '<div class="campo"><label for="senha">Senha</label>' +
      '<input id="senha" name="password" type="password" autocomplete="current-password" required></div>' +
      '<div id="erro-login"></div>' +
      '<button class="btn btn-bloco" type="submit">ENTRAR</button>' +
      '<p class="pequeno texto-2" style="margin:12px 0 0">Login e senha são pessoais e foram enviados pela coordenação.</p>' +
      (PC.MODO_DEMO ? '<p class="pequeno texto-2" style="margin:8px 0 0">Demonstração: login <b>quimica</b>, <b>matematica</b>, <b>biologia</b>… · senha <b>1234</b></p>' : '') +
      '</form>'
    );
    const form = document.getElementById('form-login');
    form.onsubmit = async function (ev) {
      ev.preventDefault();
      const botao = form.querySelector('button');
      botao.disabled = true; botao.textContent = 'ENTRANDO…';
      try {
        const r = await PC.api('loginProfessor', { login: form.login.value.trim(), senha: form.senha.value });
        E.sessao = { token: r.token, login: r.login, nome: r.nome, atribuicoes: r.atribuicoes, periodo: r.periodo, aberto: r.aberto };
        PC.sessao.gravar(CHAVE_SESSAO, E.sessao);
        atualizarTopo();
        inicio();
      } catch (err) {
        document.getElementById('erro-login').innerHTML = '<div class="alerta alerta-erro">' + esc(err.message) + '</div>';
        botao.disabled = false; botao.textContent = 'ENTRAR';
      }
    };
    document.getElementById('login').focus();
  }

  async function sair() {
    const token = E.sessao && E.sessao.token;
    PC.sessao.remover(CHAVE_SESSAO);
    E.sessao = null; E.turma = ''; E.componente = '';
    telaLogin();
    if (token) { try { await PC.api('sair', { token }); } catch (e) { /* ignora */ } }
  }

  /** Depois do login: um componente só → vai direto; vários → escolhe. */
  function inicio() {
    const at = E.sessao.atribuicoes;
    if (at.length === 1) {
      E.turma = at[0].turma; E.componente = at[0].componente;
      abrirTurma();
    } else {
      telaEscolha();
    }
  }

  /* ------------------------------------------------------------------------
   * 2. ESCOLHA DO COMPONENTE (só para quem leciona mais de um)
   * ---------------------------------------------------------------------- */

  function telaEscolha() {
    const at = E.sessao.atribuicoes;
    render(
      '<h1>Qual componente?</h1>' +
      '<p class="texto-2">Você leciona mais de um componente ou turma. Escolha sobre qual deseja registrar agora.</p>' +
      at.map((a, i) =>
        '<button class="opcao-modo" type="button" data-i="' + i + '"><strong>' + esc(a.turma) + '</strong>' + esc(a.componente) + '</button>').join('')
    );
    app.querySelectorAll('[data-i]').forEach(b => {
      b.onclick = () => { const a = at[Number(b.dataset.i)]; E.turma = a.turma; E.componente = a.componente; abrirTurma(); };
    });
  }

  async function abrirTurma() {
    carregando('Carregando a turma…');
    let r;
    try {
      r = await PC.api('abrirTurma', { token: E.sessao.token, turma: E.turma, componente: E.componente });
    } catch (err) {
      tratarErro(err);
      if (E.sessao) render('<div class="alerta alerta-erro">' + esc(err.message) + '</div>',
        '<button class="btn" id="tentar" type="button">TENTAR NOVAMENTE</button>');
      const t = document.getElementById('tentar'); if (t) t.onclick = abrirTurma;
      return;
    }
    E.sessao.periodo = r.periodo;
    E.sessao.aberto = r.aberto;
    PC.sessao.gravar(CHAVE_SESSAO, E.sessao);
    E.estudantes = r.estudantes;
    E.lista = E.estudantes.map(e => e.nome);
    E.envio = r.envio;
    E.anteriores = r.anteriores || [];
    E.respostas = {}; E.indice = 0;
    carregarFotos();
    telaConfirmacao();
  }

  /** Busca as fotos em segundo plano (a ficha funciona sem elas). */
  async function carregarFotos() {
    E.fotos = {};
    const turma = E.turma;
    try {
      const r = await PC.api('fotos', { token: E.sessao.token, turma: turma });
      if (turma !== E.turma) return;
      E.fotos = r.fotos || {};
      const nome = E.lista[E.indice];
      const el = document.getElementById('foto-ficha');
      if (el && nome && E.fotos[nome]) el.outerHTML = PC.htmlFoto(nome, E.fotos, 'foto-grande').replace('<img', '<img id="foto-ficha"');
    } catch (e) { /* sem fotos: segue com as iniciais */ }
  }

  /* ------------------------------------------------------------------------
   * 3. CONFIRMAÇÃO
   * ---------------------------------------------------------------------- */

  function telaConfirmacao() {
    const rasc = PC.local.ler(chaveRascunho());
    const temRascunho = rasc && rasc.respostas && Object.keys(rasc.respostas).some(k => E.lista.indexOf(k) >= 0);
    const multiplos = E.sessao.atribuicoes.length > 1;

    let corpo;
    if (!E.estudantes.length) {
      corpo = '<div class="alerta">Nenhum estudante cadastrado para esta turma. Procure a coordenação.</div>';
    } else if (!E.sessao.aberto) {
      corpo = '<div class="alerta alerta-erro">O recebimento de respostas está encerrado pela coordenação.</div>';
    } else {
      corpo =
        (E.envio ? '<div class="alerta alerta-info">Você já enviou este Pré-Conselho em <b>' + esc(PC.dataHora(E.envio.dataHora)) + '</b>. ' +
          'Se continuar, as respostas enviadas serão carregadas para revisão e um novo envio substituirá o anterior.</div>' : '') +
        (temRascunho
          ? '<div class="alerta">Há respostas <b>não enviadas</b> salvas neste aparelho em ' + esc(PC.dataHora(rasc.salvoEm)) + '.</div>' +
            '<div class="acoes"><button class="btn" id="continuar" type="button">CONTINUAR DE ONDE PAREI</button>' +
            '<button class="btn btn-secundario" id="recomecar" type="button">DESCARTAR E RECOMEÇAR</button></div>'
          : '<button class="btn btn-bloco" id="confirmar" type="button">CONFIRMAR E INICIAR</button>');
    }

    render(
      '<div class="cartao cartao-destaque confirmacao">' +
      '<p class="sobretitulo">Confirmação</p>' +
      '<p style="font-size:1.05rem">Você está enviando informações para o <b>Pré-Conselho</b> sobre o componente:</p>' +
      '<p class="componente-destaque">' + esc(E.componente) + '</p>' +
      '<dl class="resumo">' +
      '<div><dt>Turma</dt><dd>' + esc(E.turma) + '</dd></div>' +
      '<div><dt>Período</dt><dd>' + esc(E.sessao.periodo) + '</dd></div>' +
      '<div><dt>Estudantes</dt><dd>' + E.estudantes.length + '</dd></div>' +
      '</dl></div>' +
      corpo +
      (multiplos ? '<div style="text-align:center;margin-top:8px"><button class="btn-link" id="trocar" type="button">Trocar componente</button></div>' : '')
    );

    const confirmar = document.getElementById('confirmar');
    if (confirmar) confirmar.onclick = () => { carregarAnteriores(); E.indice = 0; salvarRascunho(); telaFicha(); };
    const continuar = document.getElementById('continuar');
    if (continuar) continuar.onclick = () => {
      Object.keys(rasc.respostas).forEach(k => { if (E.lista.indexOf(k) >= 0) E.respostas[k] = rasc.respostas[k]; });
      E.indice = Math.min(rasc.indice || 0, E.lista.length - 1);
      telaFicha();
    };
    const recomecar = document.getElementById('recomecar');
    if (recomecar) recomecar.onclick = () => {
      PC.local.remover(chaveRascunho());
      carregarAnteriores(); E.indice = 0; salvarRascunho(); telaFicha();
    };
    const trocar = document.getElementById('trocar');
    if (trocar) trocar.onclick = telaEscolha;
  }

  /** Preenche com o envio anterior do próprio professor (para revisar e reenviar). */
  function carregarAnteriores() {
    E.respostas = {};
    E.anteriores.forEach(a => {
      E.respostas[a.estudante] = {
        mencao: a.mencao, competencias: a.competencias, participacao: a.participacao, atividades: a.atividades,
        frequencia: a.frequencia, evolucao: a.evolucao, haRegistro: a.haRegistro,
        registro: a.registro, indicacao: a.indicacao
      };
    });
  }

  /* ------------------------------------------------------------------------
   * 4. FICHA DO ESTUDANTE
   * ---------------------------------------------------------------------- */

  function htmlChips(nomeCampo, opcoes, valor, extraClasse) {
    return '<div class="chips ' + (extraClasse || '') + '">' + opcoes.map(o =>
      '<label class="chip' + (o === NAO_OBSERVADO ? ' nao-obs' : '') + '">' +
      '<input type="radio" name="' + nomeCampo + '" value="' + esc(o) + '"' + (o === valor ? ' checked' : '') + '>' +
      '<span>' + esc(o) + '</span></label>').join('') + '</div>';
  }

  function htmlMencoes(valor) {
    return '<div class="mencoes">' + MENCOES.map(m =>
      '<label class="mencao mencao-' + m.valor.toLowerCase() + '">' +
      '<input type="radio" name="mencao" value="' + m.valor + '"' + (m.valor === valor ? ' checked' : '') + ' aria-label="' + m.valor + ' — ' + m.titulo + '">' +
      '<span><b>' + m.valor + '</b></span></label>').join('') + '</div>';
  }

  function progresso() {
    const total = E.lista.length || 1;
    const feitos = E.lista.filter(completo).length;
    return { feitos, pct: Math.round(feitos / total * 100) };
  }

  function htmlProgresso() {
    const p = progresso();
    return '<div class="progresso" id="progresso"><div class="progresso-trilho" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="' + p.pct + '">' +
      '<div class="progresso-barra" style="width:' + p.pct + '%"></div></div>' +
      '<div class="progresso-rotulo"><span>' + p.feitos + ' de ' + E.lista.length + ' fichas concluídas</span><span>' + p.pct + '%</span></div></div>';
  }

  function telaFicha() {
    const nome = E.lista[E.indice];
    const est = estudante(nome);
    const r = E.respostas[nome] || (E.respostas[nome] = {});
    const ultimo = E.indice === E.lista.length - 1;

    render(
      '<div style="display:flex;justify-content:space-between;align-items:center;gap:8px">' +
      '<span class="contador">Aluno ' + doisDigitos(E.indice + 1) + ' de ' + doisDigitos(E.lista.length) + '</span>' +
      '<button class="btn-link" id="abrir-lista" type="button">Ver lista</button></div>' +
      htmlProgresso() +

      '<form id="ficha" novalidate>' +
      '<div class="cartao ficha-topo">' +
      '<div class="estudante-id">' +
      PC.htmlFoto(nome, E.fotos, 'foto-grande').replace(/^<(img|div) class/, '<$1 id="foto-ficha" class') +
      '<div><p class="nome-estudante">' + esc(nome) + '</p>' +
      '<div class="pequeno texto-2">' + (est.numero != null ? 'Nº ' + doisDigitos(est.numero) + ' · ' : '') + esc(E.componente) + '</div></div>' +
      '</div>' +
      '<fieldset class="grupo" id="g-mencao" style="margin:16px 0 0"><legend>Menção no ' + esc(periodoCurto()) + '</legend>' +
      htmlMencoes(r.mencao) + '</fieldset>' +
      '</div>' +

      '<div class="cartao">' +
      ESCALAS.map(s =>
        '<fieldset class="grupo" id="g-' + s.id + '"><legend>' + esc(s.titulo) + '</legend>' +
        htmlChips(s.id, s.opcoes, r[s.id], s.opcoes.length === 3 ? 'uma-coluna' : '') + '</fieldset>').join('') +

      '<hr class="separador">' +
      '<fieldset class="grupo" id="g-haRegistro"><legend>Há alguma situação pedagógica deste estudante que você considera importante levar ao Conselho de Classe?</legend>' +
      htmlChips('haRegistro', ['Não', 'Sim'], r.haRegistro, 'sim-nao') + '</fieldset>' +

      '<div class="registro-bloco" id="bloco-registro"' + (r.haRegistro === 'Sim' ? '' : ' hidden') + '>' +
      '<fieldset class="grupo" id="g-registro"><legend><label for="registro">Registro pedagógico</label></legend>' +
      '<textarea id="registro" name="registro" maxlength="3000" aria-describedby="orient-registro">' + esc(r.registro || '') + '</textarea>' +
      '<div class="contagem-caracteres" id="contagem"></div>' +
      '<p class="orientacao" id="orient-registro">Descreva objetivamente situações observadas no processo de aprendizagem. ' +
      'Sempre que possível, registre também estratégias pedagógicas já realizadas ou que possam contribuir para o desenvolvimento do estudante. ' +
      'Não registre informações de saúde, familiares ou de caráter pessoal.</p>' +
      '<p class="exemplo">Exemplo: “Apresentou dificuldade na realização das atividades propostas durante o período. ' +
      'Demonstrou melhor desempenho quando recebeu orientação individual e exemplos adicionais.”</p>' +
      '</fieldset></div>' +

      '<hr class="separador">' +
      '<fieldset class="grupo" id="g-indicacao"><legend>Em relação ao Conselho de Classe:</legend>' +
      htmlChips('indicacao', INDICACOES, r.indicacao, 'uma-coluna') + '</fieldset>' +
      '</div></form>',

      '<button class="btn btn-secundario btn-anterior" id="anterior" type="button">← ANTERIOR</button>' +
      '<button class="btn" id="proximo" type="button">' + (ultimo ? 'SALVAR E REVISAR →' : 'SALVAR E PRÓXIMO →') + '</button>'
    );

    const form = document.getElementById('ficha');
    const bloco = document.getElementById('bloco-registro');
    const texto = document.getElementById('registro');
    const contagem = document.getElementById('contagem');
    const atualizarContagem = () => { contagem.textContent = texto.value.length + ' / 3000'; };
    atualizarContagem();

    form.addEventListener('change', ev => {
      const campo = ev.target.name;
      if (!campo || campo === 'registro') return;
      r[campo] = ev.target.value;
      if (campo === 'haRegistro') {
        bloco.hidden = r.haRegistro !== 'Sim';
        if (r.haRegistro === 'Sim') setTimeout(() => texto.focus(), 50);
      }
      const g = document.getElementById('g-' + campo);
      if (g) g.classList.remove('faltando');
      salvarRascunho();
      atualizarProgresso();
    });
    texto.addEventListener('input', () => {
      r.registro = texto.value;
      if (texto.value.trim().length >= MIN_TEXTO) document.getElementById('g-registro').classList.remove('faltando');
      atualizarContagem();
      salvarRascunho();
      atualizarProgresso();
    });

    document.getElementById('anterior').onclick = () => {
      if (E.indice > 0) { E.indice--; salvarRascunho(); telaFicha(); }
      else telaConfirmacao();
    };
    document.getElementById('proximo').onclick = () => {
      const f = faltando(r);
      if (f.length) {
        f.forEach(id => { const g = document.getElementById('g-' + id); if (g) g.classList.add('faltando'); });
        const primeiro = document.getElementById('g-' + f[0]);
        if (primeiro) primeiro.scrollIntoView({ behavior: 'smooth', block: 'center' });
        aviso(f[0] === 'registro' ? 'Escreva o registro pedagógico (mínimo de ' + MIN_TEXTO + ' caracteres).'
          : f[0] === 'mencao' ? 'Selecione a menção do estudante.' : 'Complete os campos destacados.');
        return;
      }
      if (E.indice < E.lista.length - 1) { E.indice++; salvarRascunho(); telaFicha(); }
      else { salvarRascunho(); telaRevisao(); }
    };
    document.getElementById('abrir-lista').onclick = abrirLista;
  }

  function atualizarProgresso() {
    const el = document.getElementById('progresso');
    if (el) el.outerHTML = htmlProgresso();
  }

  /* Lista rápida para ir a qualquer estudante */
  function abrirLista() {
    sobre.innerHTML =
      '<div class="sobreposicao" id="fundo-lista"><div class="painel-sobreposto" role="dialog" aria-modal="true" aria-label="Lista de estudantes">' +
      '<header><h2 style="margin:0">Estudantes</h2><button class="btn-link" id="fechar-lista" type="button">Fechar</button></header>' +
      '<p class="pequeno texto-2"><span class="status-ponto completo" style="display:inline-block"></span> concluída · ' +
      '<span class="status-ponto parcial" style="display:inline-block"></span> iniciada · ' +
      '<span class="status-ponto" style="display:inline-block"></span> não iniciada</p>' +
      '<ul class="lista-nav">' + E.lista.map((n, i) => {
        const st = completo(n) ? 'completo' : (iniciado(n) ? 'parcial' : '');
        const m = E.respostas[n] && E.respostas[n].mencao;
        return '<li><button type="button" data-i="' + i + '" class="' + (i === E.indice ? 'atual' : '') + '">' +
          '<span class="status-ponto ' + st + '"></span><span class="num">' + doisDigitos(i + 1) + '</span><span style="flex:1">' + esc(n) + '</span>' +
          (m ? '<span class="tag">' + esc(m) + '</span>' : '') + '</button></li>';
      }).join('') + '</ul>' +
      '<div class="acoes"><button class="btn btn-secundario" id="ir-revisao" type="button">IR PARA A REVISÃO</button></div>' +
      '</div></div>';
    document.getElementById('fechar-lista').onclick = fecharLista;
    document.getElementById('fundo-lista').onclick = ev => { if (ev.target.id === 'fundo-lista') fecharLista(); };
    document.getElementById('ir-revisao').onclick = () => { fecharLista(); telaRevisao(); };
    sobre.querySelectorAll('[data-i]').forEach(b => {
      b.onclick = () => { E.indice = Number(b.dataset.i); salvarRascunho(); fecharLista(); telaFicha(); };
    });
  }
  function fecharLista() { sobre.innerHTML = ''; }

  /* ------------------------------------------------------------------------
   * 5. REVISÃO
   * ---------------------------------------------------------------------- */

  function telaRevisao() {
    const incompletos = E.lista.filter(n => !completo(n));
    const completos = E.lista.filter(completo);
    const conta = f => completos.filter(f).length;
    const acomp = conta(n => E.respostas[n].indicacao === IND_ACOMP);
    const disc = conta(n => E.respostas[n].indicacao === IND_DISC);
    const comTexto = conta(n => E.respostas[n].haRegistro === 'Sim');
    const mencoes = MENCOES.map(m => '<span class="tag">' + m.valor + ': ' + conta(n => E.respostas[n].mencao === m.valor) + '</span>').join(' ');

    render(
      '<h1>REVISAR PRÉ-CONSELHO</h1>' +
      '<div class="cartao"><dl class="resumo">' +
      '<div><dt>Turma</dt><dd>' + esc(E.turma) + '</dd></div>' +
      '<div><dt>Professor</dt><dd>' + esc(E.sessao.nome) + '</dd></div>' +
      '<div><dt>Componente curricular</dt><dd>' + esc(E.componente) + '</dd></div>' +
      '<div><dt>Período</dt><dd>' + esc(E.sessao.periodo) + '</dd></div>' +
      '<div><dt>Estudantes analisados</dt><dd>' + completos.length + ' de ' + E.lista.length + '</dd></div>' +
      '<div><dt>Menções</dt><dd style="display:flex;gap:4px;flex-wrap:wrap;justify-content:flex-end">' + mencoes + '</dd></div>' +
      '<div><dt>Com registro pedagógico escrito</dt><dd>' + comTexto + '</dd></div>' +
      '<div><dt>Indicados para acompanhamento</dt><dd>' + acomp + '</dd></div>' +
      '<div><dt>Indicados para discussão no Conselho</dt><dd>' + disc + '</dd></div>' +
      '</dl></div>' +
      (incompletos.length
        ? '<div class="alerta"><b>' + incompletos.length + ' ' + plural(incompletos.length, 'ficha incompleta', 'fichas incompletas') + '.</b> Complete antes de enviar:' +
          '<ul>' + incompletos.map(n => '<li><button class="btn-link" type="button" data-ir="' + esc(n) + '">' + esc(n) + '</button></li>').join('') + '</ul></div>'
        : '') +
      (E.envio ? '<p class="pequeno texto-2">Este envio substituirá o enviado em ' + esc(PC.dataHora(E.envio.dataHora)) + '.</p>' : '') +
      '<div class="acoes"><button class="btn btn-secundario" id="revisar" type="button">REVISAR RESPOSTAS</button></div>',
      '<button class="btn btn-bloco" id="enviar" type="button"' + (incompletos.length ? ' disabled' : '') + '>ENVIAR PRÉ-CONSELHO</button>'
    );

    app.querySelectorAll('[data-ir]').forEach(b => {
      b.onclick = () => { E.indice = E.lista.indexOf(b.dataset.ir); telaFicha(); };
    });
    document.getElementById('revisar').onclick = () => { E.indice = 0; telaFicha(); };
    document.getElementById('enviar').onclick = enviar;
  }

  /* ------------------------------------------------------------------------
   * 6. ENVIO
   * ---------------------------------------------------------------------- */

  async function enviar() {
    const botao = document.getElementById('enviar');
    botao.disabled = true; botao.textContent = 'ENVIANDO…';
    const registros = E.lista.map(n => {
      const r = E.respostas[n];
      return {
        estudante: n, mencao: r.mencao, competencias: r.competencias, participacao: r.participacao,
        atividades: r.atividades, frequencia: r.frequencia, evolucao: r.evolucao, haRegistro: r.haRegistro,
        registro: r.haRegistro === 'Sim' ? String(r.registro || '').trim() : '', indicacao: r.indicacao
      };
    });
    try {
      const res = await PC.api('enviar', {
        token: E.sessao.token, periodo: E.sessao.periodo, turma: E.turma, componente: E.componente,
        modo: 'todos', registros: registros
      });
      PC.local.remover(chaveRascunho());
      telaSucesso(res);
    } catch (err) {
      botao.disabled = false; botao.textContent = 'ENVIAR PRÉ-CONSELHO';
      tratarErro(err);
    }
  }

  function telaSucesso(res) {
    render(
      '<div class="cartao sucesso">' +
      '<div class="sucesso-icone"><svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 6 9 17l-5-5"/></svg></div>' +
      '<h1>Pré-Conselho enviado com sucesso!</h1>' +
      '<p>Obrigado pela contribuição. Suas observações serão utilizadas para subsidiar o acompanhamento pedagógico e as discussões do Conselho de Classe.</p>' +
      '<p class="pequeno texto-2">' + esc(E.turma) + ' · ' + esc(E.componente) + '<br>' +
      res.quantidade + ' ' + plural(res.quantidade, 'registro enviado', 'registros enviados') + ' em ' + esc(PC.dataHora(res.dataHora)) + '</p>' +
      '<div class="acoes">' +
      (E.sessao.atribuicoes.length > 1 ? '<button class="btn" id="outra" type="button">REGISTRAR OUTRO COMPONENTE</button>' : '') +
      '<button class="btn btn-secundario" id="sair2" type="button">SAIR</button>' +
      '</div></div>'
    );
    const outra = document.getElementById('outra');
    if (outra) outra.onclick = telaEscolha;
    document.getElementById('sair2').onclick = sair;
  }

  /* ------------------------------------------------------------------------
   * INÍCIO
   * ---------------------------------------------------------------------- */
  E.sessao = PC.sessao.ler(CHAVE_SESSAO);
  atualizarTopo();
  if (E.sessao && E.sessao.token) inicio(); else telaLogin();
})();
