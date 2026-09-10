import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useToast } from "../../state/ToastContext.jsx";
import { translateError } from "../../utils/errors.js";
import * as api from "../../state/api.js";

// Mercado Pago e Banco Inter aparecem na lista (é para eles que a régua e o
// checkout hospedado de cartão foram desenhados - ver gateway/index.js), mas
// ainda não têm integração real: o servidor recusa qualquer coisa diferente de
// 'fake' aqui (ver PUT /cobrancas/gateway) para não fingir uma conta configurada
// que não cobra de verdade.
const PROVEDORES_FUTUROS = ["mercadopago", "bancointer"];

export default function CobrancaConfigView() {
  const { t } = useTranslation();
  const showToast = useToast();

  const [regua, setRegua] = useState(null);
  const [gateway, setGateway] = useState(null);
  const [salvandoRegua, setSalvandoRegua] = useState(false);
  const [erro, setErro] = useState("");

  async function carregar() {
    try {
      const [r, g] = await Promise.all([api.finGetReguaConfig(), api.finGetGatewayConfig()]);
      setRegua(r);
      setGateway(g);
    } catch (err) {
      setErro(translateError(err, t));
    }
  }
  useEffect(() => {
    carregar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function salvarRegua(e) {
    e.preventDefault();
    setSalvandoRegua(true);
    try {
      const atualizada = await api.finSalvarReguaConfig({
        diasAntesVencimento: Number(regua.dias_antes_vencimento),
        multaPercent: Number(regua.multa_percent),
        jurosPercentMes: Number(regua.juros_percent_mes),
        mensagemPre: regua.mensagem_pre,
        mensagemDia: regua.mensagem_dia,
        mensagemPos: regua.mensagem_pos,
      });
      setRegua(atualizada);
      showToast(t("financeiro.cobrancas.config.reguaSalva"));
    } catch (err) {
      showToast(translateError(err, t));
    } finally {
      setSalvandoRegua(false);
    }
  }

  if (!regua || !gateway) return <div className="fin-loading">{t("common.loading")}</div>;

  return (
    <div className="fin-cobr-config">
      {erro && <div className="fin-error">{erro}</div>}

      <form className="fin-cobr-config-card" onSubmit={salvarRegua}>
        <h3 className="fin-cobr-config-title">{t("financeiro.cobrancas.config.reguaTitulo")}</h3>
        <p className="fin-cobr-config-hint">{t("financeiro.cobrancas.config.reguaHint")}</p>

        <div className="fin-modal-grid">
          <label className="auth-field">
            <span>{t("financeiro.cobrancas.config.diasAntes")}</span>
            <input
              type="number" min="0" max="60" value={regua.dias_antes_vencimento}
              onChange={(e) => setRegua({ ...regua, dias_antes_vencimento: e.target.value })}
            />
          </label>
          <label className="auth-field">
            <span>{t("financeiro.cobrancas.config.multa")}</span>
            <input
              type="number" min="0" max="100" value={regua.multa_percent}
              onChange={(e) => setRegua({ ...regua, multa_percent: e.target.value })}
            />
          </label>
          <label className="auth-field">
            <span>{t("financeiro.cobrancas.config.jurosMes")}</span>
            <input
              type="number" min="0" max="100" value={regua.juros_percent_mes}
              onChange={(e) => setRegua({ ...regua, juros_percent_mes: e.target.value })}
            />
          </label>
        </div>

        <label className="auth-field">
          <span>{t("financeiro.cobrancas.config.mensagemPre")}</span>
          <textarea rows={2} value={regua.mensagem_pre} onChange={(e) => setRegua({ ...regua, mensagem_pre: e.target.value })} />
        </label>
        <label className="auth-field">
          <span>{t("financeiro.cobrancas.config.mensagemDia")}</span>
          <textarea rows={2} value={regua.mensagem_dia} onChange={(e) => setRegua({ ...regua, mensagem_dia: e.target.value })} />
        </label>
        <label className="auth-field">
          <span>{t("financeiro.cobrancas.config.mensagemPos")}</span>
          <textarea rows={2} value={regua.mensagem_pos} onChange={(e) => setRegua({ ...regua, mensagem_pos: e.target.value })} />
        </label>
        <p className="fin-cobr-config-hint">{t("financeiro.cobrancas.config.placeholdersHint")}</p>

        <div className="fin-modal-acoes">
          <button type="submit" className="btn-primary" disabled={salvandoRegua}>
            {salvandoRegua ? t("common.loading") : t("common.save")}
          </button>
        </div>
      </form>

      <GatewayConfigCard gateway={gateway} onSaved={setGateway} />
      <WhatsappConnectionCard />
    </div>
  );
}

function GatewayConfigCard({ gateway, onSaved }) {
  const { t } = useTranslation();
  const showToast = useToast();
  const [provider, setProvider] = useState(gateway.provider);
  const [ambiente, setAmbiente] = useState(gateway.ambiente);
  const [salvando, setSalvando] = useState(false);

  async function salvar(e) {
    e.preventDefault();
    // Os campos de credencial (token/certificado) chegam junto do provider
    // real nas fases seguintes - o simulado não precisa de nenhum.
    if (provider !== "fake") return;
    setSalvando(true);
    try {
      const atualizado = await api.finSalvarGatewayConfig({ provider, ambiente, config: {} });
      onSaved(atualizado);
      showToast(t("financeiro.cobrancas.config.gatewaySalvo"));
    } catch (err) {
      showToast(translateError(err, t));
    } finally {
      setSalvando(false);
    }
  }

  return (
    <form className="fin-cobr-config-card" onSubmit={salvar}>
      <h3 className="fin-cobr-config-title">{t("financeiro.cobrancas.config.gatewayTitulo")}</h3>
      <p className="fin-cobr-config-hint">{t("financeiro.cobrancas.config.gatewayHint")}</p>

      <div className="fin-modal-grid">
        <label className="auth-field">
          <span>{t("financeiro.cobrancas.config.provedor")}</span>
          <select value={provider} onChange={(e) => setProvider(e.target.value)}>
            <option value="fake">{t("financeiro.cobrancas.config.provedorSimulado")}</option>
            {PROVEDORES_FUTUROS.map((p) => (
              <option key={p} value={p}>
                {t(`financeiro.cobrancas.config.provedorNome.${p}`)} — {t("financeiro.cobrancas.config.emBreve")}
              </option>
            ))}
          </select>
        </label>
        <label className="auth-field">
          <span>{t("financeiro.cobrancas.config.ambiente")}</span>
          <select value={ambiente} onChange={(e) => setAmbiente(e.target.value)}>
            <option value="sandbox">{t("financeiro.cobrancas.config.sandbox")}</option>
            <option value="producao">{t("financeiro.cobrancas.config.producao")}</option>
          </select>
        </label>
      </div>

      {provider === "fake" ? (
        <p className="fin-cobr-config-hint">{t("financeiro.cobrancas.config.simuladoHint")}</p>
      ) : (
        <p className="fin-cobr-config-alerta">{t("financeiro.cobrancas.config.indisponivelHint")}</p>
      )}

      <div className="fin-modal-acoes">
        <button type="submit" className="btn-primary" disabled={salvando || provider !== "fake"}>
          {salvando ? t("common.loading") : t("common.save")}
        </button>
      </div>
    </form>
  );
}

// Conexão WhatsApp (automação gratuita via whatsapp-web.js - ver
// server/services/whatsappService.js para o porquê disto não ser a API oficial
// e o risco de banimento que isso carrega, aceito conscientemente). Sem SSE/
// WebSocket neste projeto (ver ChatContext.jsx) - o polling a cada 3s é o
// mesmo padrão de "tempo real" que o resto do app já usa, e é curto o
// suficiente pra acompanhar o QR aparecendo e sumindo até o READY.
function WhatsappConnectionCard() {
  const { t } = useTranslation();
  const showToast = useToast();
  const [estado, setEstado] = useState(null);
  const [conectando, setConectando] = useState(false);
  const [testPhone, setTestPhone] = useState("");
  const [enviandoTeste, setEnviandoTeste] = useState(false);

  useEffect(() => {
    let ativo = true;
    async function carregar() {
      try {
        const s = await api.waGetStatus();
        if (ativo) setEstado(s);
      } catch {
        // Polling silencioso - um erro passageiro não deve piscar a tela.
      }
    }
    carregar();
    const id = setInterval(carregar, 3000);
    return () => {
      ativo = false;
      clearInterval(id);
    };
  }, []);

  async function conectar() {
    setConectando(true);
    try {
      setEstado(await api.waConnect());
    } catch (err) {
      showToast(translateError(err, t));
    } finally {
      setConectando(false);
    }
  }

  async function desconectar() {
    if (!confirm(t("financeiro.cobrancas.whatsapp.confirmDesconectar"))) return;
    try {
      setEstado(await api.waDisconnect());
    } catch (err) {
      showToast(translateError(err, t));
    }
  }

  async function enviarTeste(e) {
    e.preventDefault();
    setEnviandoTeste(true);
    try {
      await api.waSendMessage(testPhone, t("financeiro.cobrancas.whatsapp.mensagemTeste"));
      showToast(t("financeiro.cobrancas.whatsapp.testeEnviado"));
    } catch (err) {
      showToast(translateError(err, t));
    } finally {
      setEnviandoTeste(false);
    }
  }

  if (!estado) return null;

  return (
    <div className="fin-cobr-config-card">
      <h3 className="fin-cobr-config-title">{t("financeiro.cobrancas.whatsapp.titulo")}</h3>
      <p className="fin-cobr-config-hint">{t("financeiro.cobrancas.whatsapp.hint")}</p>

      {estado.status === "DISCONNECTED" && (
        <button type="button" className="btn-primary" onClick={conectar} disabled={conectando}>
          {conectando ? t("common.loading") : t("financeiro.cobrancas.whatsapp.conectar")}
        </button>
      )}

      {estado.status === "INITIALIZING" && <p className="fin-cobr-config-hint">{t("financeiro.cobrancas.whatsapp.gerandoQr")}</p>}

      {estado.status === "SCAN_QR" && estado.qr && (
        <div className="fin-wa-qr-box">
          <img src={estado.qr} alt="" className="fin-wa-qr-img" />
          <p className="fin-cobr-config-hint">{t("financeiro.cobrancas.whatsapp.instrucoesQr")}</p>
        </div>
      )}

      {estado.status === "READY" && (
        <>
          <div className="fin-wa-conectado">
            <span className="plan-status-pill status-active">
              <span className="plan-status-pill-dot" />
              {t("financeiro.cobrancas.whatsapp.conectado")}
            </span>
            {estado.phone && <span className="fin-wa-numero">+{estado.phone}</span>}
            <button type="button" className="btn-secondary btn-small" onClick={desconectar}>
              {t("financeiro.cobrancas.whatsapp.desconectar")}
            </button>
          </div>

          <form className="fin-wa-teste" onSubmit={enviarTeste}>
            <label className="auth-field">
              <span>{t("financeiro.cobrancas.whatsapp.numeroTeste")}</span>
              <input
                type="text"
                inputMode="tel"
                placeholder="27999998888"
                value={testPhone}
                onChange={(e) => setTestPhone(e.target.value)}
                required
              />
            </label>
            <button type="submit" className="btn-secondary btn-small" disabled={enviandoTeste}>
              {enviandoTeste ? t("common.loading") : t("financeiro.cobrancas.whatsapp.enviarTeste")}
            </button>
          </form>
        </>
      )}
    </div>
  );
}
