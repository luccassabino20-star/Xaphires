// Helpers da Agenda: datas civis, grade de horários e o algoritmo de "raias"
// que evita dois agendamentos se sobreporem visualmente no mesmo dia.

// Grade de 15 em 15 minutos, das 7h às 20h - fixo por ora (não há
// configuração de horário de funcionamento por clínica ainda).
export const HORA_INICIO = 7 * 60; // minutos desde 00:00
export const HORA_FIM = 20 * 60;
export const PASSO_MIN = 15;
export const TOTAL_SLOTS = (HORA_FIM - HORA_INICIO) / PASSO_MIN;

export function paraMinutos(hhmm) {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
}
export function minutosParaHora(min) {
  const h = String(Math.floor(min / 60)).padStart(2, "0");
  const m = String(min % 60).padStart(2, "0");
  return `${h}:${m}`;
}
// Índice do slot (linha da grade) em que um horário cai - usado tanto para
// desenhar a grade quanto para calcular grid-row de um card.
export function slotDoHorario(hhmm) {
  return Math.max(0, Math.round((paraMinutos(hhmm) - HORA_INICIO) / PASSO_MIN));
}

// Data civil (YYYY-MM-DD) local, sem UTC - mesma regra do resto do projeto
// (recorrência, financeiro): a data é a do relógio de quem olha a tela.
export function hojeCivil() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
export function dataCivil(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}
export function parseDataCivil(s) {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, m - 1, d);
}
export function adicionarDias(s, n) {
  const d = parseDataCivil(s);
  d.setDate(d.getDate() + n);
  return dataCivil(d);
}
// Segunda-feira da semana que contém a data (semana começa na segunda, não
// no domingo - é o que uma agenda de clínica espera).
export function segundaDaSemana(s) {
  const d = parseDataCivil(s);
  const diaSemana = d.getDay(); // 0=domingo
  const offset = diaSemana === 0 ? -6 : 1 - diaSemana;
  d.setDate(d.getDate() + offset);
  return dataCivil(d);
}
export function diasDaSemana(segunda) {
  return Array.from({ length: 7 }, (_, i) => adicionarDias(segunda, i));
}

// Atribui uma "raia" (coluna dentro do dia) a cada item, para itens com
// horário sobreposto (ex.: dois profissionais atendendo no mesmo horário)
// não desenharem um em cima do outro. Mesmo algoritmo clássico de "quantas
// salas preciso" (ordena por início, cada item pega a primeira raia livre).
// items precisa ter {id, inicioMin, fimMin}; devolve Map(id -> {raia, totalRaias}).
export function calcularRaias(items) {
  const ordenados = [...items].sort((a, b) => a.inicioMin - b.inicioMin || a.fimMin - b.fimMin);
  const finalDaRaia = []; // finalDaRaia[i] = minuto em que a raia i fica livre
  const raiaDoItem = new Map();
  for (const it of ordenados) {
    let raia = finalDaRaia.findIndex((fim) => fim <= it.inicioMin);
    if (raia === -1) {
      raia = finalDaRaia.length;
      finalDaRaia.push(it.fimMin);
    } else {
      finalDaRaia[raia] = it.fimMin;
    }
    raiaDoItem.set(it.id, raia);
  }
  // Total de raias só entre itens que realmente se cruzam: agrupar por
  // "cluster" de sobreposição transitiva evitaria itens distantes no dia
  // encolherem à toa - simplificação aceitável aqui: usa o máximo global do
  // dia, que já resolve o caso comum (poucos itens por dia).
  const totalRaias = Math.max(1, finalDaRaia.length);
  const resultado = new Map();
  for (const it of ordenados) resultado.set(it.id, { raia: raiaDoItem.get(it.id), totalRaias });
  return resultado;
}

// Idade em anos/meses/dias a partir da data de nascimento (civil) - o
// detalhe do agendamento mostra os três, não só "36 anos", pra fazer sentido
// também em bebês/crianças pequenas. Empresta pedir emprestado do mês
// anterior quando os dias ficam negativos é o mesmo algoritmo de qualquer
// calculadora de idade civil.
export function calcularIdade(birthDateCivil) {
  if (!birthDateCivil) return null;
  const nasc = parseDataCivil(birthDateCivil);
  const hoje = new Date();
  let anos = hoje.getFullYear() - nasc.getFullYear();
  let meses = hoje.getMonth() - nasc.getMonth();
  let dias = hoje.getDate() - nasc.getDate();
  if (dias < 0) {
    meses -= 1;
    dias += new Date(hoje.getFullYear(), hoje.getMonth(), 0).getDate();
  }
  if (meses < 0) {
    anos -= 1;
    meses += 12;
  }
  return { anos, meses, dias };
}

// Minutos entre agora e uma data/hora civil - base do "há X" no detalhe do
// agendamento (última consulta, etc.).
export function minutosDesde(dataCivil, horaCivil) {
  const alvo = new Date(`${dataCivil}T${horaCivil}:00`);
  return Math.floor((Date.now() - alvo.getTime()) / 60000);
}

// Máscara de telefone BR enquanto digita: (27) 99999-8888 ou (27) 9999-8888.
export function mascararTelefone(valor) {
  const d = String(valor || "").replace(/\D/g, "").slice(0, 11);
  if (d.length <= 2) return d.replace(/^(\d*)/, "($1");
  if (d.length <= 6) return d.replace(/^(\d{2})(\d*)/, "($1) $2");
  if (d.length <= 10) return d.replace(/^(\d{2})(\d{4})(\d*)/, "($1) $2-$3");
  return d.replace(/^(\d{2})(\d{5})(\d*)/, "($1) $2-$3");
}
