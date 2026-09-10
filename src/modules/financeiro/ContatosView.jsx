import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { translateError } from "../../utils/errors.js";
import * as api from "../../state/api.js";
import { normalizeLanguage } from "../../i18n/locale.js";
import { formatarDoc } from "../../utils/doc.js";
import NovoContatoModal from "./NovoContatoModal.jsx";
import ContatoHistoricoModal from "./ContatoHistoricoModal.jsx";

function IconSearch({ size = 15 }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
      <circle cx="11" cy="11" r="7" />
      <path d="m21 21-4.3-4.3" />
    </svg>
  );
}
function IconPlus({ size = 14 }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round">
      <path d="M12 5v14M5 12h14" />
    </svg>
  );
}
function IconDownload({ size = 14 }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 3v12m0 0-4-4m4 4 4-4" />
      <path d="M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2" />
    </svg>
  );
}
function IconKebab({ size = 16 }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} fill="currentColor">
      <circle cx="12" cy="5" r="2" /><circle cx="12" cy="12" r="2" /><circle cx="12" cy="19" r="2" />
    </svg>
  );
}

const FILTROS_TIPO = ["todos", "cliente", "fornecedor", "ambos"];
const FILTROS_STATUS = ["todos", "ativo", "inativo"];

// Central de Clientes/Fornecedores (IRES OS): o formulário de 12+ campos que
// vivia sempre exposto na tela virou o modal NovoContatoModal - aqui só ficam o
// header com contador, a busca/segmentação e a grade. Mesmo espírito das últimas
// reformas do módulo (Nova Cobrança, Cartões arquivados, Rotinas automáticas).
export default function ContatosView({ contatos, onCriar, onEditar, onExcluir, onEmitirCobranca }) {
  const { t, i18n } = useTranslation();
  const lang = normalizeLanguage(i18n.language);
  const [busca, setBusca] = useState("");
  const [filtroTipo, setFiltroTipo] = useState("todos");
  const [filtroStatus, setFiltroStatus] = useState("todos");
  const [modalAberto, setModalAberto] = useState(false);
  const [editando, setEditando] = useState(null); // contato em edição, ou null para "novo"
  const [historico, setHistorico] = useState(null); // contato aberto no histórico
  const [openMenuId, setOpenMenuId] = useState(null);
  const [exportAberto, setExportAberto] = useState(false);
  const menuAnchorRefs = useRef({});
  const exportRef = useRef(null);

  useEffect(() => {
    if (!exportAberto) return;
    function onClick(e) {
      if (exportRef.current && !exportRef.current.contains(e.target)) setExportAberto(false);
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [exportAberto]);

  const rotuloTipo = (tp) => (tp === "ambos" ? t("financeiro.contatos.tipoParceiro") : t(`financeiro.cad.tipo_${tp}`));

  const visiveis = useMemo(() => {
    const termo = busca.trim().toLowerCase();
    return contatos.filter((c) => {
      if (filtroTipo !== "todos" && c.tipo !== filtroTipo) return false;
      if (filtroStatus === "ativo" && !c.ativo) return false;
      if (filtroStatus === "inativo" && c.ativo) return false;
      if (!termo) return true;
      return (
        c.nome?.toLowerCase().includes(termo) ||
        c.doc?.toLowerCase().includes(termo) ||
        c.email?.toLowerCase().includes(termo)
      );
    });
  }, [contatos, busca, filtroTipo, filtroStatus]);

  function abrirNovo() {
    setEditando(null);
    setModalAberto(true);
  }
  function abrirEdicao(c) {
    setOpenMenuId(null);
    setEditando(c);
    setModalAberto(true);
  }
  async function excluir(c) {
    setOpenMenuId(null);
    if (!confirm(t("financeiro.contatos.confirmExcluir"))) return;
    try {
      await onExcluir(c.id);
    } catch (e) {
      alert(translateError(e, t));
    }
  }
  async function exportar(formato) {
    setExportAberto(false);
    try {
      await api.finExportContatos(formato, lang);
    } catch (e) {
      alert(translateError(e, t));
    }
  }

  return (
    <div className="contatos-view">
      <div className="contatos-header">
        <div>
          <h2 className="contatos-titulo">{t("financeiro.contatos.titulo")}</h2>
          <p className="contatos-contador">{t("financeiro.contatos.contador", { count: contatos.length })}</p>
        </div>
        <div className="contatos-header-acoes">
          <div className="contatos-export" ref={exportRef}>
            <button type="button" className="btn-secondary btn-small" onClick={() => setExportAberto((v) => !v)}>
              <IconDownload /> {t("financeiro.contatos.exportar")}
            </button>
            {exportAberto && (
              <div className="dropdown">
                <div className="dropdown-item" onClick={() => exportar("csv")}>{t("financeiro.contatos.exportarCsv")}</div>
                <div className="dropdown-item" onClick={() => exportar("pdf")}>{t("financeiro.contatos.exportarPdf")}</div>
              </div>
            )}
          </div>
          <button type="button" className="recurrence-btn-primary" onClick={abrirNovo}>
            <IconPlus /> {t("financeiro.contatos.novoCadastro")}
          </button>
        </div>
      </div>

      <div className="contatos-toolbar">
        <label className="contatos-busca">
          <IconSearch />
          <input type="text" value={busca} onChange={(e) => setBusca(e.target.value)} placeholder={t("financeiro.contatos.buscarPlaceholder")} />
        </label>
        <div className="timing-toggle contatos-segmented">
          {FILTROS_TIPO.map((f) => (
            <button key={f} type="button" className={"timing-toggle-btn" + (filtroTipo === f ? " active" : "")} onClick={() => setFiltroTipo(f)}>
              {t(`financeiro.contatos.filtro${f === "todos" ? "Todos" : f === "cliente" ? "Clientes" : f === "fornecedor" ? "Fornecedores" : "Parceiros"}`)}
            </button>
          ))}
        </div>
        <div className="timing-toggle contatos-status-pills">
          {FILTROS_STATUS.map((f) => (
            <button key={f} type="button" className={"timing-toggle-btn" + (filtroStatus === f ? " active" : "")} onClick={() => setFiltroStatus(f)}>
              {t(`financeiro.contatos.status${f === "todos" ? "Todos" : f === "ativo" ? "Ativos" : "Inativos"}`)}
            </button>
          ))}
        </div>
      </div>

      <div className="contatos-table-wrap">
        <table className="fin-table contatos-table">
          <thead>
            <tr>
              <th>{t("financeiro.contatos.colContato")}</th>
              <th>{t("financeiro.contatos.colDocumento")}</th>
              <th>{t("financeiro.contatos.colTipo")}</th>
              <th>{t("financeiro.contatos.colCidade")}</th>
              <th>{t("financeiro.contatos.colStatus")}</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {visiveis.length === 0 ? (
              <tr><td colSpan={6} className="fin-empty">{t("financeiro.contatos.vazio")}</td></tr>
            ) : (
              visiveis.map((c) => (
                <tr key={c.id} className={!c.ativo ? "fin-row-pago" : ""}>
                  <td>
                    <div className="contatos-cell-contato">
                      <span className="contatos-cell-nome">{c.nome}</span>
                      {c.email && <span className="contatos-cell-email">{c.email}</span>}
                    </div>
                  </td>
                  <td><span className="contatos-badge-doc">{c.doc ? formatarDoc(c.doc) : "-"}</span></td>
                  <td><span className={"contatos-badge-tipo contatos-badge-tipo-" + (c.tipo === "ambos" ? "parceiro" : c.tipo)}>{rotuloTipo(c.tipo)}</span></td>
                  <td>{c.cidade ? `${c.cidade}${c.uf ? " - " + c.uf : ""}` : "-"}</td>
                  <td><span className={"contatos-status-pill " + (c.ativo ? "contatos-status-ativo" : "contatos-status-inativo")}>{c.ativo ? t("financeiro.cad.ativo") : t("financeiro.cad.inativo")}</span></td>
                  <td className="contatos-cell-acoes">
                    <button
                      type="button"
                      ref={(el) => { menuAnchorRefs.current[c.id] = el; }}
                      className="row-menu-btn"
                      onClick={() => setOpenMenuId((cur) => (cur === c.id ? null : c.id))}
                      aria-label={t("financeiro.contatos.acoesLinha")}
                    >
                      <IconKebab />
                    </button>
                    {openMenuId === c.id && (
                      <ContatoActionsMenu
                        anchorEl={menuAnchorRefs.current[c.id]}
                        ativo={!!c.ativo}
                        onClose={() => setOpenMenuId(null)}
                        onEditar={() => abrirEdicao(c)}
                        onEmitirCobranca={() => { setOpenMenuId(null); onEmitirCobranca(c.id); }}
                        onHistorico={() => { setOpenMenuId(null); setHistorico(c); }}
                        onToggleAtivo={async () => {
                          setOpenMenuId(null);
                          try { await onEditar(c.id, { ativo: c.ativo ? 0 : 1 }); }
                          catch (e) { alert(translateError(e, t)); }
                        }}
                        onExcluir={() => excluir(c)}
                        t={t}
                      />
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {modalAberto && (
        <NovoContatoModal
          contato={editando}
          onClose={() => setModalAberto(false)}
          onSalvar={async (dados) => {
            if (editando) await onEditar(editando.id, dados);
            else await onCriar(dados);
            setModalAberto(false);
          }}
        />
      )}

      {historico && <ContatoHistoricoModal contato={historico} onClose={() => setHistorico(null)} />}
    </div>
  );
}

// Menu de ações da linha - mesma técnica de UsersPanel.jsx (UserActionsMenu):
// position: fixed calculado do getBoundingClientRect do botão-âncora, sem
// portal, porque o botão vive dentro da grade rolável (.contatos-table-wrap) e
// um position:absolute normal seria cortado pelo overflow dela.
function ContatoActionsMenu({ anchorEl, ativo, onClose, onEditar, onEmitirCobranca, onHistorico, onToggleAtivo, onExcluir, t }) {
  const ref = useRef(null);
  const [coords, setCoords] = useState(null);

  useEffect(() => {
    if (!anchorEl) return;
    const rect = anchorEl.getBoundingClientRect();
    setCoords({ top: rect.bottom + 4, right: window.innerWidth - rect.right });
  }, [anchorEl]);

  useEffect(() => {
    function handleClick(e) {
      if (ref.current && !ref.current.contains(e.target) && !anchorEl?.contains(e.target)) onClose();
    }
    const scrollParent = anchorEl?.closest(".contatos-table-wrap");
    document.addEventListener("mousedown", handleClick);
    scrollParent?.addEventListener("scroll", onClose);
    return () => {
      document.removeEventListener("mousedown", handleClick);
      scrollParent?.removeEventListener("scroll", onClose);
    };
  }, [onClose, anchorEl]);

  if (!coords) return null;

  return (
    <div className="dropdown" ref={ref} style={{ position: "fixed", top: coords.top, right: coords.right }}>
      <div className="dropdown-item" onClick={onEditar}>{t("financeiro.contatos.menuEditar")}</div>
      <div className="dropdown-item" onClick={onEmitirCobranca}>{t("financeiro.contatos.menuEmitirCobranca")}</div>
      <div className="dropdown-item" onClick={onHistorico}>{t("financeiro.contatos.menuHistorico")}</div>
      <div className="dropdown-divider" />
      <div className="dropdown-item" onClick={onToggleAtivo}>{ativo ? t("financeiro.cad.desativar") : t("financeiro.cad.ativar")}</div>
      <div className="dropdown-item danger" onClick={onExcluir}>{t("financeiro.contatos.menuExcluir")}</div>
    </div>
  );
}
