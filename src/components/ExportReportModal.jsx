import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useBoardState } from "../state/BoardContext.jsx";
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
  const { boards } = useBoardState();
  const { users } = useUsers();
  const showToast = useToast();

  // Todos os quadros é um modo à parte, e não "nenhum quadro marcado na lista":
  // desmarcar tudo por engano não pode virar silenciosamente "a empresa inteira" -
  // isso é escolha explícita, feita marcando o "Todos os quadros" no topo da lista.
  //
  // O padrão é só o quadro aberto, e não "todos": quem abre o modal a partir de um
  // quadro está olhando para ele, e um relatório da empresa inteira por omissão
  // seria uma surpresa cara de notar - só se percebe depois de abrir o arquivo.
  const [todosOsQuadros, setTodosOsQuadros] = useState(false);
  const [quadroIds, setQuadroIds] = useState([board.id]);
  const [membroId, setMembroId] = useState("");
  const [status, setStatus] = useState("todos");
  const [contagem, setContagem] = useState(null);
  const [contando, setContando] = useState(true);
  const [erroContagem, setErroContagem] = useState(false);
  const [baixando, setBaixando] = useState(null);

  function alternarTodosOsQuadros() {
    setTodosOsQuadros((v) => !v);
  }
  function alternarQuadro(id) {
    setQuadroIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }

  // [] pro servidor quando "todos" está marcado, do mesmo jeito que fazia o seletor
  // único vazio antes - é o contrato que `filtrosDoRelatorio` (api.js) já espera.
  const boardIdsEfetivos = todosOsQuadros ? [] : quadroIds;
  const semQuadroSelecionado = !todosOsQuadros && quadroIds.length === 0;

  const quadrosEscolhidos = todosOsQuadros ? boards : boards.filter((b) => quadroIds.includes(b.id));
  // Só restringe o seletor de responsável quando TODOS os quadros escolhidos são
  // privados - um único quadro compartilhado no meio já expõe a empresa inteira
  // pra quem está vendo o modal, então listar todo mundo deixa de vazar algo que
  // esse quadro compartilhado já não escondia.
  const soQuadrosPrivados = quadrosEscolhidos.length > 0 && quadrosEscolhidos.every((b) => b.visibility === "private");

  // Quem pode aparecer no seletor de responsável. Em quadro compartilhado é a
  // empresa inteira, que é justamente quem tem acesso a ele. Com só quadro(s)
  // privado(s) é a união de quem foi convidado neles - listar a empresa toda ali
  // contaria a quem só tem acesso ao(s) privado(s) quem mais existe na empresa.
  const membros = useMemo(() => {
    if (!soQuadrosPrivados) return users;
    // sharedWith já traz a linha do dono, e é por isso que ela existe - o modal
    // lista todo mundo com acesso numa consulta só.
    const comAcesso = new Set();
    for (const b of quadrosEscolhidos) {
      for (const p of b.sharedWith || []) comAcesso.add(p.userId);
      if (b.ownerId) comAcesso.add(b.ownerId);
    }
    return users.filter((u) => comAcesso.has(u.id));
  }, [soQuadrosPrivados, quadrosEscolhidos, users]);

  // Trocar de quadro pode deixar o responsável escolhido fora da lista - some com o
  // filtro em vez de manter um id invisível selecionado, que faria o contador
  // mostrar zero sem nada na tela explicando por quê.
  useEffect(() => {
    if (membroId && !membros.some((u) => u.id === membroId)) setMembroId("");
  }, [membros, membroId]);

  // O contador vem do servidor, e não de uma contagem sobre o estado local, porque
  // é o servidor que decide o que entra no arquivo (quadro privado, arquivado,
  // coluna de conclusão). Contar aqui daria um número que discordaria do arquivo
  // baixado justamente nos casos de borda.
  useEffect(() => {
    // Nada marcado: não tem o que contar, e pedir ao servidor devolveria "todos os
    // quadros" - contrato que aqui só vale para o modo "Todos os quadros" explícito.
    if (semQuadroSelecionado) {
      setContando(false);
      setErroContagem(false);
      setContagem(0);
      return;
    }
    // Guarda contra resposta fora de ordem: trocar dois seletores rápido dispara
    // duas buscas, e a primeira pode voltar depois da segunda e sobrescrever o
    // número certo pelo antigo.
    let cancelado = false;
    setContando(true);
    setErroContagem(false);
    api
      .contarCartoesDoRelatorio({ boardIds: todosOsQuadros ? [] : quadroIds, memberId: membroId || null, status })
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
  }, [todosOsQuadros, quadroIds, semQuadroSelecionado, membroId, status]);

  async function baixar(formato) {
    setBaixando(formato);
    try {
      await api.baixarRelatorio({
        formato,
        boardIds: boardIdsEfetivos,
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
          <div className="export-report-field">
            <span className="export-report-label">{t("board.exportReport.boardLabel")}</span>
            <div className="export-report-boards">
              <label className="export-report-boards-all">
                <input type="checkbox" checked={todosOsQuadros} onChange={alternarTodosOsQuadros} />
                <span>{t("board.exportReport.allBoards")}</span>
              </label>
              <div className={"export-report-boards-list" + (todosOsQuadros ? " is-disabled" : "")}>
                {boards.map((b) => (
                  <label className="export-report-board-item" key={b.id}>
                    <input
                      type="checkbox"
                      checked={todosOsQuadros || quadroIds.includes(b.id)}
                      disabled={todosOsQuadros}
                      onChange={() => alternarQuadro(b.id)}
                    />
                    {/* O quadro privado é marcado na lista para não parecer trazer
                        coisa que não deveria: quem exporta precisa saber que aquele
                        conteúdo entrou, e que ele é restrito. */}
                    <span>{b.visibility === "private" ? `${b.title} (${t("board.exportReport.privateTag")})` : b.title}</span>
                  </label>
                ))}
              </div>
            </div>
          </div>

          {todosOsQuadros && <p className="export-report-scope">{t("board.exportReport.allBoardsHint")}</p>}
          {semQuadroSelecionado && <p className="export-report-scope is-warning">{t("board.exportReport.noBoardsHint")}</p>}

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

          {!semQuadroSelecionado && (
            <>
              <div className={"export-report-count" + (vazio ? " is-empty" : "")} aria-live="polite">
                {contando
                  ? t("board.exportReport.counting")
                  : erroContagem
                    ? t("board.exportReport.countFailed")
                    : t("board.exportReport.count", { count: contagem ?? 0 })}
              </div>

              {vazio && <p className="export-report-hint">{t("board.exportReport.emptyHint")}</p>}
            </>
          )}
        </div>

        <div className="modal-footer export-report-actions">
          {/* Baixar continua permitido com zero cartões: o arquivo sai só com o
              cabeçalho, e travar o botão faria parecer defeito em vez de filtro
              que não achou nada - por isso o aviso acima explica o vazio. Sem
              nenhum quadro marcado, aí sim trava: não tem contrato pro servidor
              gerar "o relatório de nenhum quadro". */}
          <button className="btn-primary" onClick={() => baixar("csv")} disabled={baixando !== null || semQuadroSelecionado}>
            {baixando === "csv" ? t("board.exportReport.generating") : t("board.exportReport.downloadCsv")}
          </button>
          <button className="btn-secondary" onClick={() => baixar("pdf")} disabled={baixando !== null || semQuadroSelecionado}>
            {baixando === "pdf" ? t("board.exportReport.generating") : t("board.exportReport.downloadPdf")}
          </button>
          <button className="btn-secondary" onClick={() => baixar("xlsx")} disabled={baixando !== null || semQuadroSelecionado}>
            {baixando === "xlsx" ? t("board.exportReport.generating") : t("board.exportReport.downloadExcel")}
          </button>
        </div>
      </div>
    </div>
  );
}
