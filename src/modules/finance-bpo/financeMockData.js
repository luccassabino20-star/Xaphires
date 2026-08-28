// Dados simulados do módulo "Xaphires Finance & BPO" - sem nenhuma chamada
// de rede: tudo gerado aqui, na carga do módulo. Nada disto lê ou grava no
// financeiro de verdade (server/modules/financeiro) - ver o comentário no
// topo de XaphiresFinanceView.jsx sobre por que este módulo não reaproveita
// aquele.

export function formatBRL(value) {
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export function formatBRLShort(value) {
  const abs = Math.abs(value);
  const sinal = value < 0 ? "-" : "";
  if (abs >= 1_000_000) return `${sinal}R$ ${(abs / 1_000_000).toFixed(1).replace(".", ",")}M`;
  if (abs >= 1_000) return `${sinal}R$ ${(abs / 1_000).toFixed(1).replace(".", ",")}K`;
  return formatBRL(value);
}

export const BANKS = [
  { id: "itau", nome: "Itaú", cor: "#FF6600", saldo: 284_320.55 },
  { id: "bradesco", nome: "Bradesco", cor: "#CC092F", saldo: 156_780.10 },
  { id: "santander", nome: "Santander", cor: "#EC0000", saldo: 92_450.00 },
  { id: "nubank", nome: "Nubank", cor: "#820AD1", saldo: 61_275.40 },
  { id: "inter", nome: "Inter", cor: "#FF7A00", saldo: 38_940.25 },
];

export const COST_CENTERS = [
  { id: "obra-x", nome: "Obra X", tipo: "Obra" },
  { id: "obra-y", nome: "Obra Y", tipo: "Obra" },
  { id: "matriz", nome: "Matriz", tipo: "Administrativo" },
  { id: "filial-1", nome: "Filial 1", tipo: "Unidade" },
];

export const CATEGORIAS_ENTRADA = ["Medição de obra", "Venda de serviço", "Adiantamento de cliente", "Reembolso"];
export const CATEGORIAS_SAIDA = ["Folha de pagamento", "Materiais", "Fornecedor", "Impostos", "Aluguel", "Combustível"];

// Parâmetros editáveis em Fórmulas & Métricas (FinanceFormulasMetricas.jsx) -
// só o que muda um cálculo de verdade em algum lugar (dreWaterfall,
// buildKpis em FinanceCentralExecutiva.jsx, a meta de margem em
// FinanceObrasContas.jsx), nada de campo decorativo que não afeta nada.
export const DEFAULT_FORMULAS = {
  // Runway = saldo ÷ queima média diária. Quantos dias olhar pra trás pra
  // calcular essa média - mais dias suaviza picos, menos dias reage mais
  // rápido a uma mudança recente de ritmo de gasto.
  runwayJanelaDias: 30,
  // Categorias de saída fora de "Impostos" (que já sai antes, no Lucro
  // Bruto) que NÃO devem contar como Custos Operacionais na cascata do DRE -
  // ex.: tirar "Folha de pagamento" pra ver o DRE só com custo variável.
  custosOperacionaisExcluir: [],
  // "EBITDA/Lucro Líquido" é hoje um card só. Ligado, o card soma os
  // impostos de volta ao Lucro Líquido (aproximação de EBITDA, que por
  // definição é antes de impostos); desligado, mostra o Lucro Líquido de
  // verdade, depois de impostos.
  ebitdaExcluirImpostos: false,
  // Meta de margem usada só como referência visual na tabela de Obras &
  // Contas (badge verde acima da meta, vermelho abaixo).
  margemMetaPct: 20,
  // Métricas customizadas do construtor DAX/Power Query (ver
  // FinanceFormulasMetricas.jsx e formulaEngine.js). Cada item:
  // { id, nome, formato, expressao, exibirCard, substituirSlot }.
  // `substituirSlot` é "novo" (card extra ao final) ou o id de um dos 4
  // slots fixos da Central Executiva ("receita"|"segundo"|"impostos"|
  // "runway") - nesse caso o card padrão daquele slot é trocado pelo
  // customizado em vez de só somar mais um card.
  metricas: [],
  // Regras de categorização condicional (estilo coluna calculada do Power
  // Query) - ver aplicarRegrasCategorizacao abaixo. Cada item:
  // { id, campo, operador, valor, logica, campo2, operador2, valor2, resultado }.
  regrasCategorizacao: [],
};

// Gerador determinístico (seed simples) - o protótipo precisa parecer o
// mesmo a cada carga, senão comparar antes/depois de um filtro vira loteria.
function seededRandom(seed) {
  let s = seed;
  return () => {
    s = (s * 9301 + 49297) % 233280;
    return s / 233280;
  };
}
const rand = seededRandom(42);

function gerarTransacoes() {
  const lista = [];
  let id = 1;
  const hoje = new Date();
  for (let diasAtras = 0; diasAtras < 90; diasAtras++) {
    const qtdNoDia = Math.floor(rand() * 3);
    for (let i = 0; i < qtdNoDia; i++) {
      const data = new Date(hoje);
      data.setDate(data.getDate() - diasAtras);
      const tipo = rand() > 0.45 ? "saida" : "entrada";
      const banco = BANKS[Math.floor(rand() * BANKS.length)];
      const centro = COST_CENTERS[Math.floor(rand() * COST_CENTERS.length)];
      const categoria =
        tipo === "entrada"
          ? CATEGORIAS_ENTRADA[Math.floor(rand() * CATEGORIAS_ENTRADA.length)]
          : CATEGORIAS_SAIDA[Math.floor(rand() * CATEGORIAS_SAIDA.length)];
      const valor = Math.round((tipo === "entrada" ? 800 + rand() * 12000 : 200 + rand() * 6000) * 100) / 100;
      lista.push({
        id: id++,
        data: data.toISOString().slice(0, 10),
        descricao: `${categoria} · ${centro.nome}`,
        bancoId: banco.id,
        centroId: centro.id,
        tipo,
        categoria,
        valor,
        // ~65% já concilia sozinho (mesmo valor bate num documento importado) -
        // o resto fica pendente pra seção 5 ter o que mostrar.
        conciliado: rand() > 0.35,
      });
    }
  }
  return lista.sort((a, b) => (a.data < b.data ? 1 : -1));
}
export const TRANSACOES = gerarTransacoes();

// Notas/documentos "lidos" - valores batendo com uma fração das transações
// acima, pra "Conciliar" ter alguma correspondência real de exibir.
const TIPOS_DOC = ["NFe", "NFSe", "NFCe"];
export const DOCUMENTOS = TRANSACOES.filter((t) => t.tipo === "saida" && !t.conciliado)
  .slice(0, 14)
  .map((t, i) => {
    const bruto = Math.round(t.valor * (1 + rand() * 0.18) * 100) / 100;
    const iss = t.categoria === "Fornecedor" ? Math.round(bruto * 0.02 * 100) / 100 : 0;
    const pis = Math.round(bruto * 0.0065 * 100) / 100;
    const cofins = Math.round(bruto * 0.03 * 100) / 100;
    const irrf = Math.round(bruto * 0.015 * 100) / 100;
    const csll = Math.round(bruto * 0.01 * 100) / 100;
    const icms = t.categoria === "Materiais" ? Math.round(bruto * 0.12 * 100) / 100 : 0;
    const totalImpostos = iss + pis + cofins + irrf + csll + icms;
    return {
      id: `doc-${i + 1}`,
      tipo: TIPOS_DOC[i % TIPOS_DOC.length],
      numero: String(100000 + i * 37),
      chave: Array.from({ length: 44 }, () => Math.floor(rand() * 10)).join(""),
      cnpj: `${String(10 + i).padStart(2, "0")}.${String(200 + i * 7).padStart(3, "0")}.${String(300 + i * 3).padStart(
        3,
        "0"
      )}/0001-${String(10 + i).padStart(2, "0")}`,
      razaoSocial: `${["Constrular Materiais", "Ferragens Bom Preço", "Elétrica Central", "Concreto Norte", "Transportes Aliança"][i % 5]} Ltda`,
      valorBruto: bruto,
      valorLiquido: Math.round((bruto - totalImpostos) * 100) / 100,
      impostos: { ISS: iss, PIS: pis, COFINS: cofins, IRRF: irrf, CSLL: csll, ICMS: icms },
      vencimento: t.data,
      candidatoId: t.id,
      centroId: t.centroId,
      status: "pendente",
    };
  });

// ---------- Derivados (calculados a partir das transações, não fixos) ----------

export function filtrarTransacoes(transacoes, { bancoId, centroId, periodo }) {
  const hoje = new Date();
  let desde = new Date(0);
  if (periodo === "hoje") {
    desde = new Date(hoje);
    desde.setHours(0, 0, 0, 0);
  } else if (periodo === "mes") {
    desde = new Date(hoje.getFullYear(), hoje.getMonth(), 1);
  } else if (periodo === "trimestre") {
    desde = new Date(hoje.getFullYear(), hoje.getMonth() - 3, hoje.getDate());
  }
  return transacoes.filter((t) => {
    if (bancoId && t.bancoId !== bancoId) return false;
    if (centroId && t.centroId !== centroId) return false;
    if (periodo && periodo !== "todos" && new Date(t.data) < desde) return false;
    return true;
  });
}

export function resumoPorCentro(transacoes) {
  return COST_CENTERS.map((c) => {
    const doCentro = transacoes.filter((t) => t.centroId === c.id);
    const entradas = doCentro.filter((t) => t.tipo === "entrada").reduce((s, t) => s + t.valor, 0);
    const saidas = doCentro.filter((t) => t.tipo === "saida").reduce((s, t) => s + t.valor, 0);
    const resultado = entradas - saidas;
    const margem = entradas > 0 ? (resultado / entradas) * 100 : 0;
    return { ...c, entradas, saidas, resultado, margem };
  });
}

export function fluxoMensal(transacoes) {
  const porMes = new Map();
  transacoes.forEach((t) => {
    const chave = t.data.slice(0, 7);
    if (!porMes.has(chave)) porMes.set(chave, { mes: chave, entradas: 0, saidas: 0 });
    const bucket = porMes.get(chave);
    if (t.tipo === "entrada") bucket.entradas += t.valor;
    else bucket.saidas += t.valor;
  });
  return [...porMes.values()].sort((a, b) => (a.mes > b.mes ? 1 : -1));
}

// Projeção simples: média diária dos últimos N dias (janelaMediaDias -
// editável em Fórmulas & Métricas como "runwayJanelaDias", reaproveitada
// aqui porque é a mesma pergunta - "qual o ritmo recente de caixa") de
// entradas/saídas, estendida pra frente - deixa claro que é projeção (linha
// tracejada no gráfico), não é IA nem machine learning, só uma extrapolação
// de médias.
export function projecaoSaldo(transacoes, saldoAtual, dias = 90, janelaMediaDias = 30) {
  const recentes = transacoes.filter((t) => {
    const diff = (Date.now() - new Date(t.data).getTime()) / 86_400_000;
    return diff <= janelaMediaDias;
  });
  const entradaMediaDia = recentes.filter((t) => t.tipo === "entrada").reduce((s, t) => s + t.valor, 0) / janelaMediaDias;
  const saidaMediaDia = recentes.filter((t) => t.tipo === "saida").reduce((s, t) => s + t.valor, 0) / janelaMediaDias;
  const pontos = [];
  let saldo = saldoAtual;
  for (let d = 0; d <= dias; d += 1) {
    if (d > 0) saldo += entradaMediaDia - saidaMediaDia;
    if (d % 5 === 0) pontos.push({ dia: d, saldo });
  }
  return { pontos, entradaMediaDia, saidaMediaDia };
}

export function composicaoTributaria(documentos = DOCUMENTOS) {
  const totais = { ISS: 0, PIS: 0, COFINS: 0, IRRF: 0, CSLL: 0, ICMS: 0 };
  documentos.forEach((d) => {
    Object.keys(totais).forEach((k) => {
      totais[k] += d.impostos[k];
    });
  });
  return Object.entries(totais)
    .map(([nome, total]) => ({ nome, total }))
    .filter((x) => x.total > 0);
}

// Passos do DRE em cascata - cada "type" decide a cor/direção na waterfall.
// totalImpostos vem de fora (calculado uma vez em FinanceCentralExecutiva a
// partir dos documentos já filtrados por centro de custo) em vez de
// recalculado aqui com composicaoTributaria() sem argumento - senão o passo
// "Deduções/Impostos" ignoraria o filtro de centro/banco enquanto o resto da
// cascata respeita, e clicar numa obra pararia de "filtrar tudo" de verdade.
// formulas.custosOperacionaisExcluir (editável em Fórmulas & Métricas) tira
// categorias específicas da conta de Custos Operacionais.
export function dreWaterfall(transacoes, totalImpostos, formulas = DEFAULT_FORMULAS) {
  const receitaBruta = transacoes.filter((t) => t.tipo === "entrada").reduce((s, t) => s + t.valor, 0);
  const impostos = totalImpostos ?? 0;
  const lucroBruto = receitaBruta - impostos;
  const excluidas = formulas.custosOperacionaisExcluir || [];
  const custosOperacionais = transacoes
    .filter((t) => t.tipo === "saida" && t.categoria !== "Impostos" && !excluidas.includes(t.categoria))
    .reduce((s, t) => s + t.valor, 0);
  const lucroLiquido = lucroBruto - custosOperacionais;
  return [
    { label: "Receita Bruta", valor: receitaBruta, tipo: "total" },
    { label: "Deduções / Impostos", valor: -impostos, tipo: "queda" },
    { label: "Lucro Bruto", valor: lucroBruto, tipo: "subtotal" },
    { label: "Custos Operacionais", valor: -custosOperacionais, tipo: "queda" },
    { label: "Lucro Líquido", valor: lucroLiquido, tipo: "total" },
  ];
}

// Mapa de variáveis que o construtor de métricas customizadas (formulaEngine.js)
// enxerga como [Nome] dentro de uma fórmula - os mesmos valores que já
// alimentam os 4 KPIs padrão e o DRE em cascata, pra uma métrica nova poder
// referenciar exatamente o que a Central Executiva já calculou, sem uma
// segunda fonte de verdade. `waterfall` é o array de dreWaterfall() (índices
// fixos: 0 Receita Bruta, 2 Lucro Bruto, 3 -Custos Operacionais, 4 Lucro
// Líquido - ver o comentário de dreWaterfall).
export function montarVariaveisFormula(waterfall, totalImpostos, saldoConsolidado) {
  const hoje = new Date();
  return {
    "Receita Bruta": waterfall?.[0]?.valor ?? 0,
    "Lucro Bruto": waterfall?.[2]?.valor ?? 0,
    "Custos Operacionais": Math.abs(waterfall?.[3]?.valor ?? 0),
    "Lucro Líquido": waterfall?.[4]?.valor ?? 0,
    "Impostos Total": totalImpostos ?? 0,
    "Saldo Bancos": saldoConsolidado ?? 0,
    "Dias do Mês": new Date(hoje.getFullYear(), hoje.getMonth() + 1, 0).getDate(),
  };
}

// ---------- Categorização condicional (Power Query) ----------
// Campos de transação que uma regra pode testar, com o tipo de comparação
// que cada um aceita - "lista" desenha um <select> com as opções reais do
// módulo em vez de um texto livre que erraria o id na maior parte das vezes
// (ex.: "Obra X" != "obra-x").
export const CAMPOS_REGRA = [
  { id: "centroId", label: "Centro de Custo", tipo: "lista", opcoes: COST_CENTERS.map((c) => ({ id: c.id, label: c.nome })) },
  { id: "bancoId", label: "Banco", tipo: "lista", opcoes: BANKS.map((b) => ({ id: b.id, label: b.nome })) },
  {
    id: "tipo",
    label: "Tipo",
    tipo: "lista",
    opcoes: [
      { id: "entrada", label: "Entrada" },
      { id: "saida", label: "Saída" },
    ],
  },
  { id: "categoria", label: "Categoria", tipo: "lista", opcoes: [...CATEGORIAS_ENTRADA, ...CATEGORIAS_SAIDA].map((c) => ({ id: c, label: c })) },
  { id: "valor", label: "Valor", tipo: "numero" },
];

export const OPERADORES_REGRA = [
  { id: "==", label: "é igual a" },
  { id: "!=", label: "é diferente de" },
  { id: ">", label: "é maior que" },
  { id: "<", label: "é menor que" },
  { id: ">=", label: "é maior ou igual a" },
  { id: "<=", label: "é menor ou igual a" },
];

function testarCondicao(transacao, campoId, operador, valorComparado) {
  const campo = CAMPOS_REGRA.find((c) => c.id === campoId);
  const atual = transacao[campoId];
  const numerico = campo?.tipo === "numero";
  const a = numerico ? Number(atual) : String(atual ?? "");
  const b = numerico ? Number(valorComparado) : String(valorComparado ?? "");
  switch (operador) {
    case "==":
      return a === b;
    case "!=":
      return a !== b;
    case ">":
      return a > b;
    case "<":
      return a < b;
    case ">=":
      return a >= b;
    case "<=":
      return a <= b;
    default:
      return false;
  }
}

// Aplica a lista de regras a cada transação e devolve um Map id-da-transação
// -> [rótulos que bateram]. Uma transação pode acumular mais de um rótulo
// (regras não são mutuamente exclusivas de propósito - "Alerta de Custo
// Alto" e "Sem centro definido" podem valer ao mesmo tempo). `logica`
// decide se a segunda condição (quando existe) é "E" ou "OU" com a primeira.
export function aplicarRegrasCategorizacao(transacoes, regras) {
  const resultado = new Map();
  if (!regras || regras.length === 0) return resultado;
  transacoes.forEach((t) => {
    const rotulos = [];
    regras.forEach((r) => {
      let bate = testarCondicao(t, r.campo, r.operador, r.valor);
      if (bate && r.campo2) {
        const segunda = testarCondicao(t, r.campo2, r.operador2, r.valor2);
        bate = r.logica === "OU" ? bate || segunda : bate && segunda;
      }
      if (bate) rotulos.push(r.resultado);
    });
    if (rotulos.length > 0) resultado.set(t.id, rotulos);
  });
  return resultado;
}

// Série curta (14 pontos) só pra desenhar a sparkline dos KPIs - não precisa
// bater com o valor do card, é só a "forma" da tendência.
export function serieTendencia(base, volatilidade = 0.12) {
  const pontos = [];
  let v = base;
  for (let i = 0; i < 14; i++) {
    v = v * (1 + (rand() - 0.48) * volatilidade);
    pontos.push(Math.max(0, v));
  }
  return pontos;
}
