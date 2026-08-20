// Fonte ÚNICA dos números do Financeiro. O fluxo de caixa e o DRE saem daqui, e
// só daqui - o cliente desenha o que estas funções devolvem, nunca reconta.
// Mesma lição do reports/dados.js: uma segunda definição de "o que conta" faz as
// telas discordarem entre si sobre os mesmos lançamentos.
//
// Regime de CAIXA nesta fase: realizado é o que foi baixado (status
// 'finalizado'), datado pela baixa (paid_at). O regime de competência (pelo
// vencimento) fica anotado como evolução - hoje fluxo e DRE contam a mesma
// história para não confundir.
import { lancamentosDoAno, lancamentosPagosNoPeriodo, lancamentosFinalizadosAntesDe, getCategoria, listContas, movimentoPorConta, liquidoCents, getConta, finalizadosDaConta, estornadosDaConta, apropriacoesDeVarios, addMesesCivil } from "./repo.js";

// Estados de "aberto" - o título ainda deve entrar/sair, então conta no previsto
// do fluxo. 'finalizado' já é realizado; 'anulado' não conta em lugar nenhum.
const ABERTOS = ["provisionado", "pendente", "disponivel"];

// Mês civil (1..12) de uma data 'YYYY-MM-DD'. Sem new Date() de propósito: a
// string já é a data civil, e parsear como Date reintroduziria fuso.
function mesDe(civil) {
  return civil ? Number(civil.slice(5, 7)) : null;
}

// Fluxo de caixa mês a mês do ano. Para cada mês:
//   - realizado: entradas/saídas FINALIZADAS, agrupadas por paid_at
//   - previsto:  entradas/saídas EM ABERTO, agrupadas por due (vencimento)
// saldoAcumulado é o realizado somado mês a mês - a "linha do saldo".
export function montarFluxo(ano) {
  const linhas = Array.from({ length: 12 }, (_, i) => ({
    mes: i + 1,
    entradasRealizadas: 0,
    saidasRealizadas: 0,
    entradasPrevistas: 0,
    saidasPrevistas: 0,
  }));

  for (const l of lancamentosDoAno(ano)) {
    const ehReceber = l.tipo === "receber";
    const liq = liquidoCents(l); // caixa move o líquido, não o valor bruto do título
    if (l.status === "finalizado" && l.paid_at && l.paid_at.startsWith(String(ano))) {
      const idx = mesDe(l.paid_at) - 1;
      if (ehReceber) linhas[idx].entradasRealizadas += liq;
      else linhas[idx].saidasRealizadas += liq;
    } else if (ABERTOS.includes(l.status) && l.due && l.due.startsWith(String(ano))) {
      const idx = mesDe(l.due) - 1;
      if (ehReceber) linhas[idx].entradasPrevistas += liq;
      else linhas[idx].saidasPrevistas += liq;
    }
  }

  let acumulado = 0;
  for (const linha of linhas) {
    linha.saldoRealizado = linha.entradasRealizadas - linha.saidasRealizadas;
    linha.saldoPrevisto = linha.entradasPrevistas - linha.saidasPrevistas;
    acumulado += linha.saldoRealizado;
    linha.saldoAcumulado = acumulado;
  }

  const totais = linhas.reduce(
    (acc, l) => ({
      entradasRealizadas: acc.entradasRealizadas + l.entradasRealizadas,
      saidasRealizadas: acc.saidasRealizadas + l.saidasRealizadas,
      entradasPrevistas: acc.entradasPrevistas + l.entradasPrevistas,
      saidasPrevistas: acc.saidasPrevistas + l.saidasPrevistas,
    }),
    { entradasRealizadas: 0, saidasRealizadas: 0, entradasPrevistas: 0, saidasPrevistas: 0 }
  );
  totais.saldoRealizado = totais.entradasRealizadas - totais.saidasRealizadas;

  return { ano, linhas, totais };
}

// Saldos por conta corrente: saldo_inicial + movimento realizado (receber −
// pagar do que está pago naquela conta). Derivado, nunca gravado, para um estorno
// nunca deixar o saldo mentindo. Devolve também o saldo total somado.
export function montarSaldos() {
  const mov = Object.fromEntries(movimentoPorConta().map((r) => [r.conta_id, r.mov]));
  const contas = listContas().map((c) => ({
    id: c.id,
    nome: c.nome,
    banco: c.banco,
    ativo: c.ativo === 1,
    saldoInicial: c.saldo_inicial_cents,
    movimento: mov[c.id] || 0,
    saldo: c.saldo_inicial_cents + (mov[c.id] || 0),
  }));
  return { contas, saldoTotal: contas.reduce((s, c) => s + c.saldo, 0) };
}

