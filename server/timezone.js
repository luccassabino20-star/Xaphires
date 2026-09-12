// Fuso FIXO do produto - America/Sao_Paulo, não o fuso do sistema operacional
// onde o Node roda. Ver server/recurrence.js (histórico completo do bug): em
// desenvolvimento isso nunca aparece, porque a máquina do dev já está no
// fuso do Brasil, mas produção roda numa VPS na Europa (CEST, UTC+2) - 5h à
// frente do Brasil. Qualquer "hoje"/"início do dia"/"início do mês" calculado
// com Date "local" (getFullYear/getHours/setHours...) respondia o relógio do
// SERVIDOR, não o de quem usa o produto: a partir das 19h no Brasil, o
// servidor já achava que era o dia seguinte, e "vencido hoje" virava vencido
// 5h antes da meia-noite de verdade.
//
// Brasil aboliu horário de verão em 2019 - America/Sao_Paulo é UTC-3 o ano
// inteiro, sem transição de fuso para tratar. Por isso um deslocamento FIXO
// (sem lib de fuso horário) já resolve, sem precisar de Intl/tabela de DST.
//
// A técnica, usada em toda função abaixo: desloca o instante REAL por este
// offset, e a partir daí só se lê/grava por getters e setters UTC
// (getUTCFullYear, setUTCHours, Date.UTC...) - nunca os locais (getFullYear,
// setHours...), que voltariam a refletir o fuso do servidor.
const OFFSET_HORAS_SP = 3; // America/Sao_Paulo = UTC menos 3 horas

// Desloca um instante REAL (epoch correto) para um Date cujos getters UTC
// devolvem o relógio de parede de São Paulo naquele instante.
export function paraRelogioSP(instanteReal) {
  return new Date(instanteReal.getTime() - OFFSET_HORAS_SP * 60 * 60 * 1000);
}
// Inverso: um relógio de parede de São Paulo (ano/mês/dia/hora) de volta para
// o instante real (epoch correto) - para comparar contra timestamps de
// verdade (created_at, paid_at...) ou gravar como tal. mesIndex é 0-11, como
// no Date nativo. Meses/dias fora da faixa (mesIndex -1, dia 0...) normalizam
// como no Date nativo - útil para "mês anterior" sem checar virada de ano.
export function deRelogioSP(ano, mesIndex, dia, hora = 0, minuto = 0, segundo = 0, ms = 0) {
  return new Date(Date.UTC(ano, mesIndex, dia, hora, minuto, segundo, ms) + OFFSET_HORAS_SP * 60 * 60 * 1000);
}

