import { useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useToast } from "../../state/ToastContext.jsx";
import { translateError } from "../../utils/errors.js";
import * as api from "../../state/api.js";
import { AttachmentFileIcon } from "../../components/cardIcons.jsx";

function formatBytes(bytes) {
  if (!bytes && bytes !== 0) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

// Dropzone + lista de anexos do lançamento (NF-e, contrato, comprovante).
// Mesma mecânica de arrastar de FinanceUploadPanel.jsx (finance-bpo, que é
// protótipo simulado) - aqui o upload é de verdade, via finAddAttachment.
//
// Dois modos, escolhidos pela presença de `lancamentoId`:
// - SEM id (formulário de criação): não há onde gravar ainda - os arquivos só
//   ficam na fila local (`pendentes`), e quem usa o componente lê essa fila
//   via `onPendentesChange` para subir cada um logo depois de criar o título
//   (ver LancamentosView.jsx).
// - COM id (LancamentoModal, ou já depois da criação): upload acontece na
//   hora, e a lista mostrada vem de `anexos` (prop) + `onChanged` avisa o pai
//   pra atualizar essa lista.
export default function AnexosLancamento({ lancamentoId, anexos = [], onChanged, pendentes = [], onPendentesChange }) {
  const { t } = useTranslation();
  const showToast = useToast();
  const [arrastando, setArrastando] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const inputRef = useRef(null);

  const modoPreCreacao = !lancamentoId;

  async function adicionar(files) {
    const lista = Array.from(files || []);
    if (!lista.length) return;
    if (modoPreCreacao) {
      onPendentesChange?.([...pendentes, ...lista]);
      return;
    }
    setEnviando(true);
    try {
      for (const file of lista) {
        const { anexos: novos } = await api.finAddAttachment(lancamentoId, file);
        onChanged?.(novos);
      }
    } catch (err) {
      showToast(translateError(err, t));
    } finally {
      setEnviando(false);
    }
  }

  function removerPendente(idx) {
    onPendentesChange?.(pendentes.filter((_, i) => i !== idx));
  }

  async function removerEnviado(anexoId) {
    try {
      const { anexos: restantes } = await api.finRemoveAttachment(lancamentoId, anexoId);
      onChanged?.(restantes);
    } catch (err) {
      showToast(translateError(err, t));
    }
  }

  return (
    <div className="fin-anexos">
      <div
        className={"fin-dropzone" + (arrastando ? " active" : "") + (enviando ? " enviando" : "")}
        onDragOver={(e) => { e.preventDefault(); setArrastando(true); }}
        onDragLeave={() => setArrastando(false)}
        onDrop={(e) => { e.preventDefault(); setArrastando(false); adicionar(e.dataTransfer.files); }}
        onClick={() => inputRef.current?.click()}
        role="button"
        tabIndex={0}
      >
        <svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 3v12m0 0-4-4m4 4 4-4" />
          <path d="M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2" />
        </svg>
        <span className="fin-dropzone-titulo">{t("financeiro.lanc.dropzoneTitulo")}</span>
        <span className="fin-dropzone-sub">{t("financeiro.lanc.dropzoneSub")}</span>
        <input ref={inputRef} type="file" multiple onChange={(e) => { adicionar(e.target.files); e.target.value = ""; }} style={{ display: "none" }} />
      </div>

      {pendentes.length > 0 && (
        <ul className="attachment-list">
          {pendentes.map((f, idx) => (
            <li key={idx} className="attachment-item">
              <AttachmentFileIcon />
              <span className="attachment-name">{f.name}</span>
              <span className="attachment-size">{formatBytes(f.size)}</span>
              <button type="button" className="checklist-item-remove" onClick={() => removerPendente(idx)} aria-label={t("common.remove")}>&times;</button>
            </li>
          ))}
        </ul>
      )}

      {anexos.length > 0 && (
        <ul className="attachment-list">
          {anexos.map((a) => (
            <li key={a.id} className="attachment-item">
              <AttachmentFileIcon />
              <a className="attachment-name" href={api.finAttachmentDownloadUrl(lancamentoId, a.id)} target="_blank" rel="noopener noreferrer">
                {a.name}
              </a>
              {a.size != null && <span className="attachment-size">{formatBytes(a.size)}</span>}
              <button type="button" className="checklist-item-remove" onClick={() => removerEnviado(a.id)} aria-label={t("common.remove")}>&times;</button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
