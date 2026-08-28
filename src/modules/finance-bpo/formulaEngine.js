// Motor de fórmulas do construtor de métricas (Fórmulas & Métricas) - um
// parser/avaliador de verdade (tokenizer + descida recursiva), não eval()/
// new Function() em cima do que a pessoa digitou. Sem isso não dá pra
// devolver erro de sintaxe específico ("parêntese sem fechar", "variável
// desconhecida", "divisão por zero") como o pedido descreve - eval() só
// devolve "SyntaxError" genérico do JS, ou pior, deixaria passar qualquer
// expressão JS válida (não só aritmética) sem ninguém pedir isso.
//
// Gramática (precedência padrão, à mão):
//   expressao := termo (('+'|'-') termo)*
//   termo     := fator (('*'|'/') fator)*
//   fator     := numero | variavel | '(' expressao ')' | funcao | '-' fator
//   funcao    := ('SUM'|'AVG') '(' expressao (',' expressao)* ')'
//   variavel  := '[' texto-ate-fechar-colchete ']'

const CAMPOS_SIMBOLO = /[+\-*/(),]/;

function tokenizar(expressao) {
  const tokens = [];
  let i = 0;
  const n = expressao.length;
  while (i < n) {
    const c = expressao[i];
    if (/\s/.test(c)) {
      i++;
      continue;
    }
    if (c === "[") {
      const fim = expressao.indexOf("]", i);
      if (fim === -1) throw new ErroFormula(`Colchete "[" sem fechar (posição ${i + 1})`);
      const nome = expressao.slice(i + 1, fim).trim();
      if (!nome) throw new ErroFormula(`Variável vazia "[]" (posição ${i + 1})`);
      tokens.push({ tipo: "VAR", nome });
      i = fim + 1;
      continue;
    }
    if (/[0-9.]/.test(c)) {
      let j = i;
      let pontos = 0;
      while (j < n && /[0-9.]/.test(expressao[j])) {
        if (expressao[j] === ".") pontos++;
        j++;
      }
      if (pontos > 1) throw new ErroFormula(`Número inválido perto da posição ${i + 1}`);
      tokens.push({ tipo: "NUM", valor: Number(expressao.slice(i, j)) });
      i = j;
      continue;
    }
    if (/[A-Za-z]/.test(c)) {
      let j = i;
      while (j < n && /[A-Za-z]/.test(expressao[j])) j++;
      const palavra = expressao.slice(i, j).toUpperCase();
      if (palavra !== "SUM" && palavra !== "AVG") {
        throw new ErroFormula(`Função desconhecida "${expressao.slice(i, j)}" (use SUM ou AVG)`);
      }
      tokens.push({ tipo: "FUNC", nome: palavra });
      i = j;
      continue;
    }
    if (CAMPOS_SIMBOLO.test(c)) {
      const tipoPorSimbolo = { "+": "MAIS", "-": "MENOS", "*": "VEZES", "/": "DIV", "(": "ABRE", ")": "FECHA", ",": "VIRGULA" };
      tokens.push({ tipo: tipoPorSimbolo[c] });
      i++;
      continue;
    }
    throw new ErroFormula(`Caractere inesperado "${c}" (posição ${i + 1})`);
  }
  return tokens;
}

class ErroFormula extends Error {}

