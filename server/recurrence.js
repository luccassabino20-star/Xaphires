// Cálculo de quando uma regra de recorrência deveria ter disparado.
//
// A pergunta que este módulo responde é sempre a mesma: qual foi a ÚLTIMA
// ocorrência devida até agora? Comparando esse instante com o último disparo
// registrado, sabe-se se falta gerar um cartão — e gera-se apenas um, mesmo que
// várias ocorrências tenham passado sem ninguém abrir o app.

export const FREQUENCIES = ["daily", "weekly", "monthly"];

// Fuso FIXO do produto - não o fuso do sistema operacional do servidor. Brasil
// aboliu o horário de verão em 2019, então America/Sao_Paulo é UTC-3 o ano
// inteiro, sem transição para se preocupar (mesma folga que o billing-cron já
// usa, ver server/jobs/billingCron.js). Antes, a aritmética inteira usava
// Date/getHours() "local", ou seja, do relógio do SISTEMA ONDE O NODE RODA -
// em desenvolvimento isso é a máquina do dev, que normalmente já está em
// horário do Brasil, então o bug nunca apareceu em teste manual. Em produção
// (VPS na Europa, CEST = UTC+2) o servidor está 5h à frente do Brasil: uma
// pessoa marcando "17h" pensando no relógio dela via esse instante já ter
// passado nos relógio DO SERVIDOR (17h Brasil = 22h CEST), e a regra pulava o
// dia inteiro por causa do "criação não dispara retroativo" logo abaixo.
const OFFSET_SAO_PAULO_HORAS = 3; // America/Sao_Paulo = UTC menos 3 horas

// Desloca um instante REAL (epoch correto) para um Date cujos getters UTC
// (getUTCHours, getUTCDate, getUTCDay...) devolvem o relógio de parede de São
// Paulo naquele instante. Da linha daqui pra baixo em diante só se lê hora/dia
// por esses getters UTC - os getters locais (getHours, getDate...) continuam
// refletindo o fuso do SISTEMA operacional, que é exatamente o que se quer
// evitar.
function paraRelogioSP(instanteReal) {
  return new Date(instanteReal.getTime() - OFFSET_SAO_PAULO_HORAS * 60 * 60 * 1000);
}
// Inverso: um relógio de parede de São Paulo (ano/mês/dia/hora) de volta para
// o instante real (epoch correto), para poder comparar contra created_at/
// last_run_at (que são timestamps de verdade) e gravar como tal.
function deRelogioSP(ano, mesIndex, dia, hora, minuto = 0, segundo = 0) {
  return new Date(Date.UTC(ano, mesIndex, dia, hora, minuto, segundo) + OFFSET_SAO_PAULO_HORAS * 60 * 60 * 1000);
}

// Último dia de um mês (1-31) - cálculo de calendário puro, sem instante real
// envolvido, então dá para usar UTC direto sem depender de fuso nenhum.
function lastDayOfMonth(year, monthIndex) {
  return new Date(Date.UTC(year, monthIndex + 1, 0)).getUTCDate();
}

