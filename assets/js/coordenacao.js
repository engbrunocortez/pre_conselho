/**
 * ============================================================================
 *  PAINEL DO COORDENADOR
 * ============================================================================
 *  Visão geral · Visão da turma · Relatório individual · Olhar coletivo ·
 *  Modo Conselho (tela limpa, um estudante por vez) · Impressão
 *
 *  Todos os dados vêm do Apps Script somente após login da coordenação.
 *  O painel NÃO gera nota, pontuação ou diagnóstico: apenas organiza e conta
 *  os registros para subsidiar a análise humana da equipe pedagógica.
 * ============================================================================
 */
(function () {
  'use strict';
  const { ESCALAS, NAO_OBSERVADO, MENCOES, IND_SEM, IND_ACOMP, IND_DISC, esc, doisDigitos, plural, aviso } = PC;

  const app = document.getElementById('app');
  const conselhoEl = document.getElementById('conselho');
  const impressaoEl = document.getElementById('impressao');
  const topoAcoes = document.getElementById('topo-acoes');
  const topoSub = document.getElementById('topo-sub');
  document.getElementById('faixa').innerHTML = PC.faixaDemo();

  const CHAVE_SESSAO = 'pc_coord_sessao';

  const C = {
    sessao: null,
    dados: null,
    f: { periodo: '', turma: '', professor: '', componente: '' },
    aba: 'geral',
    ordem: 'numero',
    estudante: null,                                   // relatório aberto
    fotos: {},                                         // { turma: { nome: dataURL } }
    conselho: { ativo: false, somenteIndicados: false, indice: 0 }
  };

  /* ------------------------------------------------------------------------
   * LOGIN
   * ---------------------------------------------------------------------- */

  function telaLogin(msg) {
    topoAcoes.innerHTML = '';
    topoSub.textContent = 'Pré-Conselho Pedagógico';
    app.innerHTML =
      '<div style="max-width:440px;margin:24px auto 0">' +
      '<h1>Acesso da coordenação</h1>' +
      (msg ? '<div class="alerta">' + esc(msg) + '</div>' : '') +
      '<form class="cartao" id="form-login">' +
      '<div class="campo"><label for="login">Login</label><input id="login" name="username" autocomplete="username" autocapitalize="none" spellcheck="false" required></div>' +
      '<div class="campo"><label for="senha">Senha</label><input id="senha" name="password" type="password" autocomplete="current-password" required></div>' +
      '<div id="erro"></div>' +
      '<button class="btn btn-bloco" type="submit">ENTRAR</button>' +
      (PC.MODO_DEMO ? '<p class="pequeno texto-2" style="margin:12px 0 0">Demonstração: login <b>coordenacao</b> · senha <b>1234</b></p>' : '') +
      '</form></div>';
    const form = document.getElementById('form-login');
    form.onsubmit = async ev => {
      ev.preventDefault();
      const b = form.querySelector('button');
      b.disabled = true; b.textContent = 'ENTRANDO…';
      try {
        const r = await PC.api('loginCoordenacao', { login: form.login.value.trim(), senha: form.senha.value });
        C.sessao = { token: r.token, nome: r.nome };
        PC.sessao.gravar(CHAVE_SESSAO, C.sessao);
        carregar(r.periodo);
      } catch (err) {
        document.getElementById('erro').innerHTML = '<div class="alerta alerta-erro">' + esc(err.message) + '</div>';
        b.disabled = false; b.textContent = 'ENTRAR';
      }
    };
    document.getElementById('login').focus();
  }

  async function sair() {
    const token = C.sessao && C.sessao.token;
    PC.sessao.remover(CHAVE_SESSAO);
    C.sessao = null; C.dados = null;
    fecharConselho();
    telaLogin();
    if (token) { try { await PC.api('sair', { token }); } catch (e) { /* ignora */ } }
  }

  function tratarErro(err) {
    if (err.codigo === 'SESSAO') {
      PC.sessao.remover(CHAVE_SESSAO);
      C.sessao = null;
      fecharConselho();
      telaLogin('Sua sessão expirou. Entre novamente.');
    } else {
      aviso(err.message, 'erro');
    }
  }

  /* ------------------------------------------------------------------------
   * CARREGAMENTO DOS DADOS
   * ---------------------------------------------------------------------- */

  async function carregar(periodo) {
    app.innerHTML = '<div class="carregando"><div class="giro"></div>Carregando os registros…</div>';
    try {
      const d = await PC.api('painel', { token: C.sessao.token, periodo: periodo || C.f.periodo || '' });
      C.dados = d;
      C.f.periodo = d.periodo;
      const turmas = listaTurmas();
      if (turmas.indexOf(C.f.turma) < 0) {
        const comDados = turmas.find(t => d.registros.some(r => r.turma === t));
        C.f.turma = comDados || turmas[0] || '';
      }
      topoSub.textContent = C.sessao.nome;
      topoAcoes.innerHTML =
        '<button class="btn-link" id="atualizar" type="button">Atualizar</button>' +
        '<button class="btn-link" id="sair" type="button">Sair</button>';
      document.getElementById('atualizar').onclick = () => carregar();
      document.getElementById('sair').onclick = sair;
      desenhar();
      carregarFotos();
    } catch (err) {
      tratarErro(err);
      if (C.sessao) app.innerHTML = '<div class="alerta alerta-erro">' + esc(err.message) + '</div>';
    }
  }

  /** Fotos da turma (opcionais), buscadas em segundo plano. */
  async function carregarFotos() {
    const turma = C.f.turma;
    if (!turma || C.fotos[turma]) return;
    try {
      const r = await PC.api('fotos', { token: C.sessao.token, turma: turma });
      C.fotos[turma] = r.fotos || {};
      if (Object.keys(C.fotos[turma]).length && turma === C.f.turma) {
        if (C.conselho.ativo) desenharConselho(); else desenhar();
      }
    } catch (e) { /* sem fotos */ }
  }
  const fotosTurma = () => C.fotos[C.f.turma] || {};

  /* ------------------------------------------------------------------------
   * CÁLCULOS (apenas contagens — nenhuma pontuação)
   * ---------------------------------------------------------------------- */

  const unicos = arr => [...new Set(arr)];
  const ordenarTexto = (a, b) => a.localeCompare(b, 'pt-BR');

  function listaTurmas() {
    const d = C.dados;
    return unicos(d.estudantes.map(e => e.turma).concat(d.atribuicoes.map(a => a.turma))).sort(ordenarTexto);
  }

  function passaFiltro(x) {
    return x.turma === C.f.turma &&
      (!C.f.professor || x.login === C.f.professor) &&
      (!C.f.componente || x.componente === C.f.componente);
  }

  const atribuicoes = () => C.dados.atribuicoes.filter(passaFiltro);
  const registros = () => C.dados.registros.filter(passaFiltro);
  const envios = () => C.dados.envios.filter(passaFiltro);
  const estudantesTurma = () => C.dados.estudantes.filter(e => e.turma === C.f.turma)
    .sort((a, b) => (a.numero || 999) - (b.numero || 999) || ordenarTexto(a.nome, b.nome));

  function nomeProfessor(login) {
    const a = C.dados.atribuicoes.find(x => x.login === login);
    return a ? a.professor : login;
  }

  /** Resumo de um estudante dentro dos filtros atuais. */
  function resumo(nome, regsBase) {
    const regs = (regsBase || registros()).filter(r => r.estudante === nome);
    return {
      regs: regs,
      professores: unicos(regs.map(r => r.login)).length,
      acomp: regs.filter(r => r.indicacao === IND_ACOMP).length,
      disc: regs.filter(r => r.indicacao === IND_DISC).length,
      textos: regs.filter(r => r.haRegistro === 'Sim').length
    };
  }

  /* ------------------------------------------------------------------------
   * DESENHO GERAL: filtros + conteúdo
   * ---------------------------------------------------------------------- */

  function htmlSelect(id, rotulo, opcoes, valor, todos, classe) {
    return '<div class="campo ' + (classe || '') + '"><label for="' + id + '">' + rotulo + '</label><select id="' + id + '">' +
      (todos ? '<option value="">' + todos + '</option>' : '') +
      opcoes.map(o => '<option value="' + esc(o.valor) + '"' + (o.valor === valor ? ' selected' : '') + '>' + esc(o.texto) + '</option>').join('') +
      '</select></div>';
  }

  function htmlFiltros() {
    const d = C.dados;
    const atTurma = d.atribuicoes.filter(a => a.turma === C.f.turma);
    const profs = unicos(atTurma.map(a => a.login))
      .map(l => ({ valor: l, texto: nomeProfessor(l) })).sort((a, b) => ordenarTexto(a.texto, b.texto));
    const comps = unicos(atTurma.filter(a => !C.f.professor || a.login === C.f.professor).map(a => a.componente))
      .sort(ordenarTexto).map(c => ({ valor: c, texto: c }));
    const ests = estudantesTurma().map(e => ({ valor: e.nome, texto: (e.numero != null ? doisDigitos(e.numero) + ' · ' : '') + e.nome }));
    return '<div class="filtros">' +
      htmlSelect('f-turma', 'Turma', listaTurmas().map(t => ({ valor: t, texto: t })), C.f.turma, '', 'largo') +
      htmlSelect('f-periodo', 'Período', d.periodos.map(p => ({ valor: p, texto: p + (p === d.periodoAtual ? ' (atual)' : '') })), C.f.periodo) +
      htmlSelect('f-estudante', 'Estudante', ests, C.estudante || '', 'Todos') +
      htmlSelect('f-professor', 'Professor', profs, C.f.professor, 'Todos', 'largo') +
      htmlSelect('f-componente', 'Componente curricular', comps, C.f.componente, 'Todos', 'largo') +
      '</div>';
  }

  function ligarFiltros() {
    document.getElementById('f-turma').onchange = ev => {
      C.f.turma = ev.target.value; C.f.professor = ''; C.f.componente = ''; C.estudante = null; desenhar(); carregarFotos();
    };
    document.getElementById('f-periodo').onchange = ev => { C.f.periodo = ev.target.value; C.estudante = null; carregar(C.f.periodo); };
    document.getElementById('f-estudante').onchange = ev => { C.estudante = ev.target.value || null; desenhar(); };
    document.getElementById('f-professor').onchange = ev => {
      C.f.professor = ev.target.value;
      const comps = C.dados.atribuicoes.filter(a => a.turma === C.f.turma && (!C.f.professor || a.login === C.f.professor)).map(a => a.componente);
      if (comps.indexOf(C.f.componente) < 0) C.f.componente = '';
      desenhar();
    };
    document.getElementById('f-componente').onchange = ev => { C.f.componente = ev.target.value; desenhar(); };
  }

  function desenhar() {
    if (!C.dados) return;
    let html = htmlFiltros();
    if (!C.f.turma) {
      html += '<div class="alerta">Nenhuma turma cadastrada. Cadastre estudantes e atribuições na planilha.</div>';
    } else if (C.estudante) {
      html += '<div class="nao-imprimir" style="margin-bottom:8px"><button class="btn-link" id="voltar" type="button">← Voltar para a turma</button></div>' +
        htmlRelatorio(C.estudante);
    } else {
      html += '<div class="abas" role="tablist">' +
        '<button role="tab" type="button" data-aba="geral" aria-selected="' + (C.aba === 'geral') + '">Visão geral</button>' +
        '<button role="tab" type="button" data-aba="turma" aria-selected="' + (C.aba === 'turma') + '">Visão da turma</button>' +
        '</div>' + (C.aba === 'geral' ? htmlVisaoGeral() : htmlVisaoTurma());
    }
    app.innerHTML = html;
    ligarFiltros();
    const voltar = document.getElementById('voltar');
    if (voltar) voltar.onclick = () => { C.estudante = null; C.aba = 'turma'; desenhar(); };
    app.querySelectorAll('[data-aba]').forEach(b => { b.onclick = () => { C.aba = b.dataset.aba; desenhar(); }; });
    app.querySelectorAll('[data-estudante]').forEach(tr => {
      tr.onclick = () => { C.estudante = tr.dataset.estudante; desenhar(); window.scrollTo(0, 0); };
      tr.onkeydown = ev => { if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); tr.click(); } };
    });
    const ordem = document.getElementById('ordem');
    if (ordem) ordem.onchange = ev => { C.ordem = ev.target.value; desenhar(); };
    app.querySelectorAll('[data-acao="conselho"]').forEach(b => { b.onclick = abrirConselho; });
    app.querySelectorAll('[data-acao="imprimir-turma"]').forEach(b => { b.onclick = imprimirTurma; });
    app.querySelectorAll('[data-acao="imprimir"]').forEach(b => { b.onclick = () => window.print(); });
  }

  /* ------------------------------------------------------------------------
   * VISÃO GERAL
   * ---------------------------------------------------------------------- */

  function htmlVisaoGeral() {
    const ests = estudantesTurma();
    const regs = registros();
    const at = atribuicoes();
    const env = envios();
    const esperados = unicos(at.map(a => a.login));
    const participantes = unicos(env.map(e => e.login));
    const comAcomp = ests.filter(e => regs.some(r => r.estudante === e.nome && r.indicacao === IND_ACOMP)).length;
    const comDisc = ests.filter(e => regs.some(r => r.estudante === e.nome && r.indicacao === IND_DISC)).length;

    const linhas = at.slice().sort((a, b) => ordenarTexto(a.componente, b.componente)).map(a => {
      const e = env.find(x => x.login === a.login && x.componente === a.componente);
      const situacao = e
        ? '<span class="tag tag-ok">Enviado</span> <span class="pequeno texto-2">' + esc(PC.dataHora(e.dataHora)) + '</span>'
        : '<span class="tag">Pendente</span>';
      const detalhe = e
        ? (e.modo === 'todos' ? 'Turma toda (' + e.quantidade + ')' : (e.quantidade ? e.quantidade + ' ' + plural(e.quantidade, 'estudante selecionado', 'estudantes selecionados') : 'Sem registros individuais'))
        : '—';
      return '<tr><td class="principal" data-rotulo="Componente">' + esc(a.componente) + '</td>' +
        '<td data-rotulo="Professor">' + esc(a.professor) + '</td>' +
        '<td data-rotulo="Situação"><span>' + situacao + '</span></td>' +
        '<td data-rotulo="Registros">' + detalhe + '</td></tr>';
    }).join('');

    return '<h1>PRÉ-CONSELHO — VISÃO GERAL</h1>' +
      '<p class="texto-2">' + esc(C.f.turma) + ' · ' + esc(C.f.periodo) +
      (C.dados.aberto ? '' : ' · <span class="tag">recebimento encerrado</span>') + '</p>' +
      '<div class="indicadores">' +
      '<div class="indicador"><div class="valor">' + ests.length + '</div><div class="legenda">estudantes</div></div>' +
      '<div class="indicador"><div class="valor">' + participantes.length + ' <small>de ' + esperados.length + '</small></div><div class="legenda">professores participantes</div></div>' +
      '<div class="indicador acomp"><div class="valor">' + comAcomp + '</div><div class="legenda">' + plural(comAcomp, 'estudante', 'estudantes') + ' com indicação de acompanhamento</div></div>' +
      '<div class="indicador disc"><div class="valor">' + comDisc + '</div><div class="legenda">' + plural(comDisc, 'estudante indicado', 'estudantes indicados') + ' para discussão no Conselho</div></div>' +
      '</div>' +
      '<div class="acoes acoes-linha nao-imprimir" style="margin-bottom:14px">' +
      '<button class="btn" data-acao="conselho" type="button">ABRIR MODO CONSELHO</button>' +
      '<button class="btn btn-secundario" data-acao="imprimir-turma" type="button">IMPRIMIR RELATÓRIO DA TURMA</button>' +
      '</div>' +
      '<section class="cartao"><h2>Participação dos professores</h2>' +
      '<p class="pequeno texto-2">“Sem registros individuais” significa que o professor respondeu e não selecionou nenhum estudante — é diferente de “Pendente”.</p>' +
      (linhas
        ? '<table class="tabela tabela-responsiva"><thead><tr><th>Componente</th><th>Professor</th><th>Situação</th><th>Registros</th></tr></thead><tbody>' + linhas + '</tbody></table>'
        : '<p class="texto-2">Nenhuma atribuição cadastrada para esta turma.</p>') +
      '</section>';
  }

  /* ------------------------------------------------------------------------
   * VISÃO DA TURMA
   * ---------------------------------------------------------------------- */

  function htmlVisaoTurma() {
    const regs = registros();
    const esperados = unicos(atribuicoes().map(a => a.login)).length;
    let linhas = estudantesTurma().map(e => Object.assign({ est: e }, resumo(e.nome, regs)));
    if (C.ordem === 'registros') {
      linhas.sort((a, b) => (b.disc - a.disc) || (b.acomp - a.acomp) || (b.textos - a.textos) ||
        ((a.est.numero || 999) - (b.est.numero || 999)));
    }
    const cel = n => '<span class="' + (n ? '' : 'zero') + '">' + n + '</span>';
    const corpo = linhas.map(l =>
      '<tr class="clicavel" tabindex="0" data-estudante="' + esc(l.est.nome) + '">' +
      '<td class="principal" data-rotulo="Estudante"><span class="num">' + (l.est.numero != null ? doisDigitos(l.est.numero) : '') + '</span> ' + esc(l.est.nome) + '</td>' +
      '<td class="centro" data-rotulo="Professores que responderam"><span>' + l.professores + ' <span class="texto-2 pequeno">de ' + esperados + '</span></span></td>' +
      '<td class="centro" data-rotulo="Acompanhamento">' + (l.acomp ? '<span class="tag tag-acomp">' + l.acomp + '</span>' : cel(0)) + '</td>' +
      '<td class="centro" data-rotulo="Discussão no Conselho">' + (l.disc ? '<span class="tag tag-disc">' + l.disc + '</span>' : cel(0)) + '</td>' +
      '<td class="centro" data-rotulo="Registros escritos">' + cel(l.textos) + '</td>' +
      '<td class="centro" data-rotulo="Menções"><span>' + htmlMencoesCompacto(l.regs) + '</span></td>' +
      '</tr>').join('');

    return '<div class="barra-ferramentas">' +
      '<div><label class="pequeno texto-2" for="ordem">Ordenar por </label><select id="ordem">' +
      '<option value="numero"' + (C.ordem === 'numero' ? ' selected' : '') + '>Número de chamada</option>' +
      '<option value="registros"' + (C.ordem === 'registros' ? ' selected' : '') + '>Mais registros pedagógicos recebidos</option>' +
      '</select></div>' +
      '<div class="acoes-linha nao-imprimir" style="display:flex;gap:8px;flex-wrap:wrap">' +
      '<button class="btn btn-pequeno" data-acao="conselho" type="button">Modo Conselho</button>' +
      '<button class="btn btn-secundario btn-pequeno" data-acao="imprimir-turma" type="button">Imprimir turma</button></div>' +
      '</div>' +
      '<div class="cartao" style="padding:8px 12px">' +
      '<table class="tabela tabela-responsiva"><thead><tr><th>Estudante</th><th class="centro">Professores que responderam</th>' +
      '<th class="centro">Acompanhamento</th><th class="centro">Discussão no Conselho</th><th class="centro">Registros escritos</th><th class="centro">Menções</th></tr></thead>' +
      '<tbody>' + corpo + '</tbody></table></div>' +
      '<p class="nota-etica">A ordenação serve apenas para organizar as informações. Ela não gera pontuação, nota, ranking acadêmico ou classificação do estudante. Toque em um estudante para abrir o relatório consolidado.</p>';
  }

  /* ------------------------------------------------------------------------
   * RELATÓRIO INDIVIDUAL (usado no painel, no modo Conselho e na impressão)
   * ---------------------------------------------------------------------- */

  function htmlMencoesCompacto(regs) {
    const partes = MENCOES.map(m => ({ m: m.valor, n: regs.filter(r => r.mencao === m.valor).length })).filter(x => x.n);
    return partes.length ? partes.map(x => '<span class="mencao-mini">' + x.m + ' ' + x.n + '</span>').join(' ') : '<span class="zero">—</span>';
  }

  function contagem(regs, campo, opcoes) {
    return opcoes.map(o => ({ opcao: o, n: regs.filter(r => r[campo] === o).length }));
  }

  function htmlBarras(regs, campo, opcoes) {
    const total = regs.length || 1;
    return contagem(regs, campo, opcoes).map(c =>
      '<div class="barra-linha' + (c.n ? '' : ' vazia') + (c.opcao === NAO_OBSERVADO ? ' nao-obs' : '') + '">' +
      '<span>' + esc(c.opcao) + '</span>' +
      '<span class="trilho"><span class="preenchido" style="display:block;width:' + Math.round(c.n / total * 100) + '%"></span></span>' +
      '<span class="qtd">' + c.n + '</span></div>').join('');
  }

  /** Frases do "Olhar coletivo": apenas contagens, sem diagnóstico. */
  function olharColetivo(regs) {
    const profs = cond => unicos(regs.filter(cond).map(r => r.login)).length;
    const comps = cond => unicos(regs.filter(cond).map(r => r.componente)).length;
    const itens = [
      [profs(r => r.indicacao === IND_DISC), 'professor indicou discussão no Conselho.', 'professores indicaram discussão no Conselho.'],
      [profs(r => r.indicacao === IND_ACOMP), 'professor indicou necessidade de acompanhamento.', 'professores indicaram necessidade de acompanhamento.'],
      [comps(r => r.mencao === 'I'), 'componente atribuiu menção I.', 'componentes atribuíram menção I.'],
      [comps(r => r.mencao === 'R'), 'componente atribuiu menção R.', 'componentes atribuíram menção R.'],
      [comps(r => r.evolucao === 'Apresenta dificuldades persistentes'), 'componente registrou dificuldades persistentes.', 'componentes registraram dificuldades persistentes.'],
      [comps(r => r.competencias === 'Requer maior acompanhamento'), 'componente registrou desenvolvimento das competências que requer maior acompanhamento.', 'componentes registraram desenvolvimento das competências que requer maior acompanhamento.'],
      [profs(r => r.participacao === 'Oscilante'), 'professor observou participação oscilante.', 'professores observaram participação oscilante.'],
      [profs(r => r.participacao === 'Reduzida'), 'professor observou participação reduzida.', 'professores observaram participação reduzida.'],
      [profs(r => r.atividades === 'Parcial'), 'professor observou realização parcial das atividades.', 'professores observaram realização parcial das atividades.'],
      [profs(r => r.atividades === 'Muito reduzida'), 'professor observou realização muito reduzida das atividades.', 'professores observaram realização muito reduzida das atividades.'],
      [profs(r => r.frequencia === 'Requer atenção'), 'professor apontou frequência que requer atenção.', 'professores apontaram frequência que requer atenção.'],
      [profs(r => r.evolucao === 'Evolução perceptível'), 'professor registrou evolução perceptível no período.', 'professores registraram evolução perceptível no período.'],
      [profs(r => r.competencias === 'Adequado ao momento do curso'), 'professor considerou o desenvolvimento das competências adequado ao momento do curso.', 'professores consideraram o desenvolvimento das competências adequado ao momento do curso.']
    ].filter(i => i[0] > 0);
    if (!itens.length) return '<p class="texto-2">Sem registros para este estudante com os filtros selecionados.</p>';
    return '<ul class="olhar-coletivo">' + itens.map(i => '<li>' + i[0] + ' ' + (i[0] === 1 ? i[1] : i[2]) + '</li>').join('') + '</ul>';
  }

  function htmlRelatorio(nome, contexto) {
    const est = estudantesTurma().find(e => e.nome === nome) || { nome: nome };
    const s = resumo(nome);
    const regs = s.regs.slice().sort((a, b) => ordenarTexto(a.componente, b.componente));
    const esperados = unicos(atribuicoes().map(a => a.login));
    const enviaram = unicos(envios().map(e => e.login));
    const semRegistro = enviaram.filter(l => !regs.some(r => r.login === l)).length;
    const pendentes = esperados.filter(l => enviaram.indexOf(l) < 0).length;
    const semIndicacao = regs.filter(r => r.indicacao === IND_SEM).length;
    const textos = regs.filter(r => r.haRegistro === 'Sim' && String(r.registro).trim());
    const emConselho = contexto === 'conselho';

    const tabelaComp = regs.length
      ? '<div class="rolagem-x"><table class="tabela tabela-componentes"><thead><tr><th>Componente</th><th>Menção</th>' +
        ESCALAS.map(e => '<th>' + esc(e.curto) + '</th>').join('') + '<th>Indicação</th></tr></thead><tbody>' +
        regs.map(r => '<tr><td><b>' + esc(r.componente) + '</b><br><span class="texto-2">' + esc(r.professor) + '</span></td><td><b>' + esc(r.mencao || '—') + '</b></td>' +
          ESCALAS.map(e => '<td>' + esc(r[e.id]) + '</td>').join('') +
          '<td>' + (r.indicacao === IND_DISC ? '<span class="tag tag-disc">Discutir</span>' : r.indicacao === IND_ACOMP ? '<span class="tag tag-acomp">Acompanhar</span>' : '<span class="tag">Sem necessidade específica</span>') + '</td></tr>').join('') +
        '</tbody></table></div>'
      : '';

    return '<article class="relatorio">' +
      '<div class="cartao cartao-destaque relatorio-cabecalho">' +
      '<div class="conselho-id">' + PC.htmlFoto(nome, fotosTurma(), 'foto-grande') +
      '<div><p class="sobretitulo">Relatório pedagógico consolidado</p>' +
      '<p class="nome-estudante">' + esc(nome) + '</p>' +
      '<p class="texto-2" style="margin:4px 0 0">' + (est.numero != null ? 'Nº ' + doisDigitos(est.numero) + ' · ' : '') + esc(C.f.turma) + ' · ' + esc(C.f.periodo) +
      (C.f.professor || C.f.componente ? ' · <b>filtro aplicado</b>' : '') + '</p></div></div>' +
      '<div style="display:flex;gap:6px;flex-wrap:wrap">' +
      '<span class="tag tag-acomp">Acompanhamento: ' + s.acomp + '</span>' +
      '<span class="tag tag-disc">Discussão no Conselho: ' + s.disc + '</span></div>' +
      (!emConselho && contexto !== 'impressao' ? '<div class="nao-imprimir" style="width:100%"><button class="btn btn-secundario btn-pequeno" data-acao="imprimir" type="button">Imprimir este relatório</button></div>' : '') +
      '</div>' +

      '<div class="grade-2">' +
      '<section class="cartao"><h2>Professores participantes</h2>' +
      '<p style="font-size:1.1rem"><b>' + s.professores + ' de ' + esperados.length + '</b> ' + plural(esperados.length, 'professor realizou', 'professores realizaram') + ' registros.</p>' +
      (semRegistro ? '<p class="pequeno texto-2">' + semRegistro + ' ' + plural(semRegistro, 'professor respondeu', 'professores responderam') + ' o Pré-Conselho sem registrar este estudante.</p>' : '') +
      (pendentes ? '<p class="pequeno texto-2">' + pendentes + ' ' + plural(pendentes, 'professor ainda não respondeu', 'professores ainda não responderam') + '.</p>' : '') +
      '<h3 style="margin-top:14px">Indicações para o Conselho</h3>' +
      '<div class="barra-linha"><span>Acompanhar</span><span class="trilho"><span class="preenchido" style="display:block;width:' + pct(s.acomp, regs.length) + '%"></span></span><span class="qtd">' + s.acomp + '</span></div>' +
      '<div class="barra-linha"><span>Discutir no Conselho</span><span class="trilho"><span class="preenchido" style="display:block;width:' + pct(s.disc, regs.length) + '%"></span></span><span class="qtd">' + s.disc + '</span></div>' +
      '<div class="barra-linha' + (semIndicacao ? '' : ' vazia') + '"><span>Sem necessidade específica</span><span class="trilho"><span class="preenchido" style="display:block;width:' + pct(semIndicacao, regs.length) + '%"></span></span><span class="qtd">' + semIndicacao + '</span></div>' +
      '</section>' +
      '<section class="cartao"><h2>Olhar coletivo</h2>' + olharColetivo(regs) +
      '<p class="nota-etica">Contagem dos registros para subsidiar a análise humana da equipe pedagógica. Não constitui diagnóstico sobre o estudante.</p></section>' +
      '</div>' +

      (regs.length
        ? '<section class="cartao"><h2>Indicadores consolidados</h2><div class="escalas-grade">' +
          '<div class="escala-bloco"><h3>Menções no período</h3>' + htmlBarras(regs, 'mencao', MENCOES.map(m => m.valor)) + '</div>' +
          ESCALAS.map(e => '<div class="escala-bloco"><h3>' + esc(e.titulo) + '</h3>' + htmlBarras(regs, e.id, e.opcoes) + '</div>').join('') +
          '</div></section>'
        : '') +

      '<section class="cartao"><h2>Registros pedagógicos</h2>' +
      (textos.length
        ? textos.map(r => '<div class="registro-prof"><h4>' + esc(r.componente) + ' — ' + esc(r.professor) +
            (r.indicacao === IND_DISC ? ' <span class="tag tag-disc">Discutir</span>' : r.indicacao === IND_ACOMP ? ' <span class="tag tag-acomp">Acompanhar</span>' : '') +
            '</h4><p class="texto-registro">' + esc(r.registro) + '</p></div>').join('')
        : '<p class="texto-2">Nenhum registro pedagógico escrito para este estudante.</p>') +
      '</section>' +

      (tabelaComp
        ? (contexto === 'impressao'
          ? '<section class="cartao"><h2>Visão por componente</h2>' + tabelaComp + '</section>'
          : '<details class="cartao"><summary style="cursor:pointer;font-weight:700">Visão por componente</summary><div style="margin-top:10px">' + tabelaComp + '</div></details>')
        : '') +
      '</article>';
  }

  function pct(n, total) { return total ? Math.round(n / total * 100) : 0; }

  /* ------------------------------------------------------------------------
   * MODO CONSELHO — tela limpa, um estudante por vez
   * ---------------------------------------------------------------------- */

  function listaConselho() {
    const regs = registros();
    return estudantesTurma().filter(e => {
      if (!C.conselho.somenteIndicados) return true;
      const s = resumo(e.nome, regs);
      return s.acomp + s.disc > 0;
    });
  }

  function abrirConselho() {
    C.conselho.ativo = true;
    C.conselho.indice = 0;
    document.addEventListener('keydown', teclasConselho);
    desenharConselho();
  }

  function fecharConselho() {
    C.conselho.ativo = false;
    conselhoEl.innerHTML = '';
    document.body.style.overflow = '';
    document.removeEventListener('keydown', teclasConselho);
  }

  function teclasConselho(ev) {
    if (!C.conselho.ativo) return;
    if (ev.key === 'ArrowRight') moverConselho(1);
    else if (ev.key === 'ArrowLeft') moverConselho(-1);
    else if (ev.key === 'Escape') { fecharConselho(); desenhar(); }
  }

  function moverConselho(delta) {
    const n = listaConselho().length;
    const novo = C.conselho.indice + delta;
    if (novo < 0 || novo >= n) return;
    C.conselho.indice = novo;
    desenharConselho();
  }

  function desenharConselho() {
    const lista = listaConselho();
    if (C.conselho.indice >= lista.length) C.conselho.indice = Math.max(0, lista.length - 1);
    const atual = lista[C.conselho.indice];
    document.body.style.overflow = 'hidden';
    conselhoEl.innerHTML =
      '<div class="modo-conselho" id="tela-conselho"><div class="conteudo">' +
      '<div class="conselho-topo nao-imprimir">' +
      '<div><p class="sobretitulo" style="margin:0">Conselho de Classe · ' + esc(C.f.turma) + '</p>' +
      '<span class="contador">' + (lista.length ? 'Estudante ' + (C.conselho.indice + 1) + ' de ' + lista.length : 'Nenhum estudante') + '</span></div>' +
      '<div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center">' +
      '<label class="pequeno" style="display:flex;gap:6px;align-items:center"><input type="checkbox" id="somente"' + (C.conselho.somenteIndicados ? ' checked' : '') + '> Somente estudantes com indicação</label>' +
      '<select id="ir-para" style="min-height:40px;border-radius:10px;border:1px solid var(--borda-forte);background:var(--superficie);padding:4px 8px">' +
      lista.map((e, i) => '<option value="' + i + '"' + (i === C.conselho.indice ? ' selected' : '') + '>' + (e.numero != null ? doisDigitos(e.numero) + ' · ' : '') + esc(e.nome) + '</option>').join('') +
      '</select>' +
      '<button class="btn btn-secundario btn-pequeno" id="imprimir-c" type="button">Imprimir</button>' +
      '<button class="btn btn-secundario btn-pequeno" id="fechar-c" type="button">Sair do modo Conselho</button>' +
      '</div></div>' +
      (atual ? htmlRelatorio(atual.nome, 'conselho') : '<div class="alerta alerta-info">Nenhum estudante com indicação nesta turma e filtros.</div>') +
      '</div>' +
      '<div class="rodape-fixo nao-imprimir"><div class="rodape-interno" style="max-width:980px">' +
      '<button class="btn btn-secundario" id="ant-c" type="button"' + (C.conselho.indice <= 0 ? ' disabled' : '') + '>← ESTUDANTE ANTERIOR</button>' +
      '<button class="btn" id="prox-c" type="button"' + (C.conselho.indice >= lista.length - 1 ? ' disabled' : '') + '>PRÓXIMO ESTUDANTE →</button>' +
      '</div></div></div>';
    document.getElementById('tela-conselho').scrollTop = 0;
    document.getElementById('ant-c').onclick = () => moverConselho(-1);
    document.getElementById('prox-c').onclick = () => moverConselho(1);
    document.getElementById('fechar-c').onclick = () => { fecharConselho(); desenhar(); };
    document.getElementById('somente').onchange = ev => { C.conselho.somenteIndicados = ev.target.checked; C.conselho.indice = 0; desenharConselho(); };
    document.getElementById('ir-para').onchange = ev => { C.conselho.indice = Number(ev.target.value); desenharConselho(); };
    document.getElementById('imprimir-c').onclick = () => {
      document.body.classList.add('imprimir-conselho');
      window.print();
    };
  }

  /* ------------------------------------------------------------------------
   * IMPRESSÃO DA TURMA (um estudante por página)
   * ---------------------------------------------------------------------- */

  function imprimirTurma() {
    const ests = estudantesTurma();
    impressaoEl.innerHTML =
      '<div class="conteudo" style="max-width:none">' +
      '<h1>Pré-Conselho Pedagógico — ' + esc(C.f.turma) + '</h1>' +
      '<p>' + esc(C.f.periodo) + ' · impresso em ' + esc(PC.dataHora(new Date().toISOString())) + '</p>' +
      '<div class="quebra-pagina">' + htmlVisaoGeral().replace(/<div class="acoes[^]*?<\/div>/, '') + '</div>' +
      ests.map((e, i) => '<div class="' + (i < ests.length - 1 ? 'quebra-pagina' : '') + '">' + htmlRelatorio(e.nome, 'impressao') + '</div>').join('') +
      '</div>';
    document.body.classList.add('imprimir-turma');
    window.print();
  }

  window.addEventListener('afterprint', () => {
    document.body.classList.remove('imprimir-turma', 'imprimir-conselho');
    impressaoEl.innerHTML = '';
  });

  /* ------------------------------------------------------------------------
   * INÍCIO
   * ---------------------------------------------------------------------- */
  C.sessao = PC.sessao.ler(CHAVE_SESSAO);
  if (C.sessao && C.sessao.token) carregar(); else telaLogin();
})();
