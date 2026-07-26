// Cálculo de quando uma regra de recorrência deveria ter disparado.
//
// A pergunta que este módulo responde é sempre a mesma: qual foi a ÚLTIMA
// ocorrência devida até agora? Comparando esse instante com o último disparo
// registrado, sabe-se se falta gerar um cartão — e gera-se apenas um, mesmo que
// várias ocorrências tenham passado sem ninguém abrir o app.

export const FREQUENCIES = ["daily", "weekly", "monthly"];

function atHour(base, hour) {
  const d = new Date(base);
  d.setUTCHours(hour, 0, 0, 0);
  return d;
}

function lastDayOfMonth(year, monthIndex) {
  return new Date(Date.UTC(year, monthIndex + 1, 0)).getUTCDate();
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
    ontem.setUTCDate(ontem.getUTCDate() - 1);
    return ontem;
  }

  if (rule.freq === "weekly") {
    const alvo = Number.isInteger(rule.weekday) ? rule.weekday : 1; // 0=domingo
    const d = atHour(now, hour);
    // Recua até cair no dia da semana pedido, sem passar do agora.
    const diff = (d.getUTCDay() - alvo + 7) % 7;
    d.setUTCDate(d.getUTCDate() - diff);
    if (d > now) d.setUTCDate(d.getUTCDate() - 7);
    return d;
  }

  if (rule.freq === "monthly") {
    const dia = Number.isInteger(rule.monthday) ? rule.monthday : 1;
    // Mês corrente, com o dia limitado ao tamanho do mês: regra do dia 31 cai
    // no dia 28 em fevereiro em vez de vazar para março.
    const ano = now.getUTCFullYear();
    const mes = now.getUTCMonth();
    const diaEsteMes = Math.min(dia, lastDayOfMonth(ano, mes));
    const candidato = atHour(new Date(Date.UTC(ano, mes, diaEsteMes)), hour);
    if (candidato <= now) return candidato;
    // Ainda não chegou neste mês: a última devida foi no mês anterior.
    const anoAnt = mes === 0 ? ano - 1 : ano;
    const mesAnt = mes === 0 ? 11 : mes - 1;
    const diaAnt = Math.min(dia, lastDayOfMonth(anoAnt, mesAnt));
    return atHour(new Date(Date.UTC(anoAnt, mesAnt, diaAnt)), hour);
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
export function dueDateFor(rule, occurrence) {
  if (!Number.isInteger(rule.due_in_days) || rule.due_in_days < 0) return null;
  const d = new Date(occurrence);
  d.setUTCDate(d.getUTCDate() + rule.due_in_days);
  return d.toISOString();
}
