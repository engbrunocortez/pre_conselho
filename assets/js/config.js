/**
 * ============================================================================
 *  CONFIGURAÇÕES DO SITE — ÚNICO ARQUIVO QUE VOCÊ PRECISA EDITAR
 * ============================================================================
 *  Turmas, estudantes, professores e componentes NÃO ficam aqui: eles são
 *  cadastrados na planilha Google (abas Estudantes, Professores e Atribuicoes),
 *  para que nenhum dado de estudante fique publicado no GitHub.
 * ============================================================================
 */
window.CONFIG = {
  /**
   * URL do Web App do Google Apps Script (termina em /exec).
   * Enquanto estiver vazia (''), o site funciona em MODO DEMONSTRAÇÃO,
   * com dados fictícios guardados apenas no navegador.
   *
   * Exemplo:
   * API_URL: 'https://script.google.com/macros/s/AKfycb.../exec',
   */
  API_URL: 'https://script.google.com/macros/s/AKfycbz2o_mduG2Pn1C060nT72TkXmNlb2wroyOjU87-AMrCOf3Ezr0Eix0QMFkAIVwoQ0yO/exec',

  /** Nome exibido no topo das páginas. */
  NOME_ESCOLA: 'Etec Padre Carlos Leôncio da Silva',

  /** Tempo máximo de espera por uma resposta do servidor (milissegundos). */
  TEMPO_LIMITE_MS: 45000
};