// "YYYY-MM-DD" do dia civil em São Paulo de um instante real. É o formato que
// `due`/`paid_at` usam em todo o app (data civil, sem hora) - nunca gravar
// timestamp ISO completo nesses campos.
export function hojeCivilSP(instanteReal = new Date()) {
  const sp = paraRelogioSP(instanteReal);
  const y = sp.getUTCFullYear();
  const m = String(sp.getUTCMonth() + 1).padStart(2, "0");
  const d = String(sp.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

// "YYYY-MM-DDTHH:MM:SS" do relógio de São Paulo de um instante real - mesmo
// formato "sem fuso" usado por datas/horas civis gravadas no banco (ex.:
// agendamentos do Xaphires Beauty).
export function isoLocalSP(instanteReal) {
  const sp = paraRelogioSP(instanteReal);
  const p = (n) => String(n).padStart(2, "0");
  return `${hojeCivilSP(instanteReal)}T${p(sp.getUTCHours())}:${p(sp.getUTCMinutes())}:${p(sp.getUTCSeconds())}`;
}

// Início/fim do dia civil de São Paulo que contém `instanteReal`, como
// instantes REAIS (não strings) - dá para comparar direto contra outros
// timestamps ou formatar com isoLocalSP/hojeCivilSP depois.
export function inicioDoDiaSP(instanteReal = new Date()) {
  const sp = paraRelogioSP(instanteReal);
  return deRelogioSP(sp.getUTCFullYear(), sp.getUTCMonth(), sp.getUTCDate());
}
export function fimDoDiaSP(instanteReal = new Date()) {
  const sp = paraRelogioSP(instanteReal);
  return deRelogioSP(sp.getUTCFullYear(), sp.getUTCMonth(), sp.getUTCDate(), 23, 59, 59, 999);
}
// Segunda-feira como início de semana (mesma convenção da Agenda/Planejador).
export function inicioDaSemanaSP(instanteReal = new Date()) {
  const inicioHoje = inicioDoDiaSP(instanteReal);
  const diaSemana = paraRelogioSP(inicioHoje).getUTCDay(); // 0=domingo
  const recuar = diaSemana === 0 ? 6 : diaSemana - 1;
  return new Date(inicioHoje.getTime() - recuar * 24 * 60 * 60 * 1000);
}
export function fimDaSemanaSP(instanteReal = new Date()) {
  const inicio = inicioDaSemanaSP(instanteReal);
  return new Date(inicio.getTime() + 7 * 24 * 60 * 60 * 1000 - 1);
}
export function inicioDoMesSP(instanteReal = new Date()) {
  const sp = paraRelogioSP(instanteReal);
  return deRelogioSP(sp.getUTCFullYear(), sp.getUTCMonth(), 1);
}
export function inicioMesAnteriorSP(instanteReal = new Date()) {
  const sp = paraRelogioSP(instanteReal);
  return deRelogioSP(sp.getUTCFullYear(), sp.getUTCMonth() - 1, 1);
}
export function fimMesAnteriorSP(instanteReal = new Date()) {
  const sp = paraRelogioSP(instanteReal);
  return deRelogioSP(sp.getUTCFullYear(), sp.getUTCMonth(), 0); // dia 0 = último dia do mês anterior
}
export function anoSP(instanteReal = new Date()) {
  return paraRelogioSP(instanteReal).getUTCFullYear();
}

// "DD/MM/YYYY HH:MM:SS" do relógio de São Paulo de um instante real - só para
// EXIBIÇÃO (ex.: rodapé "gerado em" de relatório), nunca para comparação
// (para isso, hojeCivilSP/isoLocalSP). toLocaleString() sem argumentos usa o
// locale/fuso padrão do runtime, que no servidor não é o do Brasil.
export function dataHoraExibicaoSP(instanteReal = new Date()) {
  const sp = paraRelogioSP(instanteReal);
  const p = (n) => String(n).padStart(2, "0");
  return `${p(sp.getUTCDate())}/${p(sp.getUTCMonth() + 1)}/${sp.getUTCFullYear()} ${p(sp.getUTCHours())}:${p(sp.getUTCMinutes())}:${p(sp.getUTCSeconds())}`;
}

// Mesma ideia, mas formatada por Intl no estilo do idioma pedido (para as
// linhas "gerado em" dos CSVs, que já formatavam por locale antes). O truque:
// desloca o instante pra "relógio de São Paulo" e manda toLocaleString
// formatar como se fosse UTC - assim o locale escolhe o estilo (MM/DD vs
// DD/MM...), mas os NÚMEROS são sempre os de São Paulo, nunca os do fuso do
// processo.
export function dataHoraLocaleSP(instanteReal = new Date(), locale = "pt-BR") {
  return paraRelogioSP(instanteReal).toLocaleString(locale, { timeZone: "UTC" });
}

// Converte uma string civil INGÊNUA "YYYY-MM-DDTHH:MM[:SS]" (sem "Z", tempo de
// parede de São Paulo - convenção de agendamento do Xaphires Beauty/Saúde &
// Clínicas, ver somarMinutosLocal em xaphires-beauty/repo.js) para o instante
// REAL correspondente. `new Date(str)` faria o mesmo parse, só que assumindo
// o fuso do SERVIDOR - comparar o resultado contra um "agora" de verdade
// (ex.: recusar agendamento no passado) rejeitava horário válido perto da
// virada do dia, porque "14h" virava 14h em CEST em vez de 14h no Brasil.
// Inválida (regex não bate) devolve um Date NaN, como `new Date("lixo")` faria.
export function instanteRealDeCivilSP(civilStr) {
  const m = /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::(\d{2}))?/.exec(String(civilStr ?? ""));
  if (!m) return new Date(NaN);
  const [, y, mo, d, h, mi, s] = m;
  return deRelogioSP(Number(y), Number(mo) - 1, Number(d), Number(h), Number(mi), Number(s || 0));
}