// Movimentação (extrato) de UMA conta num período [de, ate], em regime de caixa.
// É a fonte única dos números da aba Movimentação - o cliente desenha o que sai
// daqui e não reconta. Todas as datas são civis 'YYYY-MM-DD', então comparo como
// string (a ordem lexicográfica coincide com a cronológica nesse formato), sem
// new Date() para não reintroduzir fuso.
//
// Os cinco saldos, todos ancorados no saldo inicial da conta e no sinal do
// lançamento (receber entra +, pagar sai -):
//   - saldoAnterior  = inicial + movimento realizado ANTES de `de`
//   - creditos       = entradas (receber) realizadas no período
//   - debitos        = saídas (pagar) realizadas no período
//   - saldoAtual     = fechamento do período = saldoAnterior + creditos - debitos
//                      (por construção idêntico a inicial + movimento até `ate`)
//   - saldoConferido = inicial + movimento até `ate` SÓ dos conferidos
//
// Estorno não entra em saldo nenhum: ao ser estornado o título deixa de ser
// finalizado, então some naturalmente do realizado. Ele só reaparece na LISTA
// quando `incluirEstornados`, para consulta, marcado e datado pela data do estorno.
export function montarMovimentacao(contaId, de, ate, { incluirEstornados = false } = {}) {
  const conta = getConta(contaId);
  if (!conta) return null;
  const inicial = conta.saldo_inicial_cents;
  const sinal = (l) => (l.tipo === "receber" ? liquidoCents(l) : -liquidoCents(l));

  let anteriorMov = 0, creditos = 0, debitos = 0, conferidoMov = 0;
  const noPeriodo = [];
  for (const l of finalizadosDaConta(contaId)) {
    const d = l.paid_at || "";
    if (d < de) anteriorMov += sinal(l);
    if (d <= ate && l.conferido === 1) conferidoMov += sinal(l);
    if (d >= de && d <= ate) {
      if (l.tipo === "receber") creditos += liquidoCents(l);
      else debitos += liquidoCents(l);
      noPeriodo.push({ ...l, estornado: false, data: d });
    }
  }

  const saldoAnterior = inicial + anteriorMov;
  const saldoAtual = saldoAnterior + creditos - debitos;
  const saldoConferido = inicial + conferidoMov;

  let movimentos = noPeriodo;
  if (incluirEstornados) {
    const estornados = estornadosDaConta(contaId)
      .filter((l) => l.estornado_em >= de && l.estornado_em <= ate)
      .map((l) => ({ ...l, estornado: true, data: l.estornado_em }));
    movimentos = [...noPeriodo, ...estornados];
  }
  // Mais recente primeiro, pela data efetiva da linha (baixa ou estorno).
  movimentos.sort((a, b) => (b.data || "").localeCompare(a.data || ""));

  return { contaId, de, ate, saldoAnterior, creditos, debitos, saldoAtual, saldoConferido, movimentos };
}

