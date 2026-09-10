// Sessão de WhatsApp por empresa via Baileys (WebSocket puro, reimplementa o
// protocolo do WhatsApp Web) - NÃO é a API oficial da Meta.
//
// Trocado de whatsapp-web.js (Puppeteer) pra cá NA MESMA sessão de trabalho:
// o whatsapp-web.js@1.34.7 (com o puppeteer@24.38.0 que ele mesmo declara
// como dependência) quebra de forma reprodutível com "Execution context was
// destroyed" dentro de Client.inject() - bug aberto e sem correção no
// repositório oficial deles (ver issues #3792, #3705, #127056; o #3792 foi
// fechado como "not planned"). Baileys não abre navegador nenhum, então não
// sofre desse tipo de quebra por mudança no bundle do WhatsApp Web - e usa
// bem menos memória (sem Chromium por empresa conectada).
//
// Risco aceito conscientemente (decisão do produto, não default): mesmo sem
// o Puppeteer, isto continua sendo automação não-oficial por cima do
// protocolo do WhatsApp - viola os termos de uso e pode banir o número
// conectado sem aviso. Cada empresa conecta o PRÓPRIO WhatsApp aqui, então um
// banimento tira do ar o número de atendimento real de um cliente nosso, não
// o nosso. A alternativa sem esse risco é a Cloud API da Meta (ou Twilio/
// Z-API), que cobra por mensagem e exige conta comercial aprovada.
import makeWASocket, { useMultiFileAuthState, DisconnectReason } from "@whiskeysockets/baileys";
import { Boom } from "@hapi/boom";
import pino from "pino";
import QRCode from "qrcode";
import path from "node:path";
import { companiesDir } from "../db.js";

// Um estado por empresa: { status, qr, phone, sock }. status é sempre um de
// DISCONNECTED | INITIALIZING | SCAN_QR | READY - o vocabulário que a rota e
// o front-end usam, sem vazar os nomes de evento do Baileys pra fora deste
// arquivo (mesmo espírito de "status normalizado" do server/billing/gateway.js).
const sessoes = new Map();

function estadoPublico(companyId) {
  const s = sessoes.get(companyId);
  if (!s) return { status: "DISCONNECTED", qr: null, phone: null };
  return { status: s.status, qr: s.status === "SCAN_QR" ? s.qr : null, phone: s.phone };
}

// Sessão persiste em disco dentro da própria pasta da empresa (mesmo padrão de
// companies/<id>/uploads) - sobrevive a reinício do servidor sem escanear o QR
// de novo, e some junto se a pasta da empresa for apagada. Fica FORA da árvore
// que o Vite observa em dev só por precaução (ver vite.config.js) - os
// arquivos de credencial do Baileys são poucos e pequenos (JSON), não um
// perfil de navegador inteiro, mas o padrão já está ali e não custa manter.
function pastaSessao(companyId) {
  return path.join(companiesDir(), companyId, "whatsapp-session");
}

export function getStatus(companyId) {
  return estadoPublico(companyId);
}

export function isReady(companyId) {
  return sessoes.get(companyId)?.status === "READY";
}

