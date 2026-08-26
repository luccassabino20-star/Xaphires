import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import QRCode from "qrcode";
import { useToast } from "../../state/ToastContext.jsx";
import { translateError } from "../../utils/errors.js";
import * as api from "../../state/api.js";
import { geocodeAddress, buscarCep } from "../../state/api.js";
import BeautyIcon from "./BeautyIcon.jsx";
import BeautyMiniMap from "./BeautyMiniMap.jsx";

// Link público de agendamento (Profissional+): gera/mostra o slug fixo da
// empresa (server/modules/xaphires-beauty/agendaSlugStore.js), o QR Code
// dele (gerado no cliente via qrcode.toDataURL - sem depender de serviço
// externo nem vazar o link a cada carregamento) e a personalização da
// página pública (Fase 10): capa, logo, endereço (CEP + geocode, os mesmos
// endpoints genéricos que o Kanban já usa) e regras de agendamento.
export default function BeautyBookingLinkView({ canUse }) {
  const { t } = useTranslation();
  const showToast = useToast();
  const [slug, setSlug] = useState(null);
  const [erro, setErro] = useState("");
  const [mostrarLink, setMostrarLink] = useState(false);
  const [qrDataUrl, setQrDataUrl] = useState(null);
  const [config, setConfig] = useState(null);
  const [cep, setCep] = useState("");
  const [buscandoCep, setBuscandoCep] = useState(false);
  const [buscandoEndereco, setBuscandoEndereco] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [enviandoCapa, setEnviandoCapa] = useState(false);
  const [enviandoLogo, setEnviandoLogo] = useState(false);
  const capaInputRef = useRef(null);
  const logoInputRef = useRef(null);

  useEffect(() => {
    if (!canUse) return;
    api
      .xbGetBookingLink()
      .then((r) => setSlug(r.slug))
      .catch((e) => setErro(translateError(e, t)));
    api
      .xbGetPageConfig()
      .then(setConfig)
      .catch((e) => setErro(translateError(e, t)));
    // eslint-disable-next-line
  }, [canUse]);

  const url = slug ? `${window.location.origin}/beauty-agendar/${slug}` : "";

  useEffect(() => {
    if (!url) return;
    QRCode.toDataURL(url, { width: 240, margin: 1 })
      .then(setQrDataUrl)
      .catch(() => setQrDataUrl(null));
  }, [url]);

  async function copiar() {
    try {
      await navigator.clipboard.writeText(url);
      showToast(t("modules.xaphiresBeauty.online.copiado"));
      setMostrarLink(false);
    } catch {
      setMostrarLink(true);
    }
  }

  async function buscarEnderecoPorCep() {
    const digs = cep.replace(/\D/g, "");
    if (digs.length !== 8) return;
    setBuscandoCep(true);
    try {
      const e = await buscarCep(digs);
      const partes = [e.logradouro, e.bairro, e.cidade && e.uf ? `${e.cidade} - ${e.uf}` : e.cidade].filter(Boolean);
      setConfig((c) => ({ ...c, address: partes.join(", ") }));
    } catch (err) {
      showToast(translateError(err, t));
    } finally {
      setBuscandoCep(false);
    }
  }
  async function buscarNoMapa() {
    const q = (config?.address || "").trim();
    if (!q) return;
    setBuscandoEndereco(true);
    try {
      const r = await geocodeAddress(q);
      setConfig((c) => ({ ...c, lat: r.lat, lng: r.lng }));
    } catch (err) {
      showToast(translateError(err, t));
    } finally {
      setBuscandoEndereco(false);
    }
  }

  async function salvarConfig() {
    setSalvando(true);
    try {
      const atualizado = await api.xbSetPageConfig({
        address: config.address || "",
        lat: config.lat ?? null,
        lng: config.lng ?? null,
        bookingRulesText: config.booking_rules_text || "",
      });
      setConfig(atualizado);
      showToast(t("modules.xaphiresBeauty.online.configSalva"));
    } catch (err) {
      showToast(translateError(err, t));
    } finally {
      setSalvando(false);
    }
  }

  async function enviarImagem(campo, file, setEnviando) {
    setEnviando(true);
    try {
      const atualizado = await api.xbUploadPageImage(campo, file);
      // Só os campos da própria imagem - o upload não sabe de edições de
      // endereço/regras ainda não salvas no formulário, e sobrescrever o
      // config inteiro com o que já está no banco jogaria fora o que a
      // pessoa digitou e não clicou em "Salvar" ainda.
      const campoPath = campo === "cover" ? "cover_path" : "logo_path";
      const campoMime = campo === "cover" ? "cover_mime" : "logo_mime";
      setConfig((c) => ({ ...c, [campoPath]: atualizado[campoPath], [campoMime]: atualizado[campoMime] }));
    } catch (err) {
      showToast(translateError(err, t));
    } finally {
      setEnviando(false);
    }
  }

  const titulo = (
    <div className="beauty-page-head">
      <h2 className="beauty-page-title">{t("modules.xaphiresBeauty.tabs.online")}</h2>
    </div>
  );

  if (!canUse) {
    return (
      <div>
        {titulo}
        <div className="beauty-card">
          <div className="beauty-lock-card">
            <BeautyIcon name="online" size={30} />
            <span>{t("modules.xaphiresBeauty.online.bloqueado", { plano: t("plan.names.professional") })}</span>
          </div>
        </div>
      </div>
    );
  }

  const capaUrl = config?.cover_path ? `/api/xaphires-beauty/page-config/cover/photo?v=${config.cover_path}` : null;
  const logoUrl = config?.logo_path ? `/api/xaphires-beauty/page-config/logo/photo?v=${config.logo_path}` : null;

  return (
    <div>
      {titulo}
      <div className="beauty-card" style={{ padding: 28, marginBottom: 18 }}>
        <p className="xb-online-intro">{t("modules.xaphiresBeauty.online.explicacao")}</p>
        {erro && <div className="beauty-error" style={{ padding: "8px 0" }}>{erro}</div>}
        {slug && (
          <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
            <button type="button" className="btn-primary" onClick={copiar}>
              {t("modules.xaphiresBeauty.online.copiarLink")}
            </button>
            {mostrarLink && (
              <input
                type="text"
                readOnly
                value={url}
                onFocus={(e) => e.target.select()}
                className="beauty-date-input"
                style={{ flex: 1, minWidth: 260 }}
              />
            )}
          </div>
        )}
      </div>

      {qrDataUrl && (
        <div className="beauty-card beauty-qrcode-box" style={{ marginBottom: 18 }}>
          <img src={qrDataUrl} alt={t("modules.xaphiresBeauty.online.qrCode")} />
          <a href={qrDataUrl} download="qrcode-agendamento.png" className="btn-ghost">
            {t("modules.xaphiresBeauty.online.baixarQrCode")}
          </a>
        </div>
      )}

      {config && (
        <div className="beauty-card" style={{ padding: 24 }}>
          <h3 className="beauty-section-title" style={{ marginTop: 0 }}>{t("modules.xaphiresBeauty.online.personalizarPagina")}</h3>
          <div className="beauty-page-config-grid">
            <div>
              <div className="beauty-image-upload">
                {capaUrl ? <img src={capaUrl} alt="" className="beauty-image-preview" /> : <div className="beauty-image-preview-empty">{t("modules.xaphiresBeauty.online.semCapa")}</div>}
                <button type="button" className="btn-ghost" disabled={enviandoCapa} onClick={() => capaInputRef.current?.click()}>
                  {t("modules.xaphiresBeauty.online.trocarCapa")}
                </button>
                <input ref={capaInputRef} type="file" accept="image/png,image/jpeg,image/webp,image/gif" hidden
                  onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) enviarImagem("cover", f, setEnviandoCapa); }} />
              </div>
              <div className="beauty-image-upload">
                {logoUrl ? <img src={logoUrl} alt="" className="beauty-image-preview" /> : <div className="beauty-image-preview-empty">{t("modules.xaphiresBeauty.online.semLogo")}</div>}
                <button type="button" className="btn-ghost" disabled={enviandoLogo} onClick={() => logoInputRef.current?.click()}>
                  {t("modules.xaphiresBeauty.online.trocarLogo")}
                </button>
                <input ref={logoInputRef} type="file" accept="image/png,image/jpeg,image/webp,image/gif" hidden
                  onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) enviarImagem("logo", f, setEnviandoLogo); }} />
              </div>

              <div className="beauty-form" style={{ marginBottom: 10 }}>
                <input type="text" placeholder={t("modules.xaphiresBeauty.online.cep")} value={cep} onChange={(e) => setCep(e.target.value)} style={{ maxWidth: 140 }} />
                <button type="button" className="btn-ghost" disabled={buscandoCep} onClick={buscarEnderecoPorCep}>{t("modules.xaphiresBeauty.online.buscarCep")}</button>
              </div>
              <div className="beauty-form" style={{ marginBottom: 10 }}>
                <input
                  type="text"
                  placeholder={t("modules.xaphiresBeauty.online.endereco")}
                  value={config.address || ""}
                  onChange={(e) => setConfig({ ...config, address: e.target.value })}
                  style={{ flex: 1, minWidth: 200 }}
                />
                <button type="button" className="btn-ghost" disabled={buscandoEndereco} onClick={buscarNoMapa}>{t("modules.xaphiresBeauty.online.buscarNoMapa")}</button>
              </div>
              <textarea
                placeholder={t("modules.xaphiresBeauty.online.regrasAgendamento")}
                value={config.booking_rules_text || ""}
                onChange={(e) => setConfig({ ...config, booking_rules_text: e.target.value })}
                rows={3}
                style={{ width: "100%", resize: "vertical", padding: "9px 14px", fontSize: 13.5, color: "var(--beauty-text)", background: "var(--beauty-bg)", border: "1px solid var(--beauty-border)", borderRadius: 14, marginBottom: 10 }}
              />
              <button type="button" className="btn-primary" disabled={salvando} onClick={salvarConfig}>{t("common.save")}</button>
            </div>
            <div>
              <BeautyMiniMap lat={config.lat} lng={config.lng} />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
