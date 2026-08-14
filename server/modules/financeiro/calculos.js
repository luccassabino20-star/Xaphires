// Fonte ÚNICA dos números do Financeiro. O fluxo de caixa e o DRE saem daqui, e
// só daqui - o cliente desenha o que estas funções devolvem, nunca reconta.
// Mesma lição do reports/dados.js: uma segunda definição de "o que conta" faz as
// telas discordarem entre si sobre os mesmos lançamentos.
//
// Regime de CAIXA nesta fase: realizado é o que foi baixado (status
// 'finalizado'), datado pela baixa (paid_at). O regime de competência (pelo
// vencimento) fica anotado como evolução - hoje fluxo e DRE contam a mesma
// história para não confundir.
import { lancamentosDoAno, lancamentosPagosNoPeriodo, getCategoria, listContas, movimentoPorConta, liquidoCents, getConta, finalizadosDaConta, estornadosDaConta, apropriacoesDeVarios } from "./repo.js";

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
