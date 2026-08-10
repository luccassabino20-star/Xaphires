import * as repo from "../repo.js";
import { getCompany } from "../directory.js";
import { rotulos } from "./labels.js";

// Montagem do relatório. Este arquivo é a única fonte dos números: o Excel e o PDF
// só desenham o que sai daqui, para os dois nunca discordarem entre si.
//
// > A LEITURA É SEMPRE repo.getWorkspace(usuarioLogado). Nunca getWorkspaceCompleto,
// > nunca uma consulta própria em `cards`. É essa função que já aplica a regra de
// > quadro privado, e é o que garante que o relatório de um convidado não vaze o
// > quadro a que ele não foi convidado. Filtrar por membro DEPOIS não protege nada:
// > pedir o relatório "do Lucas" não pode devolver os cartões dele em quadro que
// > quem pediu não enxerga.

const STATUS = new Set(["todos", "pendentes", "concluidos"]);

export function statusValido(valor) {
  return STATUS.has(valor);
}

// Escrito com \u e não com o caractere literal: a faixa de acentos combinantes é
// invisível no editor, e um salvamento em outra codificação a transforma em lixo.
const ACENTOS_RE = new RegExp("[\\u0300-\\u036f]", "g");

// Uma coluna cujo título é um destes conta como coluna de conclusão. Cobre os três
// idiomas em que o quadro é semeado (`seedContent.js` cria "Concluído", "Done" e
// "Completado") mais os sinônimos que as pessoas escrevem ao renomear.
const TITULOS_DE_CONCLUSAO = new Set([
  "concluido", "concluida", "concluidos", "concluidas", "concluir",
  "feito", "feitos", "finalizado", "finalizada", "finalizados", "finalizadas",
  "encerrado", "encerrada", "pronto", "prontos",
  "done", "completed", "complete", "finished", "closed",
  "completado", "completada", "completados", "completadas", "terminado", "terminada",
  "hecho", "hechos", "cerrado", "cerrada",
]);

/**
 * A comparação é por igualdade sobre o título normalizado, e não por "contém", de
 * propósito: com `includes` uma coluna chamada "A concluir" ou "Não concluído" -
 * que é o oposto - entraria como concluída e inflaria a taxa de conclusão do
 * relatório. Normalizar derrubando acento, caixa e tudo que não é letra ou número
 * é o que faz "Concluído ✅", "CONCLUIDOS" e "concluido" caírem no mesmo lugar.
 */
export function colunaDeConclusao(titulo) {
  const limpo = (titulo || "")
    .normalize("NFD")
    .replace(ACENTOS_RE, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "");
  return TITULOS_DE_CONCLUSAO.has(limpo);
}

