/**
 * ============================================================================
 *  MODO DEMONSTRAÇÃO
 * ============================================================================
 *  Usado somente quando CONFIG.API_URL está vazia. Imita o Apps Script com
 *  dados FICTÍCIOS guardados no navegador, para testar as telas antes da
 *  implantação. Nenhum dado real passa por este arquivo.
 *
 *  Logins de teste (senha 1234 para todos):
 *    Professores: quimica, matematica, biologia ... (nome do componente, sem acento)
 *    Coordenação: coordenacao
 * ============================================================================
 */
(function () {
  'use strict';
  const CHAVE = 'pc_demo_v3';
  const TURMA_A = '2ª Série A — MTec-N Administração';
  const TURMA_B = 'Turma de demonstração B';

  const COMPONENTES = [
    ['biologia', 'Biologia'], ['edfisica', 'Educação Física'], ['filosofia', 'Filosofia'],
    ['fisica', 'Física'], ['geografia', 'Geografia'], ['historia', 'História'],
    ['ingles', 'Língua Inglesa'], ['portugues', 'Língua Portuguesa'], ['matematica', 'Matemática'],
    ['quimica', 'Química'], ['aplicativos', 'Aplicativos Informatizados'],
    ['custos', 'Custos, Processos e Operações Contábeis'],
    ['dp', 'Planejamento e Organização de Rotinas de Departamento Pessoal'],
    ['pi', 'Projeto Integrador II']
  ];

  const NOMES = ['Alice Moreira', 'Bernardo Teixeira', 'Camila Duarte', 'Daniel Rocha', 'Eduarda Pires',
    'Felipe Campos', 'Gabriela Nunes', 'Heitor Barros', 'Isabela Freitas', 'João Pedro Lima',
    'Karina Souza', 'Leonardo Mendes', 'Larissa Cardoso', 'Matheus Ribeiro', 'Natália Gomes',
    'Otávio Ramos', 'Paula Andrade', 'Rafael Monteiro', 'Sabrina Azevedo', 'Thiago Martins',
    'Valentina Costa', 'Vinícius Araújo', 'Yasmin Correia', 'Enzo Carvalho', 'Lívia Batista',
    'Miguel Fernandes', 'Beatriz Lopes', 'Samuel Vieira', 'Júlia Castro', 'Pedro Henrique Dias'];
  const NOMES_B = ['Aline Prado', 'Bruno Farias', 'Clara Moura', 'Diego Sales', 'Elisa Tavares',
    'Fábio Cunha', 'Giovana Reis', 'Hugo Pacheco'];

  const TEXTOS = [
    'Apresentou dificuldade na realização das atividades propostas durante o período. Demonstrou melhor desempenho quando recebeu orientação individual e exemplos adicionais.',
    'Entregou parcialmente as atividades avaliativas do bimestre. Após conversa, passou a registrar as dúvidas no caderno e a trazê-las no início da aula.',
    'Participou pouco das atividades em grupo nas últimas semanas. Foi proposto rodízio de funções no grupo; houve melhora na última atividade.',
    'Demonstrou evolução na resolução de problemas a partir da metade do bimestre, especialmente após as aulas com exercícios guiados.',
    'Tem faltado com frequência às aulas deste componente, o que dificulta a continuidade das atividades práticas. Foram disponibilizados os materiais no ambiente virtual.',
    'Realiza as atividades em sala, mas não conclui as tarefas propostas para casa. Sugere-se acompanhamento das entregas pela coordenação.',
    'Mostrou domínio dos conteúdos nas atividades práticas; nas avaliações escritas ainda apresenta dificuldade de organizar as respostas.'
  ];

  /* Gerador pseudoaleatório com semente (resultados sempre iguais). */
  function rng(semente) {
    return function () {
      semente = (semente * 1664525 + 1013904223) % 4294967296;
      return semente / 4294967296;
    };
  }
  function escolher(r, lista, pesos) {
    let x = r() * pesos.reduce((a, b) => a + b, 0);
    for (let i = 0; i < lista.length; i++) { x -= pesos[i]; if (x <= 0) return lista[i]; }
    return lista[lista.length - 1];
  }

  function criarBanco() {
    const r = rng(20260927);
    const E = PC.ESCALAS;
    const db = {
      periodoAtual: '3º Bimestre/2026', aberto: true,
      estudantes: [], professores: [], atribuicoes: [], registros: [], envios: [], sessoes: {}
    };
    NOMES.forEach((n, i) => db.estudantes.push({ turma: TURMA_A, numero: i + 1, nome: n }));
    NOMES_B.forEach((n, i) => db.estudantes.push({ turma: TURMA_B, numero: i + 1, nome: n }));
    COMPONENTES.forEach(c => {
      db.professores.push({ login: c[0], nome: 'Prof. de ' + c[1] });
      db.atribuicoes.push({ login: c[0], turma: TURMA_A, componente: c[1] });
    });
    db.atribuicoes.push({ login: 'quimica', turma: TURMA_B, componente: 'Química' });
    db.atribuicoes.push({ login: 'matematica', turma: TURMA_B, componente: 'Matemática' });

    // "Perfil" de cada estudante fictício: quanto maior, mais chance de receber indicação.
    const perfil = NOMES.map((_, i) => [3, 7, 12, 20, 26].indexOf(i) >= 0 ? 0.85 : (i % 6 === 0 ? 0.45 : 0.08));
    const pendentes = ['quimica', 'pi', 'edfisica']; // ainda não enviaram (para testar)
    const base = new Date('2026-09-22T19:00:00-03:00').getTime();

    COMPONENTES.forEach((c, k) => {
      if (pendentes.indexOf(c[0]) >= 0) return;
      const todos = true; // no fluxo atual, cada professor registra a turma toda
      const data = new Date(base + k * 3600 * 1000 * 7).toISOString();
      const regs = [];
      NOMES.forEach((nome, i) => {
        const p = perfil[i];
        if (!todos && r() > p) return;
        const dif = r() < p;
        const reg = {
          dataHora: data, login: c[0], professor: 'Prof. de ' + c[1], turma: TURMA_A, componente: c[1],
          numero: i + 1, estudante: nome,
          mencao: dif ? escolher(r, ['I', 'R', 'B', 'MB'], [4, 4, 2, 0.2]) : escolher(r, ['I', 'R', 'B', 'MB'], [0.2, 1, 5, 4]),
          competencias: dif ? escolher(r, E[0].opcoes, [1, 4, 5, 1]) : escolher(r, E[0].opcoes, [7, 3, 0.3, 0.5]),
          participacao: dif ? escolher(r, E[1].opcoes, [1, 5, 4, 0.5]) : escolher(r, E[1].opcoes, [8, 2, 0.2, 0.5]),
          atividades: dif ? escolher(r, E[2].opcoes, [1, 5, 4, 0.5]) : escolher(r, E[2].opcoes, [8, 2, 0.2, 0.5]),
          frequencia: dif ? escolher(r, E[3].opcoes, [4, 5, 1]) : escolher(r, E[3].opcoes, [9, 1, 0.5]),
          evolucao: dif ? escolher(r, E[4].opcoes, [2, 2, 6, 0.5]) : escolher(r, E[4].opcoes, [4, 6, 0.3, 0.5]),
          haRegistro: 'Não', registro: '',
          indicacao: dif ? escolher(r, PC.INDICACOES, [1, 5, 4]) : escolher(r, PC.INDICACOES, [9, 1, 0])
        };
        if (dif && r() < 0.75) {
          reg.haRegistro = 'Sim';
          reg.registro = TEXTOS[Math.floor(r() * TEXTOS.length)];
        }
        regs.push(reg);
      });
      db.registros = db.registros.concat(regs);
      db.envios.push({
        dataHora: data, login: c[0], professor: 'Prof. de ' + c[1], turma: TURMA_A, componente: c[1],
        modo: todos ? 'todos' : 'selecionados', quantidade: regs.length
      });
    });
    return db;
  }

  function banco() {
    let db = PC.local.ler(CHAVE);
    if (!db) { db = criarBanco(); PC.local.gravar(CHAVE, db); }
    return db;
  }
  function salvar(db) { PC.local.gravar(CHAVE, db); }

  function falha(msg, codigo) { return { ok: false, erro: codigo || 'ERRO', mensagem: msg }; }

  function sessao(db, token, papel) {
    const s = db.sessoes[token];
    return s && s.papel === papel ? s : null;
  }

  function estudantesDa(db, turma) {
    return db.estudantes.filter(e => e.turma === turma).map(e => ({ numero: e.numero, nome: e.nome }));
  }

  const chave = (x, periodo, login, turma, comp) =>
    (x.periodo || periodo) === periodo && x.login === login && x.turma === turma && x.componente === comp;

  function processar(req) {
    const db = banco();
    switch (req.acao) {
      case 'loginProfessor': {
        const p = db.professores.find(x => x.login === String(req.login || '').trim().toLowerCase());
        if (!p || req.senha !== '1234') return falha('Login ou senha incorretos.');
        const token = 'demo-' + Math.random().toString(36).slice(2);
        db.sessoes[token] = { papel: 'prof', login: p.login, nome: p.nome };
        salvar(db);
        return {
          ok: true, token, login: p.login, nome: p.nome, periodo: db.periodoAtual, aberto: db.aberto,
          atribuicoes: db.atribuicoes.filter(a => a.login === p.login).map(a => ({ turma: a.turma, componente: a.componente }))
        };
      }
      case 'abrirTurma': {
        const s = sessao(db, req.token, 'prof');
        if (!s) return falha('Sua sessão expirou. Entre novamente.', 'SESSAO');
        const anteriores = db.registros.filter(x => chave(x, db.periodoAtual, s.login, req.turma, req.componente));
        const envio = db.envios.find(x => chave(x, db.periodoAtual, s.login, req.turma, req.componente));
        return {
          ok: true, periodo: db.periodoAtual, aberto: db.aberto, estudantes: estudantesDa(db, req.turma),
          anteriores, envio: envio ? { dataHora: envio.dataHora, modo: envio.modo } : null
        };
      }
      case 'enviar': {
        const s = sessao(db, req.token, 'prof');
        if (!s) return falha('Sua sessão expirou. Entre novamente.', 'SESSAO');
        const agora = new Date().toISOString();
        const lista = estudantesDa(db, req.turma);
        db.registros = db.registros.filter(x => !chave(x, db.periodoAtual, s.login, req.turma, req.componente));
        db.envios = db.envios.filter(x => !chave(x, db.periodoAtual, s.login, req.turma, req.componente));
        (req.registros || []).forEach(r => {
          const est = lista.find(e => e.nome === r.estudante) || {};
          db.registros.push(Object.assign({}, r, {
            dataHora: agora, login: s.login, professor: s.nome, turma: req.turma,
            componente: req.componente, numero: est.numero, registro: r.haRegistro === 'Sim' ? r.registro : ''
          }));
        });
        db.envios.push({
          dataHora: agora, login: s.login, professor: s.nome, turma: req.turma, componente: req.componente,
          modo: req.modo, quantidade: (req.registros || []).length
        });
        salvar(db);
        return { ok: true, dataHora: agora, quantidade: (req.registros || []).length };
      }
      case 'loginCoordenacao': {
        if (String(req.login || '').trim().toLowerCase() !== 'coordenacao' || req.senha !== '1234') {
          return falha('Login ou senha incorretos.');
        }
        const token = 'demo-' + Math.random().toString(36).slice(2);
        db.sessoes[token] = { papel: 'coord', login: 'coordenacao', nome: 'Coordenação' };
        salvar(db);
        return { ok: true, token, login: 'coordenacao', nome: 'Coordenação', periodo: db.periodoAtual };
      }
      case 'painel': {
        if (!sessao(db, req.token, 'coord')) return falha('Sua sessão expirou. Entre novamente.', 'SESSAO');
        const nomes = {};
        db.professores.forEach(p => { nomes[p.login] = p.nome; });
        return {
          ok: true, periodo: db.periodoAtual, periodoAtual: db.periodoAtual, aberto: db.aberto,
          periodos: [db.periodoAtual], estudantes: db.estudantes,
          atribuicoes: db.atribuicoes.map(a => Object.assign({ professor: nomes[a.login] }, a)),
          registros: db.registros, envios: db.envios
        };
      }
      case 'fotos':
        // A demonstração não usa fotos: a ficha mostra as iniciais do estudante.
        return { ok: true, fotos: {} };
      case 'sair':
        delete db.sessoes[req.token];
        salvar(db);
        return { ok: true };
      default:
        return falha('Ação desconhecida.');
    }
  }

  /** Apaga os dados de demonstração e recria os originais. */
  function reiniciar() { PC.local.remover(CHAVE); }

  window.Demo = { processar, reiniciar };
})();
