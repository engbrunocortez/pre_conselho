/**
 * ============================================================================
 *  COMUM — definições e funções usadas pela área do professor e pelo painel
 * ============================================================================
 */
(function () {
  'use strict';

  /* --------------------------------------------------------------------------
   * Escalas da ficha do estudante.
   * ATENÇÃO: se alterar algum texto aqui, altere também OPCOES no Apps Script,
   * pois o servidor recusa respostas fora destas listas.
   * ------------------------------------------------------------------------ */
  const ESCALAS = [
    {
      id: 'competencias', titulo: 'Desenvolvimento das competências', curto: 'Competências',
      opcoes: ['Adequado ao momento do curso', 'Em desenvolvimento', 'Requer maior acompanhamento', 'Não foi possível observar']
    },
    {
      id: 'participacao', titulo: 'Participação nas propostas de aprendizagem', curto: 'Participação',
      opcoes: ['Frequente', 'Oscilante', 'Reduzida', 'Não foi possível observar']
    },
    {
      id: 'atividades', titulo: 'Realização das atividades propostas', curto: 'Atividades',
      opcoes: ['Regular', 'Parcial', 'Muito reduzida', 'Não foi possível observar']
    },
    {
      id: 'frequencia', titulo: 'Frequência/assiduidade percebida no componente', curto: 'Frequência',
      opcoes: ['Regular', 'Requer atenção', 'Não foi possível observar']
    },
    {
      id: 'evolucao', titulo: 'Evolução percebida durante o período', curto: 'Evolução',
      opcoes: ['Evolução perceptível', 'Mantém o desenvolvimento esperado', 'Apresenta dificuldades persistentes', 'Não foi possível observar']
    }
  ];

  const NAO_OBSERVADO = 'Não foi possível observar';

  /** Menções oficiais (devem ser iguais a OPCOES.mencao no Apps Script). */
  const MENCOES = [
    { valor: 'I', titulo: 'Insatisfatório' },
    { valor: 'R', titulo: 'Regular' },
    { valor: 'B', titulo: 'Bom' },
    { valor: 'MB', titulo: 'Muito Bom' }
  ];

  /** Iniciais para o avatar quando não há foto. */
  function iniciais(nome) {
    const p = String(nome || '').trim().split(/\s+/).filter(x => x.length > 2 || /^[A-ZÀ-Ú]/.test(x));
    return ((p[0] || '')[0] || '') + ((p.length > 1 ? p[p.length - 1] : '')[0] || '');
  }

  /** Foto do estudante (ou iniciais). */
  function htmlFoto(nome, fotos, classe) {
    const src = fotos && fotos[nome];
    return src
      ? '<img class="foto ' + (classe || '') + '" src="' + src + '" alt="Foto de ' + esc(nome) + '">'
      : '<div class="foto foto-vazia ' + (classe || '') + '" aria-hidden="true">' + esc(iniciais(nome).toUpperCase()) + '</div>';
  }

  const INDICACOES = [
    'Não identifico necessidade específica de discussão',
    'Considero importante acompanhar este estudante',
    'Considero importante discutir este estudante no Conselho'
  ];
  const IND_SEM = INDICACOES[0];
  const IND_ACOMP = INDICACOES[1];
  const IND_DISC = INDICACOES[2];

  /* --------------------------------------------------------------------------
   * Armazenamento no navegador (sempre protegido por try/catch)
   * ------------------------------------------------------------------------ */
  function criarArmazem(tipo) {
    return {
      ler(chave) {
        try { const v = window[tipo].getItem(chave); return v ? JSON.parse(v) : null; } catch (e) { return null; }
      },
      gravar(chave, valor) {
        try { window[tipo].setItem(chave, JSON.stringify(valor)); return true; } catch (e) { return false; }
      },
      remover(chave) {
        try { window[tipo].removeItem(chave); } catch (e) { /* ignora */ }
      }
    };
  }
  const local = criarArmazem('localStorage');
  const sessao = criarArmazem('sessionStorage');

  /* --------------------------------------------------------------------------
   * Comunicação com o servidor (Apps Script) ou com o modo demonstração
   * ------------------------------------------------------------------------ */
  const MODO_DEMO = !(window.CONFIG && window.CONFIG.API_URL);

  async function api(acao, dados) {
    const corpo = Object.assign({ acao: acao }, dados || {});
    let resposta;
    if (MODO_DEMO) {
      await new Promise(r => setTimeout(r, 250));
      resposta = window.Demo.processar(JSON.parse(JSON.stringify(corpo)));
    } else {
      const controle = new AbortController();
      const timer = setTimeout(() => controle.abort(), window.CONFIG.TEMPO_LIMITE_MS || 45000);
      try {
        // Sem cabeçalhos personalizados: evita a verificação CORS "preflight",
        // que o Apps Script não atende.
        const r = await fetch(window.CONFIG.API_URL, {
          method: 'POST', body: JSON.stringify(corpo), redirect: 'follow', signal: controle.signal
        });
        resposta = await r.json();
      } catch (e) {
        const err = new Error(e.name === 'AbortError'
          ? 'O servidor demorou a responder. Verifique sua conexão e tente novamente.'
          : 'Não foi possível conectar ao servidor. Verifique sua conexão com a internet.');
        err.codigo = 'REDE';
        throw err;
      } finally {
        clearTimeout(timer);
      }
    }
    if (!resposta || !resposta.ok) {
      const err = new Error((resposta && resposta.mensagem) || 'Erro inesperado.');
      err.codigo = (resposta && resposta.erro) || 'ERRO';
      throw err;
    }
    return resposta;
  }

  /* --------------------------------------------------------------------------
   * Utilitários de interface
   * ------------------------------------------------------------------------ */
  function esc(t) {
    return String(t == null ? '' : t)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  function dataHora(iso) {
    if (!iso) return '';
    const d = new Date(iso);
    if (isNaN(d)) return String(iso);
    return d.toLocaleDateString('pt-BR') + ' às ' +
      d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  }

  function doisDigitos(n) { return String(n).padStart(2, '0'); }

  function plural(n, singular, pluralTxt) { return n === 1 ? singular : pluralTxt; }

  /** Mostra uma mensagem breve no rodapé da tela. */
  let timerAviso = null;
  function aviso(msg, tipo) {
    let el = document.getElementById('aviso-flutuante');
    if (!el) {
      el = document.createElement('div');
      el.id = 'aviso-flutuante';
      el.setAttribute('role', 'status');
      el.setAttribute('aria-live', 'polite');
      document.body.appendChild(el);
    }
    el.textContent = msg;
    el.className = 'aviso-flutuante visivel ' + (tipo || '');
    clearTimeout(timerAviso);
    timerAviso = setTimeout(() => { el.className = 'aviso-flutuante'; }, 3800);
  }

  function faixaDemo() {
    if (!MODO_DEMO) return '';
    return '<div class="faixa-demo"><b>Modo demonstração</b> · dados fictícios, apenas neste navegador</div>';
  }

  window.PC = {
    ESCALAS, NAO_OBSERVADO, MENCOES, htmlFoto, INDICACOES, IND_SEM, IND_ACOMP, IND_DISC,
    local, sessao, MODO_DEMO, api, esc, dataHora, doisDigitos, plural, aviso, faixaDemo
  };
})();
