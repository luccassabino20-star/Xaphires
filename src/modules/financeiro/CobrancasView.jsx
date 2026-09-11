import { useEffect, useMemo, useRef, useState } from "react";
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

function IconKebab({ size = 16 }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} fill="currentColor">
      <circle cx="12" cy="5" r="2" /><circle cx="12" cy="12" r="2" /><circle cx="12" cy="19" r="2" />
    </svg>
  );
}
function IconBolt({ size = 12 }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} fill="currentColor">
      <path d="M13 2 3 14h7l-1 8 11-14h-8z" />
    </svg>
  );
}
function IconBarcode({ size = 12 }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
      <path d="M4 5v14M8 5v14M11 5v14M13 5v14M17 5v14M20 5v14" />
    </svg>
  );
}
function IconCard({ size = 12 }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <rect x="2.5" y="5" width="19" height="14" rx="2.5" /><path d="M2.5 10h19" />
    </svg>
  );
}
const ICONE_METODO = { pix: IconBolt, boleto: IconBarcode, card: IconCard };

function IconTrash({ size = 20 }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 7h16M9 7V4h6v3m-8 0 1 13h10l1-13" />
    </svg>
  );
}

// Aba Cobranças (Faturamento): cada empresa emite Pix/boleto/cartão para os
// PRÓPRIOS clientes dela (financeiro_contatos) - não é o billing de assinatura
// do Xaphires. Duas sub-abas internas (Dashboard/Emissão e Configurações),
// mesmo espírito de CadastrosView.jsx: a divisão vive dentro da tela, não na
// sidebar (que já tem "Cobranças" como um item só).
export default function CobrancasView({ contatoIdInicial, descricaoInicial, valorInicial, onPrefillConsumido, onVerTitulo }) {
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
  const [prefillContatoId, setPrefillContatoId] = useState(null);
  const [prefillDescricao, setPrefillDescricao] = useState("");
  const [prefillValor, setPrefillValor] = useState("");
  const [openMenuId, setOpenMenuId] = useState(null);
  const menuAnchorRefs = useRef({});
  const [excluindoAlvo, setExcluindoAlvo] = useState(null); // cobrança pendente de confirmação de exclusão
  const [excluindoEnviando, setExcluindoEnviando] = useState(false);

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
  // Atalho "Emitir Cobrança Direta" (Clientes & Fornecedores): quem chegou aqui já
  // escolheu o contato lá, então abre o modal pronto em vez de fazer escolher de
  // novo. onPrefillConsumido limpa o estado no FinanceiroModule para o modal não
  // reabrir sozinho numa próxima troca de aba.
  useEffect(() => {
    if (!contatoIdInicial) return;
    setSubaba("dashboard");
    setPrefillContatoId(contatoIdInicial);
    setPrefillDescricao(descricaoInicial || "");
    setPrefillValor(valorInicial || "");
    setModalAberto(true);
    onPrefillConsumido?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contatoIdInicial]);
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

  // Um clique só, que faz a coisa certa pro método: Pix copia a chave (não tem
  // link, é copia-e-cola), boleto/cartão abrem o link numa aba nova. Sem link/
  // payload disponível (cobrança já paga que não guardou, ou provedor que não
  // devolveu), o item do menu some (ver CobrancaAcoesMenu).
  function linkPagamentoDisponivel(c) {
    if (c.metodo === "pix" && c.pix_payload) return true;
    if (c.metodo === "boleto" && c.boleto_pdf_url) return true;
    if (c.metodo === "card" && c.checkout_url) return true;
    return false;
  }
  function abrirLinkPagamento(c) {
    if (c.metodo === "pix" && c.pix_payload) return copiarPix(c.pix_payload);
    const url = c.metodo === "boleto" ? c.boleto_pdf_url : c.checkout_url;
    if (url) window.open(url, "_blank", "noopener,noreferrer");
  }

  // Abre o título vinculado na aba Títulos (ver FinanceiroModule.jsx) - toda
  // cobrança nova já nasce com um título (ver cobrancaRepo.insertCobranca);
  // só uma cobrança criada antes desse vínculo existir ficaria sem.
  function verTitulo(c) {
    if (!c.lancamento_id) { showToast(t("financeiro.cobrancas.semTituloVinculado")); return; }
    onVerTitulo?.(c.lancamento_id);
  }

  function pedirExclusao(c) {
    setOpenMenuId(null);
    setExcluindoAlvo(c);
  }
  async function confirmarExclusao() {
    if (!excluindoAlvo) return;
    setExcluindoEnviando(true);
    try {
      await api.finExcluirCobranca(excluindoAlvo.id);
      showToast(t("financeiro.cobrancas.excluidaToast"));
      setExcluindoAlvo(null);
      carregarLista();
    } catch (err) {
      showToast(translateError(err, t));
    } finally {
      setExcluindoEnviando(false);
    }
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
                  {cobrancas.map((c) => {
                    const IconeMetodo = ICONE_METODO[c.metodo];
                    return (
                    <tr key={c.id}>
                      <td>{c.numero}</td>
                      <td>{c.contato_nome}</td>
                      <td>{c.descricao}</td>
                      <td>
                        <span className={"fin-cobr-badge-metodo fin-cobr-metodo-" + c.metodo}>
                          {IconeMetodo && <IconeMetodo />} {t(`financeiro.cobrancas.metodo.${c.metodo}`)}
                        </span>
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
                      <td className="fin-cell-acoes">
                        <button
                          type="button"
                          ref={(el) => { menuAnchorRefs.current[c.id] = el; }}
                          className="row-menu-btn"
                          onClick={() => setOpenMenuId((cur) => (cur === c.id ? null : c.id))}
                          aria-label={t("financeiro.cobrancas.acao.acoesLinha")}
                        >
                          <IconKebab />
                        </button>
                        {openMenuId === c.id && (
                          <CobrancaAcoesMenu
                            anchorEl={menuAnchorRefs.current[c.id]}
                            cobranca={c}
                            t={t}
                            temLink={linkPagamentoDisponivel(c)}
                            onClose={() => setOpenMenuId(null)}
                            onVisualizarLink={() => abrirLinkPagamento(c)}
                            onVerTitulo={() => verTitulo(c)}
                            onWhatsapp={c.status === "pending" && c.estagio ? () => enviarWhatsapp(c) : null}
                            onBaixarManual={c.status === "pending" ? () => baixarManual(c.id) : null}
                            onDevConfirmar={c.status === "pending" && c.provider === "fake" ? () => devConfirmar(c.id) : null}
                            onCancelar={c.status === "pending" ? () => cancelar(c.id) : null}
                            onExcluir={() => pedirExclusao(c)}
                          />
                        )}
                      </td>
                    </tr>
                  );})}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      {modalAberto && (
        <NovaCobrancaModal
          contatos={contatos}
          gatewayProvider={gatewayProvider}
          contatoIdInicial={prefillContatoId}
          descricaoInicial={prefillDescricao}
          valorInicial={prefillValor}
          onClose={() => { setModalAberto(false); setPrefillContatoId(null); setPrefillDescricao(""); setPrefillValor(""); }}
          onCreated={carregarLista}
        />
      )}

      {excluindoAlvo && (
        <ExcluirCobrancaModal
          enviando={excluindoEnviando}
          onCancelar={() => setExcluindoAlvo(null)}
          onConfirmar={confirmarExclusao}
        />
      )}
    </div>
  );
}