// DRE gerencial do período (regime de caixa): agrupa os lançamentos FINALIZADOS por
// categoria. Receita é o que a categoria diz ser receita, e não o tipo do
// lançamento - assim um estorno lançado como 'pagar' numa categoria de receita
// cai no lugar certo. Sem categoria, entra num balde "Sem categoria" para não
// sumir do resultado.
//
// Um título RATEADO por classe (Lançamento Manual com várias classes) tem o valor
// dividido entre as classes das apropriações; aqui o líquido é distribuído na
// mesma proporção, então cada parte cai na sua classe (e no lado certo do DRE
// pelo tipo dela). Rateio só por centro (sem classe) não muda nada: vale a classe
// do título.
export function montarDRE(de, ate) {
  const receitas = new Map(); // categoryId -> { nome, total }
  const despesas = new Map();
  const SEM = { id: null, nome: null }; // rótulo resolvido no cliente (i18n)

  // Soma `valor` na classe `catId`, no lado certo (receita/despesa). O tipo do
  // lançamento é o desempate quando não há classe.
  function acumular(catId, tipoLanc, valor) {
    const cat = catId ? getCategoria(catId) : null;
    const ehReceita = cat ? cat.tipo === "receita" : tipoLanc === "receber";
    const alvo = ehReceita ? receitas : despesas;
    const chave = cat ? cat.id : "__sem__";
    const linha = alvo.get(chave) || { id: cat ? cat.id : null, nome: cat ? cat.nome : SEM.nome, total: 0 };
    linha.total += valor;
    alvo.set(chave, linha);
  }

  // Apropriações de todos os títulos do período numa consulta só (evita N+1).
  const titulos = lancamentosPagosNoPeriodo(de, ate);
  const aprPorTitulo = new Map();
  for (const a of apropriacoesDeVarios(titulos.map((t) => t.id))) {
    if (!a.category_id) continue; // só as com classe própria dividem o DRE
    if (!aprPorTitulo.has(a.lancamento_id)) aprPorTitulo.set(a.lancamento_id, []);
    aprPorTitulo.get(a.lancamento_id).push(a);
  }

  for (const l of titulos) {
    const liq = liquidoCents(l); // DRE também pelo líquido, coerente com o caixa
    const comClasse = aprPorTitulo.get(l.id) || [];
    if (comClasse.length && l.valor_cents > 0) {
      // Cada apropriação com classe leva a sua fatia do valor bruto; o que sobrar
      // (rateio parcial) volta para a classe do título. O líquido é dividido na
      // mesma proporção, com o resto no último balde para fechar exato.
      const somaClasse = comClasse.reduce((s, a) => s + a.valor_cents, 0);
      const partes = comClasse.map((a) => ({ catId: a.category_id, bruto: a.valor_cents }));
      const resto = l.valor_cents - somaClasse;
      if (resto > 0) partes.push({ catId: l.category_id, bruto: resto });
      let distribuido = 0;
      partes.forEach((p, i) => {
        const fatia = i === partes.length - 1 ? liq - distribuido : Math.round((liq * p.bruto) / l.valor_cents);
        distribuido += fatia;
        acumular(p.catId, l.tipo, fatia);
      });
    } else {
      acumular(l.category_id, l.tipo, liq);
    }
  }

  const listaReceitas = [...receitas.values()].sort((a, b) => b.total - a.total);
  const listaDespesas = [...despesas.values()].sort((a, b) => b.total - a.total);
  const totalReceitas = listaReceitas.reduce((s, l) => s + l.total, 0);
  const totalDespesas = listaDespesas.reduce((s, l) => s + l.total, 0);

  return {
    de,
    ate,
    receitas: listaReceitas,
    despesas: listaDespesas,
    totalReceitas,
    totalDespesas,
    resultado: totalReceitas - totalDespesas,
  };
}

// ---------- Fluxo de Caixa em matriz (DRE de caixa por período) ----------
// Usado pelo relatório "Fluxo de caixa" de Saúde & Clínicas, que reaproveita este
// livro-razão em vez de duplicá-lo numa tabela própria do módulo (é a mesma lição
// do resto do arquivo: uma segunda fonte de "quanto entrou/saiu" diverge cedo ou
// tarde). Aqui o resultado não é um total do período, e sim uma MATRIZ: uma linha
// por grupo fixo do DRE, uma coluna por mês ou por dia.

// 8 baldes fixos (em vez da categoria livre) - o que o requisito do relatório pede
// como linha. Uma categoria sem grupo_dre cai no default pelo tipo dela
// (resolverGrupoDre), nunca some da matriz.
const GRUPOS_RECEITA = ["receita_atendimento", "receita_produtos", "receita_outras"];
const GRUPOS_DESPESA = ["despesa_operacional", "despesa_financeira", "despesa_pessoal", "despesa_impostos", "despesa_outras"];
export const GRUPOS_DRE_VALIDOS = [...GRUPOS_RECEITA, ...GRUPOS_DESPESA];
// Transferência entre contas próprias não existe no ledger hoje (só há
// receber/pagar amarrado a categoria) - as linhas aparecem na matriz (fiéis ao
// layout pedido) mas ficam sempre zero. TODO: modelar transferência de verdade no
// Financeiro (schema + baixa dupla) é o que destravaria isto; fora do escopo de
// uma tela de relatório.
const GRUPOS_TRANSFERENCIA = ["transferencia_entrada", "transferencia_saida"];

export function resolverGrupoDre(categoria, tipoLancamento) {
  if (categoria?.grupo_dre && GRUPOS_DRE_VALIDOS.includes(categoria.grupo_dre)) return categoria.grupo_dre;
  return tipoLancamento === "receber" ? "receita_outras" : "despesa_outras";
}

