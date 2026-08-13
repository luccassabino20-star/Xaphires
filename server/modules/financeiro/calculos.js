// Fonte ÚNICA dos números do Financeiro. O fluxo de caixa e o DRE saem daqui, e
// só daqui - o cliente desenha o que estas funções devolvem, nunca reconta.
// Mesma lição do reports/dados.js: uma segunda definição de "o que conta" faz as
// telas discordarem entre si sobre os mesmos lançamentos.
//
// Regime de CAIXA nesta fase: realizado é o que foi baixado (status
// 'finalizado'), datado pela baixa (paid_at). O regime de competência (pelo
// vencimento) fica anotado como evolução - hoje fluxo e DRE contam a mesma
// história para não confundir.
import { lancamentosDoAno, lancamentosPagosNoPeriodo, getCategoria, listContas, movimentoPorConta, liquidoCents } from "./repo.js";

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

// DRE gerencial do período (regime de caixa): agrupa os lançamentos FINALIZADOS por
// categoria. Receita é o que a categoria diz ser receita, e não o tipo do
// lançamento - assim um estorno lançado como 'pagar' numa categoria de receita
// cai no lugar certo. Sem categoria, entra num balde "Sem categoria" para não
// sumir do resultado.
export function montarDRE(de, ate) {
  const receitas = new Map(); // categoryId -> { nome, total }
  const despesas = new Map();
  const SEM = { id: null, nome: null }; // rótulo resolvido no cliente (i18n)

  for (const l of lancamentosPagosNoPeriodo(de, ate)) {
    const cat = l.category_id ? getCategoria(l.category_id) : null;
    const ehReceita = cat ? cat.tipo === "receita" : l.tipo === "receber";
    const alvo = ehReceita ? receitas : despesas;
    const chave = cat ? cat.id : "__sem__";
    const nome = cat ? cat.nome : SEM.nome;
    const linha = alvo.get(chave) || { id: cat ? cat.id : null, nome, total: 0 };
    linha.total += liquidoCents(l); // DRE também pelo líquido, coerente com o caixa
    alvo.set(chave, linha);
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
