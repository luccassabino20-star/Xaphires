// Integração com o Zoom via OAuth Server-to-Server, para o botão "Gerar link
// do Zoom" da aba Reuniões (server/routes/personalTasks.js, POST
// .../video-link/zoom). Estruturado para funcionar quando as três variáveis
// abaixo forem definidas - mas, ao contrário do adaptador do Asaas
// (server/billing/providers/asaas.js), NÃO foi testado contra a API real: não
// há conta de desenvolvedor Zoom disponível neste ambiente para gerar
// credencial de sandbox. Antes de usar em produção, rode uma chamada manual
// e confira o formato da resposta.
//
// Modelo Server-to-Server OAuth (substituiu o antigo JWT App, descontinuado
// pelo Zoom): a credencial é da CONTA (account_id + client_id + client_secret
// do app "Server-to-Server OAuth" criado no Zoom Marketplace), não de um
// usuário - por isso não há tela de login nem redirect no nosso fluxo, é
// chamada servidor-a-servidor pura, no espírito do restante da integração de
// cobrança deste projeto (nenhum SDK, fetch puro).
//
// Google Meet não tem equivalente: criar uma sala von sem consentimento OAuth
// de um usuário Google não é suportado pela API deles. Por isso o Meet, no
// front, é resolvido abrindo https://meet.google.com/new numa aba nova (cria
// uma sala de verdade na hora, mas o link não volta pra nós automaticamente -
// a pessoa cola de volta) em vez de uma chamada de servidor como esta.

const ACCOUNT_ID = () => process.env.ZOOM_ACCOUNT_ID;
const CLIENT_ID = () => process.env.ZOOM_CLIENT_ID;
const CLIENT_SECRET = () => process.env.ZOOM_CLIENT_SECRET;

export function zoomConfigurado() {
  return !!(ACCOUNT_ID() && CLIENT_ID() && CLIENT_SECRET());
}

// Configuração parcial (só uma ou duas das três variáveis) quase sempre é
// engano de quem editou o .env - avisa no arranque do servidor, mesmo
// raciocínio do aviso de billing/gateway.js: erro visível em quem subiu o
// processo, não silêncio até alguém clicar "Gerar link do Zoom" em produção.
const definidas = [ACCOUNT_ID(), CLIENT_ID(), CLIENT_SECRET()].filter(Boolean).length;
if (definidas > 0 && definidas < 3) {
  console.warn(
    "[zoom] ZOOM_ACCOUNT_ID/ZOOM_CLIENT_ID/ZOOM_CLIENT_SECRET parcialmente definidas - o botão \"Gerar link do Zoom\" vai falhar até as três estarem presentes."
  );
} else if (definidas === 3) {
  console.log("[zoom] integração Server-to-Server configurada.");
}

let tokenCache = null; // { accessToken, expiraEm }

async function obterAccessToken() {
  if (tokenCache && tokenCache.expiraEm > Date.now() + 30_000) return tokenCache.accessToken;
  const basic = Buffer.from(`${CLIENT_ID()}:${CLIENT_SECRET()}`).toString("base64");
  const resp = await fetch(`https://zoom.us/oauth/token?grant_type=account_credentials&account_id=${encodeURIComponent(ACCOUNT_ID())}`, {
    method: "POST",
    headers: { Authorization: `Basic ${basic}` },
  });
  if (!resp.ok) throw new Error(`token Zoom: HTTP ${resp.status}`);
  const data = await resp.json();
  tokenCache = { accessToken: data.access_token, expiraEm: Date.now() + (data.expires_in || 3600) * 1000 };
  return tokenCache.accessToken;
}

// due é data civil YYYY-MM-DD e startTime "HH:MM" (mesmo formato de
// personal_tasks) - reunião "sem horário" (allDay) manda start_time nulo, o
// Zoom aceita e trata como agendamento sem hora marcada.
function paraStartTimeIso(due, startTime) {
  if (!due || !startTime) return undefined;
  return `${due}T${startTime}:00`;
}

export async function criarReuniaoZoom({ topic, due, startTime, durationMin }) {
  const accessToken = await obterAccessToken();
  const resp = await fetch("https://api.zoom.us/v2/users/me/meetings", {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      topic: topic || "Reunião",
      type: startTime ? 2 : 1, // 2 = agendada num horário, 1 = instantânea
      start_time: paraStartTimeIso(due, startTime),
      duration: durationMin || 60,
      timezone: "America/Sao_Paulo",
      settings: { join_before_host: true, waiting_room: false },
    }),
  });
  if (!resp.ok) throw new Error(`criar reunião Zoom: HTTP ${resp.status}`);
  const data = await resp.json();
  return { joinUrl: data.join_url, meetingId: data.id };
}
