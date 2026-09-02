import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";

// Sem editor WYSIWYG de verdade (contentEditable + HTML) de propósito: a
// descrição do cartão é lida como texto puro em pelo menos quatro lugares fora
// deste modal (relatório exportado em CSV/PDF/Excel, Calendário, Tabela) e
// nenhum deles escapa HTML hoje. Guardar HTML aqui abriria um XSS armazenado
// em qualquer um desses pontos de leitura sem tocar em nenhum deles - o app
// também não tem nenhuma lib de sanitização (nem de editor rico) instalada.
// Em vez disso, a barra formata em Markdown leve (negrito/itálico/lista/link)
// sobre o textarea de sempre: zero superfície nova de ataque, zero dependência
// nova, e quem lê em texto puro continua vendo algo razoável (**assim**).
function aplicarFormato(textarea, before, after, placeholder) {
  const { selectionStart, selectionEnd, value } = textarea;
  const selecionado = value.slice(selectionStart, selectionEnd) || placeholder || "";
  const proximo = value.slice(0, selectionStart) + before + selecionado + after + value.slice(selectionEnd);
  return { proximo, selecaoInicio: selectionStart + before.length, selecaoFim: selectionStart + before.length + selecionado.length };
}

export default function CardDescriptionEditor({ description, onSave, readOnly }) {
  const { t } = useTranslation();
  const [text, setText] = useState(description || "");
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const textareaRef = useRef(null);
  const pendingSelection = useRef(null);

  // Card diferente (troca de cartão aberto) ou descrição confirmada por fora
  // (commitDescription em CardModal.jsx, depois do Salvar) - nos dois casos o
  // editor precisa refletir o valor de verdade, descartando rascunho local.
  useEffect(() => {
    setText(description || "");
    setDirty(false);
  }, [description]);

  useLayoutEffect(() => {
    if (pendingSelection.current && textareaRef.current) {
      const { start, end } = pendingSelection.current;
      textareaRef.current.focus();
      textareaRef.current.setSelectionRange(start, end);
      pendingSelection.current = null;
    }
  }, [text]);

  function formatar(before, after, placeholderKey) {
    const ta = textareaRef.current;
    if (!ta || readOnly) return;
    const { proximo, selecaoInicio, selecaoFim } = aplicarFormato(ta, before, after, t(placeholderKey));
    pendingSelection.current = { start: selecaoInicio, end: selecaoFim };
    setText(proximo);
    setDirty(true);
  }

  function inserirLink() {
    const ta = textareaRef.current;
    if (!ta || readOnly) return;
    const { selectionStart, selectionEnd, value } = ta;
    const selecionado = value.slice(selectionStart, selectionEnd) || t("board.cardModal.descriptionEditor.linkTextPlaceholder");
    const trecho = `[${selecionado}](https://)`;
    const proximo = value.slice(0, selectionStart) + trecho + value.slice(selectionEnd);
    // Seleciona o "https://" pronto pra pessoa colar o link em cima, sem
    // precisar caçar a posição certa dentro dos colchetes.
    const urlInicio = selectionStart + selecionado.length + 3;
    pendingSelection.current = { start: urlInicio, end: urlInicio + 8 };
    setText(proximo);
    setDirty(true);
  }

  async function handleSave() {
    setSaving(true);
    try {
      await onSave(text);
      setDirty(false);
    } finally {
      setSaving(false);
    }
  }

  function handleCancel() {
    setText(description || "");
    setDirty(false);
  }

  return (
    <div className="modal-section">
      <label className="modal-label">{t("board.cardModal.description")}</label>
      {!readOnly && (
        <div className="description-toolbar" role="toolbar" aria-label={t("board.cardModal.descriptionEditor.toolbarLabel")}>
          <button type="button" title={t("board.cardModal.descriptionEditor.bold")} onClick={() => formatar("**", "**", "board.cardModal.descriptionEditor.boldPlaceholder")}>
            <b>B</b>
          </button>
          <button type="button" title={t("board.cardModal.descriptionEditor.italic")} onClick={() => formatar("_", "_", "board.cardModal.descriptionEditor.italicPlaceholder")}>
            <i>I</i>
          </button>
          <button type="button" title={t("board.cardModal.descriptionEditor.bulletList")} onClick={() => formatar("\n- ", "")}>
            ≡
          </button>
          <button type="button" title={t("board.cardModal.descriptionEditor.link")} onClick={inserirLink}>
            🔗
          </button>
        </div>
      )}
      <textarea
        ref={textareaRef}
        className="modal-textarea"
        placeholder={t("board.cardModal.descriptionPlaceholder")}
        value={text}
        readOnly={readOnly}
        onChange={(e) => {
          setText(e.target.value);
          setDirty(true);
        }}
      />
      {/* Sempre visível, não só quando `dirty` - pedido explícito: a pessoa
          precisa ver onde salvar/cancelar sem precisar editar primeiro pra
          os botões aparecerem. Salvar fica desabilitado sem mudança real
          (nada pra persistir); Cancelar desfaz o rascunho a qualquer momento. */}
      {!readOnly && (
        <div className="description-save-actions">
          <button type="button" className="btn-primary btn-small" disabled={saving || !dirty} onClick={handleSave}>
            {saving ? t("board.cardModal.descriptionEditor.saving") : t("common.save")}
          </button>
          <button type="button" className="btn-secondary btn-small" disabled={saving || !dirty} onClick={handleCancel}>
            {t("common.cancel")}
          </button>
        </div>
      )}
    </div>
  );
}
