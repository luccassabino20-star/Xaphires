import { useCallback, useEffect, useState } from "react";
import * as api from "./api.js";

const VAZIO = { title: "", message: "", couponCode: "", buttonLabel: "", expiresAt: "", imageUrl: null, imagemArquivo: null };

function data(iso) {
  // "+T00:00:00" força o parser a ler como hora local, não UTC - sem isso um YYYY-MM-DD
  // perto da virada do dia mostra a data errada pra quem está a oeste de Greenwich.
  return iso ? new Date(iso + "T00:00:00").toLocaleDateString("pt-BR") : "sem validade";
}

export default function Popups() {
  const [lista, setLista] = useState(null);
  const [erro, setErro] = useState("");
  const [form, setForm] = useState(null); // null = form fechado; objeto = criando ou editando
  const [editandoId, setEditandoId] = useState(null);
  const [salvando, setSalvando] = useState(false);
  const [previewUrl, setPreviewUrl] = useState(null);

  const carregar = useCallback(async () => {
    try {
      setLista((await api.listarPopups()).popups);
    } catch (e) {
      setErro(e.message);
    }
  }, []);

  useEffect(() => {
    carregar();
  }, [carregar]);

  // A pré-visualização segue o arquivo recém-escolhido quando existe um, senão a
  // imagem que já está salva no servidor. object URL é revogada ao trocar de novo -
  // sem isso cada escolha de arquivo vaza um blob que o navegador nunca libera.
  useEffect(() => {
    if (!form?.imagemArquivo) {
      setPreviewUrl(form?.imageUrl || null);
      return;
    }
    const url = URL.createObjectURL(form.imagemArquivo);
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [form?.imagemArquivo, form?.imageUrl]);

  function abrirNova() {
    setEditandoId(null);
    setForm({ ...VAZIO });
  }
  function abrirEdicao(p) {
    setEditandoId(p.id);
    setForm({
      title: p.title,
      message: p.message,
      couponCode: p.couponCode,
      buttonLabel: p.buttonLabel,
      expiresAt: p.expiresAt || "",
      imageUrl: p.imageUrl,
      imagemArquivo: null,
    });
  }
  function fecharForm() {
    setForm(null);
    setEditandoId(null);
  }

  function escolherImagem(e) {
    const arquivo = e.target.files?.[0];
    if (arquivo) setForm({ ...form, imagemArquivo: arquivo });
    // Sem isso, escolher o mesmo arquivo de novo depois de removê-lo não dispara onChange.
    e.target.value = "";
  }

  // Antes de salvar, "remover" só descarta a escolha local. Depois de salvo (já tem
  // imageUrl do servidor), é uma chamada de verdade - a campanha já está no ar e a
  // landing precisa parar de mostrar essa imagem.
  async function limparImagem() {
    if (form.imagemArquivo) {
      setForm({ ...form, imagemArquivo: null });
      return;
    }
    if (!form.imageUrl || !editandoId) return;
    if (!confirm("Remover a imagem desta campanha?")) return;
    try {
      await api.removerImagemPopup(editandoId);
      setForm({ ...form, imageUrl: null });
      await carregar();
    } catch (err) {
      setErro(err.message);
    }
  }

  async function salvar(e) {
    e.preventDefault();
    setErro("");
    setSalvando(true);
    try {
      const { imagemArquivo, imageUrl, ...campos } = form;
      let id = editandoId;
      if (id) await api.editarPopup(id, campos);
      else id = (await api.criarPopup(campos)).popup.id;
      if (imagemArquivo) await api.enviarImagemPopup(id, imagemArquivo);
      fecharForm();
      await carregar();
    } catch (err) {
      setErro(err.message);
    } finally {
      setSalvando(false);
    }
  }

  async function alternarAtivo(p) {
    const ativando = !p.active;
    const aviso = ativando
      ? `Ativar "${p.title}"? Qualquer outra campanha ligada agora será desativada - só uma fica visível na landing por vez.`
      : `Desativar "${p.title}"? O pop-up para de aparecer na landing.`;
    if (!confirm(aviso)) return;
    try {
      await api.definirPopupAtivo(p.id, ativando);
      await carregar();
    } catch (err) {
      setErro(err.message);
    }
  }

  async function excluir(p) {
    if (!confirm(`Excluir a campanha "${p.title}"? Não tem como desfazer.`)) return;
    try {
      await api.excluirPopup(p.id);
      await carregar();
    } catch (err) {
      setErro(err.message);
    }
  }

  if (!lista) return <div className="adm-painel">{erro || "Carregando..."}</div>;

  return (
    <div className="adm-painel">
      {erro && <div className="adm-erro">{erro}</div>}

      <div className="adm-barra">
        <p className="adm-fraco">Só uma campanha fica ativa por vez. Ativar uma desliga qualquer outra que estivesse no ar.</p>
        <button className="adm-btn adm-btn-primario" onClick={form && !editandoId ? fecharForm : abrirNova}>
          {form && !editandoId ? "Cancelar" : "Nova campanha"}
        </button>
      </div>

      {form && (
        <form className="adm-form-nova" onSubmit={salvar}>
          <div className="adm-grade2">
            <label className="adm-campo">
              <span>Título</span>
              <input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} required autoFocus />
            </label>
            <label className="adm-campo">
              <span>Código do cupom</span>
              <input value={form.couponCode} onChange={(e) => setForm({ ...form, couponCode: e.target.value })} required />
            </label>
            <label className="adm-campo">
              <span>Texto do botão</span>
              <input
                value={form.buttonLabel}
                onChange={(e) => setForm({ ...form, buttonLabel: e.target.value })}
                placeholder="Criar conta grátis"
              />
            </label>
            <label className="adm-campo">
              <span>Validade (opcional)</span>
              <input type="date" value={form.expiresAt || ""} onChange={(e) => setForm({ ...form, expiresAt: e.target.value })} />
            </label>
          </div>
          <label className="adm-campo">
            <span>Mensagem</span>
            <textarea rows={2} value={form.message} onChange={(e) => setForm({ ...form, message: e.target.value })} />
          </label>

          <div className="adm-campo">
            <span>Imagem (opcional)</span>
            {previewUrl && (
              <div className="adm-popup-preview">
                <img src={previewUrl} alt="Pré-visualização da campanha" />
                <button type="button" className="adm-btn adm-btn-fantasma adm-perigo-texto" onClick={limparImagem}>
                  Remover imagem
                </button>
              </div>
            )}
            <input type="file" accept="image/jpeg,image/png,image/webp,image/gif" onChange={escolherImagem} />
            <p className="adm-fraco">Um banner ou post pronto pra divulgar a oferta. JPEG, PNG, WEBP ou GIF, até 5 MB.</p>
          </div>

          <div className="adm-botoes">
            <button className="adm-btn adm-btn-primario" disabled={salvando}>
              {salvando ? "Salvando..." : editandoId ? "Salvar alterações" : "Criar campanha"}
            </button>
            <button type="button" className="adm-btn adm-btn-fantasma" onClick={fecharForm}>
              Cancelar
            </button>
          </div>
          {!editandoId && <p className="adm-fraco">A campanha nasce desativada. Ative-a na lista abaixo quando estiver pronta.</p>}
        </form>
      )}

      <table className="adm-tabela adm-tabela-lista">
        <thead>
          <tr>
            <th>Campanha</th>
            <th>Cupom</th>
            <th>Validade</th>
            <th>Situação</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {lista.map((p) => (
            <tr key={p.id}>
              <td>
                <div className="adm-popup-linha">
                  {p.imageUrl && <img className="adm-popup-thumb" src={p.imageUrl} alt="" />}
                  <div>
                    <strong>{p.title}</strong>
                    {p.message && <div className="adm-fraco">{p.message}</div>}
                  </div>
                </div>
              </td>
              <td className="adm-fraco">{p.couponCode || "—"}</td>
              <td className="adm-fraco">{data(p.expiresAt)}</td>
              <td>
                {/* "Expirada" vence "No ar" mesmo com active=1 no banco: passou da
                    validade, popupPublico() já não devolve mais pra landing, e um
                    admin vendo "No ar" aqui acharia que o pop-up ainda está no site. */}
                {p.active && !p.expired && <span className="adm-chip adm-chip-active">No ar</span>}
                {p.active && p.expired && <span className="adm-chip adm-chip-expired">Expirada</span>}
                {!p.active && <span className="adm-chip">Desativada</span>}
              </td>
              <td className="adm-direita">
                <button className="adm-btn adm-btn-fantasma" onClick={() => abrirEdicao(p)}>
                  Editar
                </button>
                <button className={"adm-btn adm-btn-fantasma" + (p.active ? " adm-perigo-texto" : "")} onClick={() => alternarAtivo(p)}>
                  {p.active ? "Desativar" : "Ativar"}
                </button>
                <button className="adm-btn adm-btn-fantasma adm-perigo-texto" onClick={() => excluir(p)}>
                  Excluir
                </button>
              </td>
            </tr>
          ))}
          {lista.length === 0 && (
            <tr>
              <td colSpan={5} className="adm-fraco">
                Nenhuma campanha cadastrada.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
