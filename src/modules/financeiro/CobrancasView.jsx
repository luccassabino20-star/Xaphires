import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useToast } from "../../state/ToastContext.jsx";
import { translateError } from "../../utils/errors.js";
import { normalizeLanguage } from "../../i18n/locale.js";
import { formatCents } from "./dinheiro.js";
import * as api from "../../state/api.js";
import { whatsappLink } from "../../utils/contact.js";
import SearchSelect from "./SearchSelect.jsx";
import NovaCobrancaModal from "./NovaCobrancaModal.jsx";
import CobrancaConfigView from "./CobrancaConfigView.jsx";

const METODOS = ["pix", "boleto", "card"];
const STATUS_FILTRO = ["pending", "atrasado", "paid", "canceled", "refunded"];

// Aba Cobranças (Faturamento): cada empresa emite Pix/boleto/cartão para os
// PRÓPRIOS clientes dela (financeiro_contatos) - não é o billing de assinatura
// do Xaphires. Duas sub-abas internas (Dashboard/Emissão e Configurações),
// mesmo espírito de CadastrosView.jsx: a divisão vive dentro da tela, não na
// sidebar (que já tem "Cobranças" como um item só).
export default function CobrancasView() {
  const { t, i18n } = useTranslation();
  const lang = normalizeLanguage(i18n.language);
  const showToast = useToast();

  const [subaba, setSubaba] = useState("dashboard");
  const [contatos, setContatos] = useState([]);
  const [gatewayProvider, setGatewayProvider] = useState("fake");
  const [cobrancas, setCobrancas] = useState([]);
  const [kpis, setKpis] = useState(null);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState("");
  const [modalAberto, setModalAberto] = useState(false);

  const [fContato, setFContato] = useState("");
  const [fMetodo, setFMetodo] = useState("");
  const [fStatus, setFStatus] = useState("");
  const [fDe, setFDe] = useState("");
  const [fAte, setFAte] = useState("");

  async function carregarBase() {
    try {
      const [cts, gw] = await Promise.all([api.finListContatos(), api.finGetGatewayConfig()]);
      setContatos(cts);
      setGatewayProvider(gw.provider);
    } catch (err) {
      setErro(translateError(err, t));
    }
  }

  async function carregarLista() {
    setCarregando(true);
    try {
      const [lista, k] = await Promise.all([
        api.finListCobrancas({ contatoId: fContato, metodo: fMetodo, status: fStatus, de: fDe, ate: fAte }),
        api.finGetKpisCobrancas(),
      ]);
      setCobrancas(lista);
      setKpis(k);
      setErro("");
    } catch (err) {
      setErro(translateError(err, t));
    } finally {
      setCarregando(false);
    }
  }

  useEffect(() => {
    carregarBase();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    carregarLista();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fContato, fMetodo, fStatus, fDe, fAte]);

  const contatoById = useMemo(() => Object.fromEntries(contatos.map((c) => [c.id, c])), [contatos]);
  const opcoesContato = useMemo(() => contatos.map((c) => ({ id: c.id, label: c.nome })), [contatos]);

  async function cancelar(id) {
    if (!confirm(t("financeiro.cobrancas.confirmCancelar"))) return;
    try {
      await api.finCancelarCobranca(id);
      showToast(t("financeiro.cobrancas.canceladaToast"));
      carregarLista();
    } catch (err) {
      showToast(translateError(err, t));
    }
  }

  async function baixarManual(id) {
    if (!confirm(t("financeiro.cobrancas.confirmBaixar"))) return;
    try {
      await api.finBaixarCobranca(id);
      showToast(t("financeiro.cobrancas.baixadaToast"));
      carregarLista();
    } catch (err) {
      showToast(translateError(err, t));
    }
  }

  // Só existe pro provedor simulado (o servidor responde 404 com qualquer
  // outro) - equivalente ao "confirmar" do billing de assinatura em desenvolvimento.
  async function devConfirmar(id) {
    try {
      await api.finDevConfirmarCobranca(id);
      showToast(t("financeiro.cobrancas.baixadaToast"));
      carregarLista();
    } catch (err) {
      showToast(translateError(err, t));
    }
  }

  function copiarPix(payload) {
    navigator.clipboard?.writeText(payload).then(
      () => showToast(t("financeiro.cobrancas.pixCopiado")),
      () => {}
    );
  }

  // A mensagem da régua é montada no servidor (tem o valor com multa/juros já
  // aplicados e o template configurado) - aqui só abre o link, nunca envia
  // sozinho: quem manda é a pessoa, clicando.
  async function enviarWhatsapp(c) {
    try {
      const { mensagem } = await api.finGetMensagemCobranca(c.id);
      const contato = contatoById[c.contato_id];
      if (!contato?.telefone) {
        showToast(t("financeiro.cobrancas.semTelefone"));
        return;
      }
      window.open(whatsappLink(contato.telefone, mensagem), "_blank", "noopener,noreferrer");
    } catch (err) {
      showToast(translateError(err, t));
    }
  }

  return (
    <div className="fin-cobrancas">
      <div className="fin-cobr-subtabs">
        <button type="button" className={"fin-cobr-subtab" + (subaba === "dashboard" ? " active" : "")} onClick={() => setSubaba("dashboard")}>
          {t("financeiro.cobrancas.subaba.dashboard")}
        </button>
        <button type="button" className={"fin-cobr-subtab" + (subaba === "config" ? " active" : "")} onClick={() => setSubaba("config")}>
          {t("financeiro.cobrancas.subaba.config")}
        </button>
      </div>

      {subaba === "config" ? (
        <CobrancaConfigView />
      ) : (
        <>
          {kpis && (
            <div className="fin-kpis">
              <div className="fin-kpi fin-kpi-recebido">
                <span className="fin-kpi-label">{t("financeiro.cobrancas.kpi.recebido")}</span>
                <span className="fin-kpi-value">{formatCents(kpis.recebidoMesCents, lang)}</span>
              </div>
              <div className="fin-kpi fin-kpi-areceber">
                <span className="fin-kpi-label">{t("financeiro.cobrancas.kpi.aReceber")}</span>
                <span className="fin-kpi-value">{formatCents(kpis.aReceberCents, lang)}</span>
              </div>
              <div className="fin-kpi fin-kpi-atrasado">
                <span className="fin-kpi-label">{t("financeiro.cobrancas.kpi.atrasado")}</span>
                <span className="fin-kpi-value">{formatCents(kpis.atrasadoCents, lang)}</span>
                {kpis.atrasadoCents > 0 && <span className="fin-cobr-kpi-alerta">{t("financeiro.cobrancas.kpi.atencao")}</span>}
              </div>
              <div className="fin-kpi fin-kpi-saldo">
                <span className="fin-kpi-label">{t("financeiro.cobrancas.kpi.saldo")}</span>
                <span className="fin-kpi-value">{kpis.saldoDisponivelCents == null ? "—" : formatCents(kpis.saldoDisponivelCents, lang)}</span>
                <button type="button" className="btn-secondary btn-small" disabled title={t("financeiro.cobrancas.kpi.saqueIndisponivel")}>
                  {t("financeiro.cobrancas.kpi.solicitarSaque")}
                </button>
              </div>
            </div>
          )}

          <div className="fin-toolbar">
            <div className="fin-toolbar-ss">
              <SearchSelect
                value={fContato}
                onChange={setFContato}
                options={opcoesContato}
                allLabel={t("financeiro.cobrancas.filtro.todosClientes")}
                placeholder={t("financeiro.cobrancas.filtro.cliente")}
              />
            </div>
            <select value={fMetodo} onChange={(e) => setFMetodo(e.target.value)}>
              <option value="">{t("financeiro.cobrancas.filtro.todosMetodos")}</option>
              {METODOS.map((m) => (
                <option key={m} value={m}>{t(`financeiro.cobrancas.metodo.${m}`)}</option>
              ))}
            </select>
            <select value={fStatus} onChange={(e) => setFStatus(e.target.value)}>
              <option value="">{t("financeiro.cobrancas.filtro.todosStatus")}</option>
              {STATUS_FILTRO.map((s) => (
                <option key={s} value={s}>{t(`financeiro.cobrancas.status.${s}`)}</option>
              ))}
            </select>
            <label className="fin-filtro-data">
              {t("financeiro.periodo.de")}
              <input type="date" value={fDe} onChange={(e) => setFDe(e.target.value)} />
            </label>
            <label className="fin-filtro-data">
              {t("financeiro.periodo.ate")}
              <input type="date" value={fAte} onChange={(e) => setFAte(e.target.value)} />
            </label>
            <button type="button" className="btn-primary" onClick={() => setModalAberto(true)}>
              {t("financeiro.cobrancas.nova")}
            </button>
          </div>

          {erro && <div className="fin-error">{erro}</div>}

          {carregando ? (
            <div className="fin-loading">{t("common.loading")}</div>
          ) : cobrancas.length === 0 ? (
            <div className="fin-empty">{t("financeiro.cobrancas.vazio")}</div>
          ) : (
            <div className="fin-table-wrap">
              <table className="fin-table">
                <thead>
                  <tr>
                    <th>{t("financeiro.cobrancas.col.numero")}</th>
                    <th>{t("financeiro.cobrancas.col.cliente")}</th>
                    <th>{t("financeiro.cobrancas.col.descricao")}</th>
                    <th>{t("financeiro.cobrancas.col.metodo")}</th>
                    <th className="fin-num">{t("financeiro.cobrancas.col.valor")}</th>
                    <th>{t("financeiro.cobrancas.col.vencimento")}</th>
                    <th>{t("financeiro.cobrancas.col.status")}</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {cobrancas.map((c) => (
                    <tr key={c.id}>
                      <td>{c.numero}</td>
                      <td>{c.contato_nome}</td>
                      <td>{c.descricao}</td>
                      <td>
                        <span className={"fin-cobr-badge-metodo fin-cobr-metodo-" + c.metodo}>{t(`financeiro.cobrancas.metodo.${c.metodo}`)}</span>
                      </td>
                      <td className="fin-num">
                        {formatCents(c.valorAtualizadoCents, lang)}
                        {c.valorAtualizadoCents !== c.valor_cents && (
                          <span className="fin-cobr-valor-original" title={t("financeiro.cobrancas.valorOriginalHint")}>
                            {" "}({formatCents(c.valor_cents, lang)})
                          </span>
                        )}
                      </td>
                      <td>{c.due.split("-").reverse().join("/")}</td>
                      <td>
                        <StatusBadge cobranca={c} t={t} />
                      </td>
                      <td className="fin-row-actions">
                        {c.status === "pending" && c.metodo === "pix" && c.pix_payload && (
                          <button type="button" className="btn-ghost btn-small" onClick={() => copiarPix(c.pix_payload)}>
                            {t("financeiro.cobrancas.acao.copiarPix")}
                          </button>
                        )}
                        {c.status === "pending" && c.metodo === "boleto" && c.boleto_pdf_url && (
                          <a className="btn-ghost btn-small" href={c.boleto_pdf_url} target="_blank" rel="noopener noreferrer">
                            {t("financeiro.cobrancas.acao.baixarBoleto")}
                          </a>
                        )}
                        {c.status === "pending" && c.estagio && (
                          <button type="button" className="btn-ghost btn-small" onClick={() => enviarWhatsapp(c)}>
                            {t("financeiro.cobrancas.acao.whatsapp")}
                          </button>
                        )}
                        {c.status === "pending" && (
                          <button type="button" className="btn-ghost btn-small" onClick={() => baixarManual(c.id)}>
                            {t("financeiro.cobrancas.acao.baixarManual")}
                          </button>
                        )}
                        {c.status === "pending" && c.provider === "fake" && (
                          <button
                            type="button"
                            className="btn-ghost btn-small"
                            onClick={() => devConfirmar(c.id)}
                            title={t("financeiro.cobrancas.acao.devConfirmarHint")}
                          >
                            {t("financeiro.cobrancas.acao.devConfirmar")}
                          </button>
                        )}
                        {c.status === "pending" && (
                          <button type="button" className="btn-ghost btn-small fin-acao-perigo" onClick={() => cancelar(c.id)}>
                            {t("financeiro.cobrancas.acao.cancelar")}
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      {modalAberto && (
        <NovaCobrancaModal contatos={contatos} gatewayProvider={gatewayProvider} onClose={() => setModalAberto(false)} onCreated={carregarLista} />
      )}
    </div>
  );
}

function StatusBadge({ cobranca, t }) {
  const chave = cobranca.status === "pending" ? (cobranca.estagio === "atrasado" ? "atrasado" : "pending") : cobranca.status;
  return <span className={"fin-cobr-badge-status fin-cobr-status-" + chave}>{t(`financeiro.cobrancas.status.${chave}`)}</span>;
}