class Parser {
  constructor(tokens, variaveis) {
    this.tokens = tokens;
    this.pos = 0;
    this.variaveis = variaveis;
  }
  olhar() {
    return this.tokens[this.pos];
  }
  consumir(tipoEsperado) {
    const t = this.tokens[this.pos];
    if (!t || t.tipo !== tipoEsperado) {
      throw new ErroFormula(
        t ? `Esperava "${tipoEsperado}", achei "${t.tipo}"` : `Fórmula termina de forma inesperada (esperava "${tipoEsperado}")`
      );
    }
    this.pos++;
    return t;
  }
  expressao() {
    let valor = this.termo();
    while (this.olhar() && (this.olhar().tipo === "MAIS" || this.olhar().tipo === "MENOS")) {
      const op = this.consumir(this.olhar().tipo);
      const direita = this.termo();
      valor = op.tipo === "MAIS" ? valor + direita : valor - direita;
    }
    return valor;
  }
  termo() {
    let valor = this.fator();
    while (this.olhar() && (this.olhar().tipo === "VEZES" || this.olhar().tipo === "DIV")) {
      const opTipo = this.olhar().tipo;
      this.consumir(opTipo);
      const direita = this.fator();
      if (opTipo === "DIV") {
        if (direita === 0) throw new ErroFormula("Divisão por zero");
        valor = valor / direita;
      } else {
        valor = valor * direita;
      }
    }
    return valor;
  }
  fator() {
    const t = this.olhar();
    if (!t) throw new ErroFormula("Fórmula incompleta");
    if (t.tipo === "MENOS") {
      this.consumir("MENOS");
      return -this.fator();
    }
    if (t.tipo === "NUM") {
      this.consumir("NUM");
      return t.valor;
    }
    if (t.tipo === "VAR") {
      this.consumir("VAR");
      if (!(t.nome in this.variaveis)) {
        throw new ErroFormula(`Variável desconhecida "[${t.nome}]"`);
      }
      return this.variaveis[t.nome];
    }
    if (t.tipo === "ABRE") {
      this.consumir("ABRE");
      const valor = this.expressao();
      if (!this.olhar() || this.olhar().tipo !== "FECHA") throw new ErroFormula('Parêntese "(" sem fechar');
      this.consumir("FECHA");
      return valor;
    }
    if (t.tipo === "FUNC") {
      this.consumir("FUNC");
      if (!this.olhar() || this.olhar().tipo !== "ABRE") throw new ErroFormula(`Esperava "(" depois de ${t.nome}`);
      this.consumir("ABRE");
      const args = [this.expressao()];
      while (this.olhar() && this.olhar().tipo === "VIRGULA") {
        this.consumir("VIRGULA");
        args.push(this.expressao());
      }
      if (!this.olhar() || this.olhar().tipo !== "FECHA") throw new ErroFormula(`Parêntese de ${t.nome}(...) sem fechar`);
      this.consumir("FECHA");
      if (t.nome === "SUM") return args.reduce((s, v) => s + v, 0);
      return args.reduce((s, v) => s + v, 0) / args.length; // AVG
    }
    throw new ErroFormula(`Token inesperado "${t.tipo}"`);
  }
}

// Avalia `expressao` (string digitada pela pessoa) contra `variaveis` (mapa
// nome -> número atual, ver VARIAVEIS_DISPONIVEIS/valoresVariaveis em
// FinanceFormulasMetricas.jsx). Nunca lança - devolve sempre
// { ok, valor, erro }, pensado pra alimentar direto o indicador "Fórmula
// Válida ✅ / Erro de sintaxe ⚠️" sem try/catch espalhado pela UI.
export function avaliarFormula(expressao, variaveis) {
  const texto = (expressao || "").trim();
  if (!texto) return { ok: false, valor: null, erro: "Digite uma fórmula" };
  try {
    const tokens = tokenizar(texto);
    if (tokens.length === 0) return { ok: false, valor: null, erro: "Digite uma fórmula" };
    const parser = new Parser(tokens, variaveis);
    const valor = parser.expressao();
    if (parser.pos < tokens.length) {
      throw new ErroFormula(`Sobrou texto depois do fim da expressão (perto de "${JSON.stringify(parser.olhar())}")`);
    }
    if (!Number.isFinite(valor)) throw new ErroFormula("Resultado não é um número válido");
    return { ok: true, valor, erro: null };
  } catch (err) {
    return { ok: false, valor: null, erro: err instanceof ErroFormula ? err.message : "Erro de sintaxe" };
  }
}

// Catálogo de variáveis que o construtor oferece como botão clicável -
// nome exibido = a chave usada em [Chave] dentro da expressão. O valor de
// cada uma é calculado por quem chama avaliarFormula (ver valoresVariaveis
// em FinanceFormulasMetricas.jsx/FinanceCentralExecutiva.jsx), não aqui -
// este módulo não sabe nada sobre transações/DRE de propósito, só sobre
// como ler uma expressão.
export const VARIAVEIS_DISPONIVEIS = [
  "Receita Bruta",
  "Lucro Bruto",
  "Custos Operacionais",
  "Lucro Líquido",
  "Impostos Total",
  "Saldo Bancos",
  "Dias do Mês",
];

export const OPERADORES_RAPIDOS = ["+", "-", "*", "/", "(", ")"];
export const FUNCOES_RAPIDAS = ["SUM(", "AVG("];

export const FORMATOS_METRICA = [
  { id: "moeda", label: "Moeda (R$)" },
  { id: "percentual", label: "Percentual (%)" },
  { id: "inteiro", label: "Número Inteiro" },
  { id: "dias", label: "Dias" },
];

export function formatarValorMetrica(valor, formato) {
  if (valor == null || !Number.isFinite(valor)) return "—";
  if (formato === "percentual") return `${valor.toFixed(1)}%`;
  if (formato === "inteiro") return Math.round(valor).toLocaleString("pt-BR");
  if (formato === "dias") return `${Math.round(valor)} dias`;
  return valor.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}