function ultimoDiaDoMes(mesKey) {
  const [y, m] = mesKey.split("-").map(Number);
  return new Date(y, m, 0).getDate();
}

// Colunas da matriz: "diario" mostra todos os dias do mês de `referencia"; "mensal"
// mostra uma janela deslizante de 6 meses terminando no mês de `referencia`. Cada
// coluna carrega o próprio [de, ate] em data civil, para a consulta ler o intervalo
// total de uma vez (uma query, sem N+1 por coluna).
function montarColunas(view, referencia) {
  if (view === "diario") {
    const mesRef = referencia.slice(0, 7);
    const dias = ultimoDiaDoMes(mesRef);
    return Array.from({ length: dias }, (_, i) => {
      const dia = String(i + 1).padStart(2, "0");
      const key = `${mesRef}-${dia}`;
      return { key, de: key, ate: key, label: dia };
    });
  }
  const mesFinal = `${referencia.slice(0, 7)}-01`;
  const meses = Array.from({ length: 6 }, (_, i) => addMesesCivil(mesFinal, i - 5));
  return meses.map((m) => {
    const key = m.slice(0, 7);
    return { key, de: `${key}-01`, ate: `${key}-${String(ultimoDiaDoMes(key)).padStart(2, "0")}`, label: key };
  });
}

// Classifica cada lançamento FINALIZADO do período nos grupos do DRE de caixa,
// dividindo pelo rateio quando o título tem apropriações com classe própria - mesmo
// raciocínio de montarDRE.acumular, mas devolvendo o detalhe POR TÍTULO em vez de só
// o total. É o que permite a matriz (soma por grupo+coluna) e o drill-down
// (listarLancamentosDoGrupo) saírem da MESMA passada e nunca divergirem entre si.
function classificarPorGrupo(titulos) {
  const aprPorTitulo = new Map();
  for (const a of apropriacoesDeVarios(titulos.map((t) => t.id))) {
    if (!a.category_id) continue;
    if (!aprPorTitulo.has(a.lancamento_id)) aprPorTitulo.set(a.lancamento_id, []);
    aprPorTitulo.get(a.lancamento_id).push(a);
  }

  const partes = [];
  for (const l of titulos) {
    const liq = liquidoCents(l);
    const comClasse = aprPorTitulo.get(l.id) || [];
    if (comClasse.length && l.valor_cents > 0) {
      const somaClasse = comClasse.reduce((s, a) => s + a.valor_cents, 0);
      const fatias = comClasse.map((a) => ({ catId: a.category_id, bruto: a.valor_cents }));
      const resto = l.valor_cents - somaClasse;
      if (resto > 0) fatias.push({ catId: l.category_id, bruto: resto });
      let distribuido = 0;
      fatias.forEach((f, i) => {
        const valor = i === fatias.length - 1 ? liq - distribuido : Math.round((liq * f.bruto) / l.valor_cents);
        distribuido += valor;
        const cat = f.catId ? getCategoria(f.catId) : null;
        partes.push({ lancamento: l, grupo: resolverGrupoDre(cat, l.tipo), valor });
      });
    } else {
      const cat = l.category_id ? getCategoria(l.category_id) : null;
      partes.push({ lancamento: l, grupo: resolverGrupoDre(cat, l.tipo), valor: liq });
    }
  }
  return partes;
}

function linhaDoGrupo(grupo, colunas, mapa) {
  const valores = {};
  let total = 0;
  for (const c of colunas) {
    const v = mapa.get(`${grupo}|${c.key}`) || 0;
    valores[c.key] = v;
    total += v;
  }
  return { grupo, valores, total };
}

function somaPorColuna(linhas, colunas) {
  const out = {};
  for (const c of colunas) out[c.key] = linhas.reduce((s, l) => s + (l.valores[c.key] || 0), 0);
  return out;
}

// Saldo inicial das contas relevantes: a da conta escolhida, ou a soma de TODAS
// (mesmo universo de montarSaldos - inclusive contas inativas, que ainda têm saldo).
function somaSaldoInicial(contaId) {
  if (contaId) return getConta(contaId)?.saldo_inicial_cents || 0;
  return listContas().reduce((s, c) => s + c.saldo_inicial_cents, 0);
}