// Idempotente: chamar de novo com uma sessão já iniciando/pronta só devolve o
// estado atual, não cria um segundo socket por cima (dois sockets com a
// mesma pasta de credencial brigando pela mesma sessão corrompe a autenticação).
export async function connect(companyId) {
  const atual = sessoes.get(companyId);
  if (atual && atual.status !== "DISCONNECTED") return estadoPublico(companyId);

  const estado = { status: "INITIALIZING", qr: null, phone: null, sock: null };
  sessoes.set(companyId, estado);

  const { state, saveCreds } = await useMultiFileAuthState(pastaSessao(companyId));
  const sock = makeWASocket({
    auth: state,
    // silent: o log verboso do Baileys (um evento por pacote do protocolo)
    // afogaria o console do servidor - erro real ainda aparece pelos nossos
    // próprios console.error abaixo.
    logger: pino({ level: "silent" }),
  });
  estado.sock = sock;

  sock.ev.on("creds.update", saveCreds);

  sock.ev.on("connection.update", (update) => {
    const { connection, lastDisconnect, qr } = update;

    if (qr) {
      QRCode.toDataURL(qr)
        .then((dataUrl) => {
          estado.qr = dataUrl;
          estado.status = "SCAN_QR";
        })
        .catch((err) => console.error(`[whatsapp] falha ao gerar QR da empresa ${companyId}:`, err));
    }

    if (connection === "open") {
      estado.status = "READY";
      estado.qr = null;
      // sock.user.id vem como "<dígitos>:<device>@s.whatsapp.net" (ou em
      // formato @lid) - phoneNumber, quando existe, já é só o número em
      // formato @s.whatsapp.net; os dois precisam do mesmo corte pra sobrar
      // só dígito.
      const bruto = sock.user?.phoneNumber || sock.user?.id || "";
      estado.phone = bruto.split("@")[0].split(":")[0].replace(/\D/g, "") || null;
    } else if (connection === "close") {
      const codigo = lastDisconnect?.error instanceof Boom ? lastDisconnect.error.output?.statusCode : null;
      // loggedOut é a única causa que NÃO deve reconectar sozinha: aparelho
      // removido pelo celular ou POST /disconnect (ver abaixo) - qualquer
      // outro motivo (queda de rede, restart pedido pelo próprio WhatsApp) é
      // transitório, e o Baileys espera que a aplicação reconecte por conta
      // própria (não faz isso sozinho).
      const deveReconectar = codigo !== DisconnectReason.loggedOut;
      console.log(`[whatsapp] empresa ${companyId} desconectada (código ${codigo}) - reconectar automaticamente: ${deveReconectar}`);
      sessoes.delete(companyId);
      if (deveReconectar) {
        connect(companyId).catch((err) => console.error(`[whatsapp] falha ao reconectar empresa ${companyId}:`, err));
      }
    }
  });

  return estadoPublico(companyId);
}

// logout() invalida o aparelho vinculado de propósito (não é só "pausar") -
// reconectar depois exige escanear um QR novo, o mesmo efeito de remover o
// aparelho pela lista "Aparelhos conectados" do WhatsApp. Dispara o evento
// 'close' com DisconnectReason.loggedOut por conta própria (não reconecta
// sozinho, ver acima) - o delete aqui só garante que o estado já fique limpo
// pra resposta desta chamada, sem esperar o evento assíncrono.
export async function disconnect(companyId) {
  const estado = sessoes.get(companyId);
  if (!estado?.sock) {
    sessoes.delete(companyId);
    return { status: "DISCONNECTED", qr: null, phone: null };
  }
  try {
    await estado.sock.logout();
  } catch (err) {
    console.error(`[whatsapp] falha ao encerrar sessão da empresa ${companyId}:`, err);
  }
  sessoes.delete(companyId);
  return { status: "DISCONNECTED", qr: null, phone: null };
}

// Telefone cadastrado no Financeiro (financeiro_contatos.telefone) é DDD +
// número, sem o código do país - o mesmo formato que a pessoa digita em
// qualquer lugar do Brasil. O JID do WhatsApp exige o número internacional
// completo (55 na frente); sem isso o Baileys aceita mandar mesmo assim
// (não valida o destino sozinho) e a mensagem simplesmente nunca chega, sem
// erro nenhum - foi exatamente o que aconteceu no primeiro teste real.
function normalizarTelefoneBR(phone) {
  const digitos = String(phone || "").replace(/\D/g, "");
  if (digitos.startsWith("55") && (digitos.length === 12 || digitos.length === 13)) return digitos;
  if (digitos.length === 10 || digitos.length === 11) return "55" + digitos;
  return digitos;
}

export async function sendMessage(companyId, phone, text) {
  const estado = sessoes.get(companyId);
  if (!estado || estado.status !== "READY") {
    const err = new Error("WhatsApp não conectado");
    err.code = "WHATSAPP_NOT_READY";
    throw err;
  }
  const digitos = normalizarTelefoneBR(phone);
  if (!digitos) {
    const err = new Error("Telefone inválido");
    err.code = "WHATSAPP_PHONE_INVALID";
    throw err;
  }
  // Confere que o número existe de verdade no WhatsApp antes de mandar - sem
  // isso, um número com DDD errado (ou qualquer erro de digitação) "envia com
  // sucesso" sem nunca chegar em lugar nenhum, porque sendMessage() sozinho
  // não valida o destino. onWhatsApp() também devolve o JID exato a usar.
  const [info] = (await estado.sock.onWhatsApp(digitos)) || [];
  if (!info?.exists) {
    const err = new Error("Este número não está no WhatsApp");
    err.code = "WHATSAPP_PHONE_NOT_FOUND";
    throw err;
  }
  await estado.sock.sendMessage(info.jid, { text });
}
