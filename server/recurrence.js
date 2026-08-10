// Cálculo de quando uma regra de recorrência deveria ter disparado.
//
// A pergunta que este módulo responde é sempre a mesma: qual foi a ÚLTIMA
// ocorrência devida até agora? Comparando esse instante com o último disparo
// registrado, sabe-se se falta gerar um cartão — e gera-se apenas um, mesmo que
// várias ocorrências tenham passado sem ninguém abrir o app.

export const FREQUENCIES = ["daily", "weekly", "monthly"];

// Toda a aritmética abaixo é em horário LOCAL do servidor, não em UTC. A hora que
// a pessoa escolhe no formulário é a hora do relógio dela: com setUTCHours, "8h"
// virava 5h da manhã no Brasil, e uma regra mensal do dia 1 à meia-noite disparava
// às 21h do dia 31 anterior.
function atHour(base, hour) {
  const d = new Date(base);
  d.setHours(hour, 0, 0, 0);
  return d;
}

function lastDayOfMonth(year, monthIndex) {
  return new Date(year, monthIndex + 1, 0).getDate();
}

// Data civil local em YYYY-MM-DD. Não dá para usar toISOString().slice(0,10) aqui:
// ele converte para UTC antes de cortar, e um vencimento às 22h no Brasil viraria
// o dia seguinte.
function toLocalISODate(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

// Retorna o instante da última ocorrência devida, ou null se a regra ainda não
// teve nenhuma (por exemplo, mensal no dia 25 e hoje é dia 3 do primeiro mês).
export function lastDueOccurrence(rule, now = new Date()) {
  const hour = Number.isInteger(rule.hour) ? rule.hour : 0;

  if (rule.freq === "daily") {
    const hoje = atHour(now, hour);
    if (hoje <= now) return hoje;
    // Antes da hora de hoje: a última devida foi ontem.
    const ontem = new Date(hoje);
    ontem.setDate(ontem.getDate() - 1);
    return ontem;
  }

  if (rule.freq === "weekly") {
    // 0=domingo. Fora da faixa cai no padrão, para uma regra gravada com valor
    // inválido não gerar em dia imprevisível.
    const alvo = Number.isInteger(rule.weekday) && rule.weekday >= 0 && rule.weekday <= 6 ? rule.weekday : 1;
    const d = atHour(now, hour);
    // Recua até cair no dia da semana pedido, sem passar do agora.
    const diff = (d.getDay() - alvo + 7) % 7;
    d.setDate(d.getDate() - diff);
    if (d > now) d.setDate(d.getDate() - 7);
    return d;
  }

  if (rule.freq === "monthly") {
    // monthday2 é opcional - regra com um dia só (o caso comum) passa por aqui
    // com uma lista de um elemento. Quando os dois estão preenchidos, a última
    // ocorrência devida é a mais recente entre os dois, para a rotina poder
    // nascer duas vezes no mesmo mês sem precisar de duas regras.
    const dias = [rule.monthday, rule.monthday2].filter((d) => Number.isInteger(d) && d >= 1 && d <= 31);
    if (dias.length === 0) dias.push(1);
    const candidatos = dias.map((dia) => {
      // Mês corrente, com o dia limitado ao tamanho do mês: regra do dia 31 cai
      // no dia 28 em fevereiro em vez de vazar para março.
      const ano = now.getFullYear();
      const mes = now.getMonth();
      const diaEsteMes = Math.min(dia, lastDayOfMonth(ano, mes));
      const candidato = atHour(new Date(ano, mes, diaEsteMes), hour);
      if (candidato <= now) return candidato;
      // Ainda não chegou neste mês: a última devida foi no mês anterior.
      const anoAnt = mes === 0 ? ano - 1 : ano;
      const mesAnt = mes === 0 ? 11 : mes - 1;
      const diaAnt = Math.min(dia, lastDayOfMonth(anoAnt, mesAnt));
      return atHour(new Date(anoAnt, mesAnt, diaAnt), hour);
    });
    return candidatos.reduce((a, b) => (a > b ? a : b));
  }

  return null;
}

// A regra deve gerar cartão agora? Só se a última ocorrência devida for
// posterior ao último disparo registrado.
export function shouldGenerate(rule, now = new Date()) {
  if (!rule?.active) return false;
  if (!FREQUENCIES.includes(rule.freq)) return false;
  const devida = lastDueOccurrence(rule, now);
  if (!devida) return false;
  // Regra recém-criada não dispara retroativamente: a criação conta como marco.
  const marco = rule.last_run_at || rule.created_at;
  if (!marco) return true;
  return devida > new Date(marco);
}

// Data de vencimento do cartão gerado, se a regra pedir prazo.
//
// Devolve YYYY-MM-DD, e não um timestamp: é o formato que o campo `due` usa em
// todo o resto do app, porque vem de um <input type="date">. Gravar ISO completo
// aqui fazia o cartão gerado aparecer com "Invalid Date" no crachá, não casar no
// Calendário e sair com posição NaN na Linha do tempo.
export function dueDateFor(rule, occurrence) {
  if (!Number.isInteger(rule.due_in_days) || rule.due_in_days < 0) return null;
  const d = new Date(occurrence);
  d.setDate(d.getDate() + rule.due_in_days);
  return toLocalISODate(d);
}
