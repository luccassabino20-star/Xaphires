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

const CATEGORIAS_ENTRADA = ["Medição de obra", "Venda de serviço", "Adiantamento de cliente", "Reembolso"];
const CATEGORIAS_SAIDA = ["Folha de pagamento", "Materiais", "Fornecedor", "Impostos", "Aluguel", "Combustível"];

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

// Projeção simples: média diária dos últimos 30 dias de entradas/saídas,
// estendida pra frente - deixa claro que é projeção (linha tracejada no
// gráfico), não é IA nem machine learning, só uma extrapolação de médias.
export function projecaoSaldo(transacoes, saldoAtual, dias = 90) {
  const ultimos30 = transacoes.filter((t) => {
    const diff = (Date.now() - new Date(t.data).getTime()) / 86_400_000;
    return diff <= 30;
  });
  const entradaMediaDia = ultimos30.filter((t) => t.tipo === "entrada").reduce((s, t) => s + t.valor, 0) / 30;
  const saidaMediaDia = ultimos30.filter((t) => t.tipo === "saida").reduce((s, t) => s + t.valor, 0) / 30;
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
// totalImpostos vem de fora (calculado uma vez em XaphiresFinanceView a
// partir dos documentos já filtrados por centro de custo) em vez de
// recalculado aqui com composicaoTributaria() sem argumento - senão o passo
// "Deduções/Impostos" ignoraria o filtro de centro/banco enquanto o resto da
// cascata respeita, e clicar numa obra pararia de "filtrar tudo" de verdade.
export function dreWaterfall(transacoes, totalImpostos) {
  const receitaBruta = transacoes.filter((t) => t.tipo === "entrada").reduce((s, t) => s + t.valor, 0);
  const impostos = totalImpostos ?? 0;
  const lucroBruto = receitaBruta - impostos;
  const custosOperacionais = transacoes
    .filter((t) => t.tipo === "saida" && t.categoria !== "Impostos")
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
