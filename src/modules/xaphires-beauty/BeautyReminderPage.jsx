import { useEffect, useState } from "react";
import * as api from "../../state/api.js";

const STATUS_TEXTO = { agendado: "Agendado", concluido: "Concluído", cancelado: "Cancelado" };

// Link de lembrete por agendamento (Fase 9) - o cliente confere data/hora/
// serviço do próprio atendimento, sem login e sem edição. Fora de tudo (sem
// AuthProvider, sem i18n), mesmo isolamento de BeautyPublicBookingPage.jsx:
// ferramenta de uso único, texto só em português.
export default function BeautyReminderPage({ slug }) {
  const [estado, setEstado] = useState("carregando"); // carregando | pronto | erro
  const [dados, setDados] = useState(null);
  const [erro, setErro] = useState("");

  useEffect(() => {
    document.body.classList.add("sc-pub-body");
    return () => document.body.classList.remove("sc-pub-body");
  }, []);

  useEffect(() => {
    api
      .xbPublicGetReminder(slug)
      .then((d) => {
        setDados(d);
        setEstado("pronto");
      })
      .catch((e) => {
        setErro(e.message || "Link inválido");
        setEstado("erro");
      });
  }, [slug]);

  if (estado === "carregando") {
    return (
      <div className="sc-pub">
        <div className="sc-pub-card">Carregando...</div>
      </div>
    );
  }
  if (estado === "erro") {
    return (
      <div className="sc-pub">
        <div className="sc-pub-card">
          <p className="sc-pub-erro">{erro}</p>
        </div>
      </div>
    );
  }

  const data = dados.startsAt.slice(0, 10).split("-").reverse().join("/");
  const hora = dados.startsAt.slice(11, 16);

  return (
    <div className="sc-pub">
      <div className="sc-pub-card">
        <h1 className="sc-pub-title">Seu agendamento</h1>
        <p className="sc-pub-sub">{dados.companyName}</p>
        <div className="sc-pub-campo">
          <span className="sc-pub-label">Serviço</span>
          <p style={{ margin: 0 }}>{dados.serviceName}</p>
        </div>
        <div className="sc-pub-campo">
          <span className="sc-pub-label">Data e horário</span>
          <p style={{ margin: 0 }}>{data} às {hora}</p>
        </div>
        {dados.staffName && (
          <div className="sc-pub-campo">
            <span className="sc-pub-label">Profissional</span>
            <p style={{ margin: 0 }}>{dados.staffName}</p>
          </div>
        )}
        <div className="sc-pub-campo">
          <span className="sc-pub-label">Situação</span>
          <p style={{ margin: 0 }}>{STATUS_TEXTO[dados.status] || dados.status}</p>
        </div>
      </div>
    </div>
  );
}