function StatusBadge({ cobranca, t }) {
  const chave = cobranca.status === "pending" ? (cobranca.estagio === "atrasado" ? "atrasado" : "pending") : cobranca.status;
  return <span className={"fin-cobr-badge-status fin-cobr-status-" + chave}>{t(`financeiro.cobrancas.status.${chave}`)}</span>;
}

// Menu "..." por linha - mesma técnica position:fixed do resto do módulo
// (ClasseActionsMenu/ContatoActionsMenu): calculado do getBoundingClientRect do
// botão-âncora, fecha em clique fora, Esc, ou scroll de QUALQUER ancestral
// (captura), porque quem rola a lista é o painel externo .fin-body, não um
// wrapper interno.
function CobrancaAcoesMenu({
  anchorEl, cobranca, t, temLink, onClose,
  onVisualizarLink, onVerTitulo, onWhatsapp, onBaixarManual, onDevConfirmar, onCancelar, onExcluir,
}) {
  const ref = useRef(null);
  const [coords, setCoords] = useState(null);

  useEffect(() => {
    if (!anchorEl) return;
    const rect = anchorEl.getBoundingClientRect();
    // O menu tem 7 itens no máximo (~260px) - numa linha perto do fim da
    // tabela (a última linha da página, por exemplo) abrir sempre pra baixo
    // cortava os últimos itens (Cancelar/Excluir) para fora da viewport, sem
    // scroll que os trouxesse de volta (o menu é position:fixed). Sem espaço
    // embaixo mas com espaço em cima, abre pra cima em vez disso.
    const ALTURA_ESTIMADA = 260;
    const espacoAbaixo = window.innerHeight - rect.bottom;
    const abrirParaCima = espacoAbaixo < ALTURA_ESTIMADA && rect.top > espacoAbaixo;
    setCoords(
      // .dropdown (index.css) nasce pensado pra position:absolute com
      // "top: 100%" fixo no seletor de base - aqui virou position:fixed, mas
      // aquele top da classe continua valendo em cima do que a lógica abaixo
      // NÃO setar. Sem o "auto" explícito no eixo que este modo não usa, os
      // dois (o da classe e o daqui) competiam e a caixa colapsava a ~0px de
      // altura, com os itens ainda ocupando lugar mas fora da área clicável.
      abrirParaCima
        ? { top: "auto", bottom: window.innerHeight - rect.top + 4, right: window.innerWidth - rect.right }
        : { top: rect.bottom + 4, bottom: "auto", right: window.innerWidth - rect.right }
    );
  }, [anchorEl]);

  useEffect(() => {
    function handleClick(e) {
      if (ref.current && !ref.current.contains(e.target) && !anchorEl?.contains(e.target)) onClose();
    }
    function handleKey(e) { if (e.key === "Escape") onClose(); }
    document.addEventListener("mousedown", handleClick);
    document.addEventListener("keydown", handleKey);
    document.addEventListener("scroll", onClose, true);
    return () => {
      document.removeEventListener("mousedown", handleClick);
      document.removeEventListener("keydown", handleKey);
      document.removeEventListener("scroll", onClose, true);
    };
  }, [onClose, anchorEl]);

  if (!coords) return null;

  function item(onClick, label, extra) {
    if (!onClick) return null;
    return <div className={"dropdown-item" + (extra || "")} onClick={() => { onClose(); onClick(); }}>{label}</div>;
  }

  return (
    <div className="dropdown" ref={ref} style={{ position: "fixed", ...coords }}>
      {item(temLink ? onVisualizarLink : null, t("financeiro.cobrancas.acao.visualizarLink"))}
      {item(onVerTitulo, t("financeiro.cobrancas.acao.verTitulo"))}
      {(onWhatsapp || onBaixarManual || onDevConfirmar) && <div className="dropdown-divider" />}
      {item(onWhatsapp, t("financeiro.cobrancas.acao.whatsapp"))}
      {item(onBaixarManual, t("financeiro.cobrancas.acao.baixarManual"))}
      {item(onDevConfirmar, t("financeiro.cobrancas.acao.devConfirmar"))}
      <div className="dropdown-divider" />
      {item(onCancelar, t("financeiro.cobrancas.acao.cancelar"))}
      {item(onExcluir, t("financeiro.cobrancas.acao.excluir"), " danger")}
    </div>
  );
}