// Movimento realizado (receber soma, pagar subtrai) ANTES de `data`, para ancorar o
// "saldo anterior" da primeira coluna da janela. "Todas as contas" só soma o que tem
// conta_id preenchido - mesmo recorte de movimentoPorConta/montarSaldos (um
// lançamento finalizado sem conta não é movimento de NENHUM saldo bancário). As
// linhas de RECEITA/DESPESA da matriz não têm essa exigência (ver
// montarFluxoCaixaMatriz): a classificação por grupo não depende de conta, só o
// saldo bancário depende.
function somaMovimentoAntesDe(data, contaId) {
  let titulos = lancamentosFinalizadosAntesDe(data);
  titulos = contaId ? titulos.filter((l) => l.conta_id === contaId) : titulos.filter((l) => l.conta_id);
  return titulos.reduce((s, l) => s + (l.tipo === "receber" ? liquidoCents(l) : -liquidoCents(l)), 0);
}

export function montarFluxoCaixaMatriz({ view, referencia, contaId } = {}) {
  const colunas = montarColunas(view === "diario" ? "diario" : "mensal", referencia);
  const windowStart = colunas[0].de;
  const windowEnd = colunas[colunas.length - 1].ate;
  const chaveColuna = view === "diario" ? (paidAt) => paidAt : (paidAt) => paidAt.slice(0, 7);

  let titulos = lancamentosPagosNoPeriodo(windowStart, windowEnd);
  if (contaId) titulos = titulos.filter((l) => l.conta_id === contaId);

  const porGrupoColuna = new Map();
  for (const p of classificarPorGrupo(titulos)) {
    const chave = `${p.grupo}|${chaveColuna(p.lancamento.paid_at)}`;
    porGrupoColuna.set(chave, (porGrupoColuna.get(chave) || 0) + p.valor);
  }

  const receitas = GRUPOS_RECEITA.map((g) => linhaDoGrupo(g, colunas, porGrupoColuna));
  const despesas = GRUPOS_DESPESA.map((g) => linhaDoGrupo(g, colunas, porGrupoColuna));
  // Transferências ficam de fora do mapa classificado de propósito - sempre zero.
  const transferencias = GRUPOS_TRANSFERENCIA.map((g) => linhaDoGrupo(g, colunas, new Map()));

  const totalReceitas = somaPorColuna(receitas, colunas);
  const totalDespesas = somaPorColuna(despesas, colunas);

  let saldoAcumulado = somaSaldoInicial(contaId) + somaMovimentoAntesDe(windowStart, contaId);
  const resumo = { geracaoCaixa: {}, saldoAnterior: {}, saldoFinal: {} };
  for (const c of colunas) {
    const geracao = (totalReceitas[c.key] || 0) - (totalDespesas[c.key] || 0);
    resumo.geracaoCaixa[c.key] = geracao;
    resumo.saldoAnterior[c.key] = saldoAcumulado;
    saldoAcumulado += geracao;
    resumo.saldoFinal[c.key] = saldoAcumulado;
  }

  return {
    view: view === "diario" ? "diario" : "mensal",
    referencia,
    contaId: contaId || null,
    // de/ate viajam junto (não só key/label) para o cliente poder pedir o drill-down
    // de uma célula (listarLancamentosDoGrupo) sem recalcular os limites do período.
    colunas,
    receitas,
    despesas,
    transferencias,
    totalReceitas,
    totalDespesas,
    resumo,
  };
}

// Drill-down de uma célula: os lançamentos (ou fatias de rateio) que compõem o
// grupo+período clicado. Mesma classificação de montarFluxoCaixaMatriz (
// classificarPorGrupo), então a soma das linhas devolvidas aqui sempre fecha com o
// valor da célula que a pessoa clicou.
export function listarLancamentosDoGrupo({ grupo, de, ate, contaId }) {
  let titulos = lancamentosPagosNoPeriodo(de, ate);
  if (contaId) titulos = titulos.filter((l) => l.conta_id === contaId);
  const contas = new Map(listContas().map((c) => [c.id, c.nome]));
  return classificarPorGrupo(titulos)
    .filter((p) => p.grupo === grupo)
    .map((p) => ({
      id: p.lancamento.id,
      numero: p.lancamento.numero,
      descricao: p.lancamento.descricao,
      contraparte: p.lancamento.contraparte,
      data: p.lancamento.paid_at,
      contaNome: p.lancamento.conta_id ? contas.get(p.lancamento.conta_id) || "" : "",
      valorCents: p.valor,
    }))
    .sort((a, b) => (a.data || "").localeCompare(b.data || ""));
}
