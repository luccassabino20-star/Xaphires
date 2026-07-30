import { nomeDoStatus } from "./labels.js";

// Gerador do CSV. Como o Excel e o PDF, só desenha o que `dados.js` já decidiu -
// nenhuma regra de negócio mora aqui, nem o que é "concluído".
//
// O alvo declarado é abrir no Excel com dois cliques, e isso manda em três escolhas
// que num CSV "de manual" seriam outras:
//
// 1. Separador ponto e vírgula. O Excel de máquina configurada em pt-BR/es-ES lê a
//    vírgula como separador decimal, e um arquivo separado por vírgula cai todo na
//    coluna A. Ponto e vírgula é o que essas instalações esperam.
// 2. BOM UTF-8 no início. Sem ele o Excel abre o arquivo como ANSI e "Concluído"
//    vira "ConcluÃ­do". É o motivo de o BOM estar aqui e não no navegador.
// 3. Fim de linha CRLF, que é o que o RFC 4180 pede e o que o Excel antigo entende.

const BOM = "﻿";
const SEP = ";";
const EOL = "\r\n";

// Uma fórmula do Excel começa por um destes. Um cartão intitulado
// `=HYPERLINK("http://...")` viraria fórmula ativa na planilha de quem abrisse o
// relatório - é a injeção de fórmula em CSV, e o dado aqui é texto digitado por
// usuário. Neutralizar é prefixar com apóstrofo: o Excel passa a tratar a célula
// como texto e o apóstrofo não aparece na tela.
const GATILHO_DE_FORMULA = /^[=+\-@\t\r]/;

function celula(valor) {
  let texto = valor === null || valor === undefined ? "" : String(valor);
  if (GATILHO_DE_FORMULA.test(texto)) texto = `'${texto}`;
  // Aspas, separador e quebra de linha obrigam a citar o campo; dentro do campo
  // citado, a aspa dobra. Descrição de cartão tem quebra de linha com frequência,
  // então este caminho não é exceção rara.
  if (texto.includes('"') || texto.includes(SEP) || texto.includes("\n") || texto.includes("\r")) {
    return `"${texto.replace(/"/g, '""')}"`;
  }
  return texto;
}

function linha(campos) {
  return campos.map(celula).join(SEP);
}

// `due` é data civil YYYY-MM-DD e é fatiado como string, sem passar por Date: o
// construtor lê a forma só-data como UTC e devolve o dia anterior a oeste de
// Greenwich, que é exatamente onde este produto roda.
function dataCivil(valor, idioma) {
  if (!valor) return "";
  const [ano, mes, dia] = String(valor).slice(0, 10).split("-");
  if (!ano || !mes || !dia) return "";
  return idioma === "en" ? `${mes}/${dia}/${ano}` : `${dia}/${mes}/${ano}`;
}

// Timestamp ISO (criação e conclusão) sai com hora, no fuso local do servidor - o
// mesmo relógio em que a recorrência e o resto do produto raciocinam.
function dataHora(valor, idioma) {
  if (!valor) return "";
  const d = new Date(valor);
  if (Number.isNaN(d.getTime())) return "";
  const p = (n) => String(n).padStart(2, "0");
  const civil =
    idioma === "en"
      ? `${p(d.getMonth() + 1)}/${p(d.getDate())}/${d.getFullYear()}`
      : `${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()}`;
  return `${civil} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

/**
 * Devolve um Buffer, e não uma string, para a rota poder mandar Content-Length em
 * bytes. Com acento, `texto.length` conta caracteres e erra o tamanho em UTF-8 -
 * o download chegaria truncado.
 */
export function gerarCsv(relatorio) {
  const { t, idioma } = relatorio;
  const linhas = [];

  // As nove colunas pedidas, nesta ordem. O cabeçalho vem traduzido porque o
  // arquivo segue o idioma escolhido na exportação, como o Excel e o PDF.
  linhas.push(
    linha([
      t.colId,
      t.colTitulo,
      t.colDescricao,
      t.colResponsaveis,
      t.colColuna,
      t.colSituacao,
      t.colCriacao,
      t.colConclusao,
      t.colPrazo,
    ])
  );

  // Percorre as seções (uma por responsável) e não a lista achatada: é assim que o
  // Excel e o PDF percorrem, e é o que garante que os três arquivos tragam
  // exatamente as mesmas linhas para o mesmo filtro.
  //
  // Um cartão com dois responsáveis aparece uma vez em cada seção, e é intencional:
  // filtrando por pessoa, some-lo da segunda seria esconder trabalho atribuído a
  // ela. A coluna de responsável traz todos, para a duplicata ser explicável a quem
  // abrir a planilha.
  for (const secao of relatorio.secoes) {
    for (const c of secao.cartoes) {
      linhas.push(
        linha([
          c.id,
          c.titulo,
          c.descricao,
          c.responsaveis.length ? c.responsaveis.join(", ") : t.semResponsavel,
          c.coluna,
          // Binário de propósito, só concluído ou aberto. O atrasado continua
          // aberto e não ganha um terceiro valor aqui: quem abre o CSV filtra e
          // faz tabela dinâmica por esta coluna, e um "Atrasada" no meio quebraria
          // a soma em duas categorias. O atraso é derivável do prazo, que está na
          // coluna ao lado - e o PDF e o Excel continuam destacando-o.
          c.completed ? t.feito : t.aFazer,
          dataHora(c.criadoEm, idioma),
          dataHora(c.completedAt, idioma),
          dataCivil(c.due, idioma),
        ])
      );
    }
  }

  // Arquivo sem nenhum cartão sai com o cabeçalho e uma linha dizendo isso, em vez
  // de um arquivo de zero byte que parece download quebrado.
  if (linhas.length === 1) linhas.push(linha([t.semTarefas]));

  // Duas linhas de rodapé com os filtros usados. Relatório exportado circula solto
  // por e-mail, e sem isso ninguém sabe se a planilha é do time todo ou de uma
  // pessoa só, nem de quando ela é.
  linhas.push("");
  linhas.push(linha([t.escopo, relatorio.escopo]));
  linhas.push(linha([t.responsavel, relatorio.membroEscolhido || t.todosOsResponsaveis]));
  linhas.push(linha([t.status, nomeDoStatus(t, relatorio.status)]));
  linhas.push(linha([t.geradoEm, dataHora(relatorio.geradoEm, idioma)]));

  return Buffer.from(BOM + linhas.join(EOL) + EOL, "utf8");
}