// Modal de confirmação de exclusão - pedido explícito de não usar
// window.confirm() aqui (a régua de baixa/cancelamento já usa, mas excluir é
// destrutivo e cascade num título vinculado, merece o peso de um modal de
// verdade). Esqueleto pequeno (.modal-narrow), mesmo botão-X de todo modal.
function ExcluirCobrancaModal({ enviando, onCancelar, onConfirmar }) {
  const { t } = useTranslation();
  return (
    <div className="modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) onCancelar(); }}>
      <div className="modal modal-narrow cobr-confirm">
        <button className="modal-close" onClick={onCancelar} aria-label={t("common.close")}>&times;</button>
        <span className="cobr-confirm-icone"><IconTrash /></span>
        <h2 className="cobr-confirm-titulo">{t("financeiro.cobrancas.confirmExcluirTitulo")}</h2>
        <p className="cobr-confirm-texto">{t("financeiro.cobrancas.confirmExcluirTexto")}</p>
        <div className="cobr-form-footer">
          <button type="button" className="recurrence-btn-ghost" onClick={onCancelar}>{t("common.cancel")}</button>
          <button type="button" className="btn-danger" onClick={onConfirmar} disabled={enviando}>
            {enviando ? t("common.loading") : t("financeiro.cobrancas.acao.excluir")}
          </button>
        </div>
      </div>
    </div>
  );
}
