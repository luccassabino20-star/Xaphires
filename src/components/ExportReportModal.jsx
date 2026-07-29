import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useUsers } from "../state/UsersContext.jsx";
import { useToast } from "../state/ToastContext.jsx";
import { translateError } from "../utils/errors.js";
import { normalizeLanguage } from "../i18n/locale.js";
import * as api from "../state/api.js";

// Os valores viajam para a API como estão: são os mesmos que `statusValido` aceita
// no servidor. Traduzir só o rótulo, e nunca o valor, evita a tabela de conversão
// que alguém esqueceria de atualizar dos dois lados.
const STATUS = [
  { valor: "todos", chave: "board.exportReport.statusAll" },
  { valor: "pendentes", chave: "board.exportReport.statusOpen" },
  { valor: "concluidos", chave: "board.exportReport.statusDone" },
];

export default function ExportReportModal({ board, onClose }) {
  const { t, i18n } = useTranslation();
  const { users } = useUsers();
  const showToast = useToast();

  const [membroId, setMembroId] = useState("");
  const [status, setStatus] = useState("todos");
  const [contagem, setContagem] = useState(null);
  const [contando, setContando] = useState(true);
  const [erroContagem, setErroContagem] = useState(false);
  const [baixando, setBaixando] = useState(null);

  // Quem pode aparecer no seletor. Em quadro compartilhado é a empresa inteira,
  // que é justamente quem tem acesso a ele. Em quadro privado é só quem foi
  // convidado - listar a empresa toda ali contaria a quem tem acesso ao quadro
  // quem mais existe na empresa, e o convidado só precisa ver os colegas de quadro.
  const membros = useMemo(() => {
    if (board.visibility !== "private") return users;
    // sharedWith já traz a linha do dono, e é por isso que ela existe - o modal
    // lista todo mundo com acesso numa consulta só.
    const comAcesso = new Set((board.sharedWith || []).map((p) => p.userId));
    if (board.ownerId) comAcesso.add(board.ownerId);
    return users.filter((u) => comAcesso.has(u.id));
  }, [board.visibility, board.sharedWith, board.ownerId, users]);

  // O contador vem do servidor, e não de uma contagem sobre o estado local, porque
  // é o servidor que decide o que entra no arquivo (quadro privado, arquivado,
  // coluna de conclusão). Contar aqui daria um número que discordaria do arquivo
  // baixado justamente nos casos de borda.
  useEffect(() => {
    // Guarda contra resposta fora de ordem: trocar dois seletores rápido dispara
    // duas buscas, e a primeira pode voltar depois da segunda e sobrescrever o
    // número certo pelo antigo.
    let cancelado = false;
    setContando(true);
    setErroContagem(false);
    api
      .contarCartoesDoRelatorio({ boardId: board.id, memberId: membroId || null, status })
      .then((r) => {
        if (cancelado) return;
        setContagem(r.total);
      })
      .catch(() => {
        if (cancelado) return;
        // O contador é informativo: falhar nele não pode esconder os botões de
        // download, que podem muito bem funcionar.
        setErroContagem(true);
        setContagem(null);
      })
      .finally(() => {
        if (!cancelado) setContando(false);
      });
    return () => {
      cancelado = true;
    };
  }, [board.id, membroId, status]);

  async function baixar(formato) {
    setBaixando(formato);
    try {
      await api.baixarRelatorio({
        formato,
        boardId: board.id,
        memberId: membroId || null,
        status,
        // O arquivo sai no idioma em que a pessoa está usando o app, e não num
        // padrão fixo: quem exporta costuma mandar o arquivo para quem fala a
        // mesma língua.
        lang: normalizeLanguage(i18n.language),
      });
      showToast(t("board.exportReport.downloadStarted"));
    } catch (err) {
      showToast(translateError(err, t));
    } finally {
      setBaixando(null);
    }
  }

  const vazio = contagem === 0;

  return (
    <div
      className="modal-overlay"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="modal export-report-modal">
        <button className="modal-close" onClick={onClose} aria-label={t("common.close")}>
          &times;
        </button>
        <div className="modal-header">
          <h2 className="export-report-title">{t("board.exportReport.title")}</h2>
        </div>

        <div className="modal-body">
          <p className="export-report-scope">{t("board.exportReport.scope", { board: board.title })}</p>

          <label className="export-report-field">
            <span className="export-report-label">{t("board.exportReport.userLabel")}</span>
            <select value={membroId} onChange={(e) => setMembroId(e.target.value)}>
              <option value="">{t("board.exportReport.allUsers")}</option>
              {membros.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name}
                </option>
              ))}
            </select>
          </label>

          <label className="export-report-field">
            <span className="export-report-label">{t("board.exportReport.statusLabel")}</span>
            <select value={status} onChange={(e) => setStatus(e.target.value)}>
              {STATUS.map((s) => (
                <option key={s.valor} value={s.valor}>
                  {t(s.chave)}
                </option>
              ))}
            </select>
          </label>

          <div className={"export-report-count" + (vazio ? " is-empty" : "")} aria-live="polite">
            {contando
              ? t("board.exportReport.counting")
              : erroContagem
                ? t("board.exportReport.countFailed")
                : t("board.exportReport.count", { count: contagem ?? 0 })}
          </div>

          {vazio && <p className="export-report-hint">{t("board.exportReport.emptyHint")}</p>}
        </div>

        <div className="modal-footer export-report-actions">
          {/* Baixar continua permitido com zero cartões: o arquivo sai só com o
              cabeçalho, e travar o botão faria parecer defeito em vez de filtro
              que não achou nada - por isso o aviso acima explica o vazio. */}
          <button className="btn-primary" onClick={() => baixar("csv")} disabled={baixando !== null}>
            {baixando === "csv" ? t("board.exportReport.generating") : t("board.exportReport.downloadCsv")}
          </button>
          <button className="btn-secondary" onClick={() => baixar("pdf")} disabled={baixando !== null}>
            {baixando === "pdf" ? t("board.exportReport.generating") : t("board.exportReport.downloadPdf")}
          </button>
          <button className="btn-secondary" onClick={() => baixar("xlsx")} disabled={baixando !== null}>
            {baixando === "xlsx" ? t("board.exportReport.generating") : t("board.exportReport.downloadExcel")}
          </button>
        </div>
      </div>
    </div>
  );
}
