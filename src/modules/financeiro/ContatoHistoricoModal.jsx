import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { translateError } from "../../utils/errors.js";
import { normalizeLanguage } from "../../i18n/locale.js";
import { formatCents } from "./dinheiro.js";
import * as api from "../../state/api.js";

function IconHistory({ size = 20 }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 12a9 9 0 1 0 3-6.7" />
      <path d="M3 4v4h4" />
      <path d="M12 7v5l3.5 2" />
    </svg>
  );
}

// "Ver Histórico / Transações" do menu de ações: o rastro comercial de um
// contato hoje é a cobrança (GET /financeiro/cobrancas já filtra por
// contatoId) - lançamento avulso sem cobrança fica fora deste escopo.
export default function ContatoHistoricoModal({ contato, onClose }) {
  const { t, i18n } = useTranslation();
  const lang = normalizeLanguage(i18n.language);
  const [cobrancas, setCobrancas] = useState([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState("");

  useEffect(() => {
    let cancelado = false;
    (async () => {
      try {
        const lista = await api.finListCobrancas({ contatoId: contato.id });
        if (!cancelado) setCobrancas(lista);
      } catch (err) {
        if (!cancelado) setErro(translateError(err, t));
      } finally {
        if (!cancelado) setCarregando(false);
      }
    })();
    return () => { cancelado = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contato.id]);

  return (
    <div className="modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal contato-form-modal">
        <button className="modal-close" onClick={onClose} aria-label={t("common.close")}>&times;</button>

        <div className="cobr-form-header">
          <span className="cobr-form-header-icon"><IconHistory size={20} /></span>
          <div>
            <h2 className="cobr-form-title">{t("financeiro.contatos.historico.titulo")}</h2>
            <p className="cobr-form-subtitle">{contato.nome}</p>
          </div>
        </div>

        {erro && <div className="fin-error">{erro}</div>}
        {carregando ? (
          <div className="fin-loading">{t("common.loading")}</div>
        ) : cobrancas.length === 0 ? (
          <p className="cobr-form-subtitle">{t("financeiro.contatos.historico.vazio")}</p>
        ) : (
          <div className="contatos-historico-lista">
            {cobrancas.map((c) => (
              <div className="contatos-historico-item" key={c.id}>
                <div className="contatos-historico-item-info">
                  <span className="contatos-historico-item-desc">{c.descricao || t(`financeiro.cobrancas.metodo.${c.metodo}`)}</span>
                  <span className="contatos-historico-item-data">{c.due.split("-").reverse().join("/")}</span>
                </div>
                <span className={"fin-cobr-badge-metodo fin-cobr-metodo-" + c.metodo}>{t(`financeiro.cobrancas.metodo.${c.metodo}`)}</span>
                <span className={"fin-cobr-badge-status fin-cobr-status-" + (c.status === "pending" && c.estagio === "atrasado" ? "atrasado" : c.status)}>
                  {t(`financeiro.cobrancas.status.${c.status === "pending" && c.estagio === "atrasado" ? "atrasado" : c.status}`)}
                </span>
                <span className="contatos-historico-item-valor">{formatCents(c.valorAtualizadoCents ?? c.valor_cents, lang)}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