// O dia civil (YYYY-MM-DD) de um instante real, em São Paulo. Não dá para usar
// toISOString().slice(0,10) aqui: ele reflete UTC, e um vencimento às 22h no
// Brasil (01h UTC do dia seguinte) viraria o dia seguinte.
function paraDataCivilSP(instanteReal) {
  const sp = paraRelogioSP(instanteReal);
  const y = sp.getUTCFullYear();
  const m = String(sp.getUTCMonth() + 1).padStart(2, "0");
  const d = String(sp.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

// Instante real do dia civil de `base` (em São Paulo) na hora `hour` (também
// em São Paulo). Equivalente ao antigo atHour(base, hour), só que ancorado no
// fuso do produto em vez do fuso do servidor.
function noHorarioSP(baseReal, hour) {
  const sp = paraRelogioSP(baseReal);
  return deRelogioSP(sp.getUTCFullYear(), sp.getUTCMonth(), sp.getUTCDate(), hour);
}

const UM_DIA_MS = 24 * 60 * 60 * 1000;

// Retorna o instante da última ocorrência devida, ou null se a regra ainda não
// teve nenhuma (por exemplo, mensal no dia 25 e hoje é dia 3 do primeiro mês).
// `now` é sempre um instante REAL (epoch correto); o resultado também.
export function lastDueOccurrence(rule, now = new Date()) {
  const hour = Number.isInteger(rule.hour) ? rule.hour : 0;

  if (rule.freq === "daily") {
    const hoje = noHorarioSP(now, hour);
    if (hoje <= now) return hoje;
    // Antes da hora de hoje: a última devida foi ontem. Subtrair 24h em
    // milissegundos reais é seguro porque São Paulo não tem horário de verão
    // (nenhum dia tem 23h ou 25h) - sem precisar mexer em ano/mês/dia.
    return new Date(hoje.getTime() - UM_DIA_MS);
  }

  if (rule.freq === "weekly") {
    // weekday2 é opcional - mesmo padrão do monthday2 logo abaixo: regra com
    // um dia só (o caso comum) passa por aqui com uma lista de um elemento.
    // Com os dois preenchidos, a última ocorrência devida é a mais recente
    // entre os dois, para a rotina poder nascer duas vezes na mesma semana
    // (ex: toda segunda e quinta) sem precisar de duas regras. Fora da faixa
    // cai no padrão (segunda), para uma regra gravada com valor inválido não
    // gerar em dia imprevisível.
    const dias = [rule.weekday, rule.weekday2].filter((d) => Number.isInteger(d) && d >= 0 && d <= 6);
    if (dias.length === 0) dias.push(1);
    const candidatos = dias.map((alvo) => {
      let d = noHorarioSP(now, hour);
      // Recua até cair no dia da semana pedido (em São Paulo), sem passar do agora.
      const diaSemanaSP = paraRelogioSP(d).getUTCDay();
      const diff = (diaSemanaSP - alvo + 7) % 7;
      d = new Date(d.getTime() - diff * UM_DIA_MS);
      if (d > now) d = new Date(d.getTime() - 7 * UM_DIA_MS);
      return d;
    });
    return candidatos.reduce((a, b) => (a > b ? a : b));
  }

  if (rule.freq === "monthly") {
    // monthday2 é opcional - regra com um dia só (o caso comum) passa por aqui
    // com uma lista de um elemento. Quando os dois estão preenchidos, a última
    // ocorrência devida é a mais recente entre os dois, para a rotina poder
    // nascer duas vezes no mesmo mês sem precisar de duas regras.
    const dias = [rule.monthday, rule.monthday2].filter((d) => Number.isInteger(d) && d >= 1 && d <= 31);
    if (dias.length === 0) dias.push(1);
    const spNow = paraRelogioSP(now);
    const ano = spNow.getUTCFullYear();
    const mes = spNow.getUTCMonth();
    const candidatos = dias.map((dia) => {
      // Mês corrente (em São Paulo), com o dia limitado ao tamanho do mês:
      // regra do dia 31 cai no dia 28 em fevereiro em vez de vazar para março.
      const diaEsteMes = Math.min(dia, lastDayOfMonth(ano, mes));
      const candidato = deRelogioSP(ano, mes, diaEsteMes, hour);
      if (candidato <= now) return candidato;
      // Ainda não chegou neste mês: a última devida foi no mês anterior.
      const anoAnt = mes === 0 ? ano - 1 : ano;
      const mesAnt = mes === 0 ? 11 : mes - 1;
      const diaAnt = Math.min(dia, lastDayOfMonth(anoAnt, mesAnt));
      return deRelogioSP(anoAnt, mesAnt, diaAnt, hour);
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

// Data de vencimento do cartão gerado - SEMPRE volta uma data, nunca null.
// due_in_days é o prazo além do dia da ocorrência (0 = vence no mesmo dia, o
// padrão); sem due_in_days válido (regra antiga, de antes deste campo ganhar
// default, ou gravada direto pela API sem o campo), cai em 0 também, pelo
// mesmo motivo.
//
// Cartão de rotina sem due é o que gerava o bug da prévia duplicada no
// Calendário: rotinasByDate ali casa a ocorrência-fantasma contra
// cardsByDate[iso], que é indexado pelo `due` do cartão de verdade - um
// cartão sem due nunca entra nesse índice, então a prévia continuava
// aparecendo pra sempre por cima do cartão já criado, todo dia, mesmo depois
// dele existir. Garantir devido aqui resolve os dois pedidos de uma vez: o
// cartão nasce com vencimento no dia certo, E some da prévia quando nasce.
//
// Devolve YYYY-MM-DD, e não um timestamp: é o formato que o campo `due` usa em
// todo o resto do app, porque vem de um <input type="date">. Gravar ISO completo
// aqui fazia o cartão gerado aparecer com "Invalid Date" no crachá, não casar no
// Calendário e sair com posição NaN na Linha do tempo.
export function dueDateFor(rule, occurrence) {
  const diasDePrazo = Number.isInteger(rule.due_in_days) && rule.due_in_days >= 0 ? rule.due_in_days : 0;
  const comPrazo = new Date(occurrence.getTime() + diasDePrazo * UM_DIA_MS);
  return paraDataCivilSP(comPrazo);
}
