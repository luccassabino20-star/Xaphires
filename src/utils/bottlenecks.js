// Detecção de gargalos: cartões parados além do prazo da coluna em que estão.
//
// O cálculo é do cliente porque todos os dados necessários já vêm no quadro
// (listEnteredAt no cartão, stuckHours na lista). Uma rota dedicada só duplicaria
// a regra e criaria a chance das duas pontas discordarem.

export function hoursStuck(card, now = Date.now()) {
  if (!card?.listEnteredAt) return null;
  const entrou = new Date(card.listEnteredAt).getTime();
  if (Number.isNaN(entrou)) return null;
  return (now - entrou) / 3600000;
}

// Um cartão só é gargalo se a coluna for monitorada e ele não estiver concluído:
// tarefa entregue parada na coluna não é gargalo, é histórico.
export function isStuck(card, list, now = Date.now()) {
  if (!list?.stuckHours) return false;
  if (card?.completed) return false;
  const horas = hoursStuck(card, now);
  return horas !== null && horas >= list.stuckHours;
}

// Todos os gargalos do quadro, do mais parado para o menos.
export function findBottlenecks(board, now = Date.now()) {
  if (!board) return [];
  const out = [];
  for (const list of board.lists) {
    if (!list.stuckHours) continue;
    for (const cardId of list.cardIds) {
      const card = board.cards[cardId];
      if (!card || !isStuck(card, list, now)) continue;
      out.push({
        card,
        list,
        hours: hoursStuck(card, now),
        overBy: hoursStuck(card, now) - list.stuckHours,
      });
    }
  }
  return out.sort((a, b) => b.hours - a.hours);
}

// Texto curto de duração: horas até 48, depois dias, para "72h" não competir
// mentalmente com "3 dias" na hora de julgar a gravidade.
export function formatDuration(hours, t) {
  if (hours === null || hours === undefined) return "";
  if (hours < 48) return t("board.bottlenecks.hours", { count: Math.floor(hours) });
  return t("board.bottlenecks.days", { count: Math.floor(hours / 24) });
}

// Versão sem o "parado" no fim, para caber dentro de frase. A de cima é para o
// crachá do cartão e o painel, onde o texto aparece sozinho e precisa se explicar.
export function formatDurationBare(hours, t) {
  if (hours === null || hours === undefined) return "";
  if (hours < 48) return t("board.bottlenecks.bareHours", { count: Math.floor(hours) });
  return t("board.bottlenecks.bareDays", { count: Math.floor(hours / 24) });
}

// Mensagem de cobrança pronta para copiar. Modelo preenchido, não texto gerado:
// sem dependência de IA, sem custo e funciona offline.
export function followUpMessage({ card, list, hours }, t, membros = []) {
  const nomes = (card.memberIds || [])
    .map((id) => membros.find((m) => m.id === id)?.name)
    .filter(Boolean);

  const linhas = [
    // Sem responsável no cartão, uma saudação genérica soa melhor do que encaixar
    // um substituto no lugar do nome.
    nomes[0] ? t("board.bottlenecks.msgGreeting", { name: nomes[0] }) : t("board.bottlenecks.msgGreetingNoName"),
    "",
    t("board.bottlenecks.msgBody", {
      title: card.title,
      list: list.title,
      duration: formatDurationBare(hours, t),
    }),
  ];
  if (card.due) {
    linhas.push(t("board.bottlenecks.msgDue", { date: new Date(card.due).toLocaleDateString() }));
  }
  linhas.push("", t("board.bottlenecks.msgClosing"));
  return linhas.join("\n");
}
