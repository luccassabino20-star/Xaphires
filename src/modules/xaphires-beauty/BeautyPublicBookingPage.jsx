import { useEffect, useState } from "react";
import * as api from "../../state/api.js";
import BeautyMiniMap from "./BeautyMiniMap.jsx";

function hojeCivil() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

const FORM_VAZIO = { name: "", phone: "", serviceId: "", staffId: "", date: hojeCivil(), time: "09:00" };

// Formulário público de agendamento (Fase 4) - o visitante marca o próprio
// horário sem login. Fora de tudo (sem AuthProvider, sem i18n) - mesmo
// isolamento de AnamneseFormularioEtapas.jsx (Saúde & Clínicas): ferramenta
// de uso único, texto só em português, erro do servidor (já em português)
// mostrado direto (err.message), sem passar por translateError.
export default function BeautyPublicBookingPage({ slug }) {
  const [estado, setEstado] = useState("carregando"); // carregando | formulario | enviando | obrigado | erro
  const [dados, setDados] = useState(null);
  const [erro, setErro] = useState("");
  const [f, setF] = useState(FORM_VAZIO);

  useEffect(() => {
    document.body.classList.add("sc-pub-body");
    return () => document.body.classList.remove("sc-pub-body");
  }, []);

  useEffect(() => {
    api
      .xbPublicGetBooking(slug)
      .then((d) => {
        setDados(d);
        setEstado("formulario");
      })
      .catch((e) => {
        setErro(e.message || "Link inválido");
        setEstado("erro");
      });
  }, [slug]);

  async function enviar(e) {
    e.preventDefault();
    if (!f.name.trim() || !f.phone.trim() || !f.serviceId) return;
    setEstado("enviando");
    setErro("");
    try {
      await api.xbPublicCreateBooking(slug, {
        name: f.name.trim(),
        phone: f.phone.trim(),
        serviceId: f.serviceId,
        staffId: f.staffId || null,
        startsAt: `${f.date}T${f.time}:00`,
      });
      setEstado("obrigado");
    } catch (err) {
      setErro(err.message || "Não foi possível agendar. Tente novamente.");
      setEstado("formulario");
    }
  }

  if (estado === "carregando") {
    return (
      <div className="sc-pub">
        <div className="sc-pub-card">Carregando...</div>
      </div>
    );
  }
  if (estado === "erro" && !dados) {
    return (
      <div className="sc-pub">
        <div className="sc-pub-card">
          <p className="sc-pub-erro">{erro}</p>
        </div>
      </div>
    );
  }
  if (estado === "obrigado") {
    return (
      <div className="sc-pub">
        <div className="sc-pub-card">
          <p className="sc-pub-obrigado">Agendamento recebido! {dados.companyName} vai te aguardar no horário combinado.</p>
        </div>
      </div>
    );
  }

  const capaUrl = dados.hasCover ? `/api/public/xaphires-beauty/${slug}/photo/cover` : null;
  const logoUrl = dados.hasLogo ? `/api/public/xaphires-beauty/${slug}/photo/logo` : null;

  return (
    <div className="sc-pub">
      <div className="sc-pub-card">
        {capaUrl && <img src={capaUrl} alt="" className="xb-pub-cover" />}
        {logoUrl && <img src={logoUrl} alt="" className="xb-pub-logo" />}
        <h1 className="sc-pub-title">Agendar horário</h1>
        <p className="sc-pub-sub">{dados.companyName}</p>
        {dados.address && <p className="xb-pub-address">{dados.address}</p>}
        {erro && <p className="sc-pub-erro">{erro}</p>}
        <form onSubmit={enviar}>
          <label className="sc-pub-campo">
            <span className="sc-pub-label">Seu nome</span>
            <input type="text" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} required />
          </label>
          <label className="sc-pub-campo">
            <span className="sc-pub-label">Seu telefone (WhatsApp)</span>
            <input type="tel" value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} required />
          </label>
          <label className="sc-pub-campo">
            <span className="sc-pub-label">Serviço</span>
            <select value={f.serviceId} onChange={(e) => setF({ ...f, serviceId: e.target.value })} required>
              <option value="">Escolha um serviço</option>
              {dados.services.map((s) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
          </label>
          {dados.staff.length > 0 && (
            <label className="sc-pub-campo">
              <span className="sc-pub-label">Profissional (opcional)</span>
              <select value={f.staffId} onChange={(e) => setF({ ...f, staffId: e.target.value })}>
                <option value="">Sem preferência</option>
                {dados.staff.map((s) => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
            </label>
          )}
          <label className="sc-pub-campo">
            <span className="sc-pub-label">Data</span>
            <input type="date" min={hojeCivil()} value={f.date} onChange={(e) => setF({ ...f, date: e.target.value })} required />
          </label>
          <label className="sc-pub-campo">
            <span className="sc-pub-label">Horário</span>
            <input type="time" step={900} value={f.time} onChange={(e) => setF({ ...f, time: e.target.value })} required />
          </label>
          <button type="submit" className="btn-primary" disabled={estado === "enviando"}>
            {estado === "enviando" ? "Enviando..." : "Confirmar agendamento"}
          </button>
        </form>
        {dados.lat != null && dados.lng != null && <BeautyMiniMap lat={dados.lat} lng={dados.lng} />}
        {dados.bookingRulesText && <p className="sc-pub-em-breve" style={{ marginTop: 14 }}>{dados.bookingRulesText}</p>}
      </div>
    </div>
  );
}