// Data civil de hoje no fuso do servidor, no mesmo formato de `due` (YYYY-MM-DD).
// Comparar string com string é de propósito: `due` é data civil, e converter para
// Date traria fuso para uma conta que não tem hora nenhuma.
function hojeCivil(agora = new Date()) {
  const y = agora.getFullYear();
  const m = String(agora.getMonth() + 1).padStart(2, "0");
  const d = String(agora.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function estaAtrasado(cartao, hoje) {
  if (!cartao.due || cartao.completed) return false;
  return cartao.due < hoje;
}

function kpisDe(cartoes, hoje) {
  const concluidos = cartoes.filter((c) => c.completed).length;
  const atrasados = cartoes.filter((c) => estaAtrasado(c, hoje)).length;
  let itensFeitos = 0;
  let itensTotal = 0;
  for (const c of cartoes) {
    itensFeitos += c.checklistFeitos;
    itensTotal += c.checklistTotal;
  }
  return {
    total: cartoes.length,
    concluidos,
    pendentes: cartoes.length - concluidos,
    atrasados,
    semPrazo: cartoes.filter((c) => !c.due).length,
    urgentes: cartoes.filter((c) => c.urgent && !c.completed).length,
    importantes: cartoes.filter((c) => c.important && !c.completed).length,
    comAnexo: cartoes.filter((c) => c.anexos > 0).length,
    itensFeitos,
    itensTotal,
    // Inteiro por decisão: relatório executivo com uma casa decimal sugere uma
    // precisão que a conta não tem.
    taxaConclusao: cartoes.length ? Math.round((concluidos / cartoes.length) * 100) : 0,
  };
}

/**
 * @param userId    quem pediu o relatório - define o que pode ser lido
 * @param companyId empresa em curso, só para o nome no cabeçalho
 * @param boardIds  null/[] = todos os quadros visíveis; array = só aqueles quadros
 * @param memberId  null = todo mundo; id = só os cartões daquele responsável
 * @param status    "todos" | "pendentes" | "concluidos"
 * @param idioma    pt | en | es, para os textos do arquivo gerado
 */
export function montarRelatorio({ userId, companyId, boardIds = null, memberId = null, status = "todos", idioma = "pt" }) {
  const t = rotulos(idioma);
  const agora = new Date();
  const hoje = hojeCivil(agora);

  const filtroDeQuadros = Array.isArray(boardIds) && boardIds.length > 0 ? new Set(boardIds) : null;
  const quadros = repo.getWorkspace(userId).filter((b) => !filtroDeQuadros || filtroDeQuadros.has(b.id));
  const usuarios = repo.listUsers();
  const nomePorId = new Map(usuarios.map((u) => [u.id, u.name]));

  // Achata os cartões de todos os quadros visíveis, guardando de onde cada um veio.
  // Arquivado fica de fora: ele já saiu do quadro, e entrar no relatório faria o
  // total do relatório não bater com o que a pessoa vê na tela.
  const cartoes = [];
  for (const quadro of quadros) {
    for (const lista of quadro.lists) {
      // A coluna inteira responde por conclusão, então o teste é por lista e não
      // por cartão - fazer a normalização do título uma vez por coluna em vez de
      // uma vez por cartão poupa o trabalho repetido num quadro grande.
      const colunaConclui = colunaDeConclusao(lista.title);
      for (const cardId of lista.cardIds) {
        const c = quadro.cards[cardId];
        if (!c || c.archived) continue;
        const checklist = c.checklist || [];
        // Concluído é o checkbox do cartão OU a coluna em que ele está. Cartão
        // arrastado para "Concluído" sem ninguém marcar o checkbox é o caso comum,
        // e contá-lo como pendente fazia o relatório discordar do que se vê no
        // quadro. Fica aqui, no montador, porque este arquivo é a fonte única dos
        // números: CSV, Excel e PDF herdam a mesma definição sem repeti-la.
        const concluido = !!c.completed || colunaConclui;
        cartoes.push({
          id: c.id,
          titulo: c.title,
          descricao: c.description || "",
          quadroId: quadro.id,
          quadro: quadro.title,
          coluna: lista.title,
          responsaveisIds: c.memberIds || [],
          responsaveis: (c.memberIds || []).map((id) => nomePorId.get(id)).filter(Boolean),
          due: c.due || null,
          startDate: c.startDate || null,
          completed: concluido,
          // Só a conclusão pelo checkbox carimba data. Cartão concluído por estar
          // na coluna sai com a data em branco, e é a resposta certa: ninguém
          // registrou quando aconteceu, e chutar a data de entrada na coluna seria
          // apresentar palpite como fato num relatório.
          completedAt: c.completedAt || null,
          criadoEm: c.createdAt || null,
          urgent: !!c.urgent,
          important: !!c.important,
          etiquetas: (c.labels || []).map((id) => t.etiquetas[id] || id),
          checklistFeitos: checklist.filter((i) => i.done).length,
          checklistTotal: checklist.length,
          anexos: (c.attachments || []).length,
          local: c.location?.address || "",
        });
      }
    }
  }

  const porStatus = (lista) =>
    status === "pendentes" ? lista.filter((c) => !c.completed) : status === "concluidos" ? lista.filter((c) => c.completed) : lista;

  const doMembro = (lista, id) => lista.filter((c) => c.responsaveisIds.includes(id));

  // O filtro de status vale para tudo que sai no arquivo, inclusive os KPIs: um
  // relatório "só pendentes" mostrando taxa de conclusão do total confundiria mais
  // do que ajudaria.
  const visiveis = porStatus(cartoes);

  // Uma seção por responsável. Com membro específico sai uma só; com "todos" sai
  // uma por pessoa que tenha cartão, mais a dos cartões sem responsável - eles são
  // justamente os que costumam ficar esquecidos, e some-los seria esconder o
  // problema.
  const secoes = [];
  if (memberId) {
    const alvo = usuarios.find((u) => u.id === memberId);
    if (!alvo) return null;
    secoes.push({ id: alvo.id, nome: alvo.name, email: alvo.email, cartoes: doMembro(visiveis, alvo.id) });
  } else {
    for (const u of usuarios) {
      const meus = doMembro(visiveis, u.id);
      if (meus.length > 0) secoes.push({ id: u.id, nome: u.name, email: u.email, cartoes: meus });
    }
    const semDono = visiveis.filter((c) => c.responsaveisIds.length === 0);
    if (semDono.length > 0) secoes.push({ id: null, nome: t.semResponsavel, email: "", cartoes: semDono });
  }
  for (const secao of secoes) secao.kpis = kpisDe(secao.cartoes, hoje);

  // Os cartões que entram no total geral. Com membro escolhido o "geral" é o dele -
  // senão o resumo mostraria a empresa inteira num relatório individual.
  const doRelatorio = memberId ? secoes[0].cartoes : visiveis;

  const porQuadro = quadros
    .map((q) => {
      const lista = doRelatorio.filter((c) => c.quadroId === q.id);
      return { id: q.id, titulo: q.title, ...kpisDe(lista, hoje) };
    })
    .filter((q) => q.total > 0);

  return {
    idioma,
    t,
    geradoEm: agora,
    empresa: getCompany(companyId)?.name || "",
    // Com filtro, o escopo lista os quadros escolhidos pelo título - "Vendas, TI" -
    // em vez de um id que não diz nada a quem abre o arquivo depois. `quadros` já
    // está filtrado pra esse mesmo conjunto, então não há segunda fonte de verdade.
    escopo: filtroDeQuadros ? quadros.map((q) => q.title).join(", ") || t.todosOsQuadros : t.todosOsQuadros,
    membroEscolhido: memberId ? secoes[0].nome : null,
    status,
    hoje,
    kpis: kpisDe(doRelatorio, hoje),
    porQuadro,
    secoes,
    // Lista achatada, um cartão por linha (sem a duplicata por responsável que as
    // seções têm de propósito). É o que o PDF usa pra montar uma tabela única com
    // todo mundo junto, em vez de uma seção por pessoa - ver gerarPdf.
    cartoes: doRelatorio,
    // Marca cartão atrasado uma vez só, aqui, para o Excel e o PDF não repetirem a
    // regra e discordarem na virada do dia.
    atrasado: (cartao) => estaAtrasado(cartao, hoje),
  };
}
