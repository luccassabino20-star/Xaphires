import { useCallback, useEffect, useState } from "react";
import * as api from "./api.js";

const PLANOS = ["basic", "intermediate", "professional", "enterprise"];
const NOMES = { basic: "Básico", intermediate: "Intermediário", professional: "Profissional", enterprise: "Empresarial" };
const SITUACAO = { active: "Ativa", trialing: "Em teste", grace: "Pagamento em aberto", expired: "Vencida", blocked: "Bloqueada" };

function data(iso) {
  return iso ? new Date(iso).toLocaleDateString("pt-BR") : "—";
}
function dataHora(iso) {
  return iso ? new Date(iso).toLocaleString("pt-BR") : "—";
}

function Detalhe({ id, onFechar, onMudou }) {
  const [dados, setDados] = useState(null);
  const [erro, setErro] = useState("");
  const [quadros, setQuadros] = useState(null);
  const [salvando, setSalvando] = useState(false);
  const [form, setForm] = useState(null);
  const [desconto, setDesconto] = useState("");
  const [salvandoDesconto, setSalvandoDesconto] = useState(false);
  const [limiteUsuarios, setLimiteUsuarios] = useState("");
  const [limiteAnexoMb, setLimiteAnexoMb] = useState("");
  const [salvandoLimites, setSalvandoLimites] = useState(false);
  const [diasTeste, setDiasTeste] = useState("");
  const [salvandoTeste, setSalvandoTeste] = useState(false);

  const carregar = useCallback(async () => {
    try {
      const d = await api.verEmpresa(id);
      setDados(d);
      setForm({
        name: d.company.name,
        contactName: d.company.contactName || "",
        contactEmail: d.company.contactEmail || "",
        contactPhone: d.company.contactPhone || "",
        doc: d.company.doc || "",
        notes: d.company.notes || "",
      });
      // Centavos -> reais só para exibir; a conversão de volta é feita ao salvar,
      // igual ao padrão de plans.js (nunca soma/subtrai o decimal).
      setDesconto(d.company.discountCents ? String(d.company.discountCents / 100) : "");
      setLimiteUsuarios(d.company.maxUsersOverride != null ? String(d.company.maxUsersOverride) : "");
      setLimiteAnexoMb(
        d.company.maxAttachmentBytesOverride != null ? String(Math.round(d.company.maxAttachmentBytesOverride / (1024 * 1024))) : ""
      );
    } catch (e) {
      setErro(e.message);
    }
  }, [id]);

  useEffect(() => {
    carregar();
  }, [carregar]);

  async function salvar() {
    setSalvando(true);
    try {
      await api.editarEmpresa(id, form);
      await carregar();
      onMudou?.();
    } catch (e) {
      setErro(e.message);
    } finally {
      setSalvando(false);
    }
  }

  async function salvarDesconto() {
    const reais = parseFloat((desconto || "0").replace(",", "."));
    if (Number.isNaN(reais) || reais < 0) {
      setErro("Desconto inválido");
      return;
    }
    setSalvandoDesconto(true);
    try {
      await api.definirDesconto(id, Math.round(reais * 100));
      await carregar();
      onMudou?.();
    } catch (e) {
      setErro(e.message);
    } finally {
      setSalvandoDesconto(false);
    }
  }

  async function salvarLimites() {
    // Campo vazio -> null -> limpa a exceção e volta a valer o teto do plano.
    // Preenchido tem que ser inteiro positivo - não existe exceção para
    // "ilimitado" nem para "zero usuários" (ver o comentário na coluna).
    const usuarios = limiteUsuarios.trim() === "" ? null : parseInt(limiteUsuarios, 10);
    const anexoMb = limiteAnexoMb.trim() === "" ? null : parseInt(limiteAnexoMb, 10);
    if ((usuarios !== null && (!Number.isInteger(usuarios) || usuarios <= 0)) || (anexoMb !== null && (!Number.isInteger(anexoMb) || anexoMb <= 0))) {
      setErro("Limite inválido");
      return;
    }
    setSalvandoLimites(true);
    try {
      await api.definirLimites(id, usuarios, anexoMb !== null ? anexoMb * 1024 * 1024 : null);
      await carregar();
      onMudou?.();
    } catch (e) {
      setErro(e.message);
    } finally {
      setSalvandoLimites(false);
    }
  }

  async function prorrogarTeste() {
    const dias = parseInt(diasTeste, 10);
    if (!Number.isInteger(dias) || dias <= 0) {
      setErro("Quantidade de dias inválida");
      return;
    }
    setSalvandoTeste(true);
    try {
      await api.prorrogarTeste(id, dias);
      setDiasTeste("");
      await carregar();
      onMudou?.();
    } catch (e) {
      setErro(e.message);
    } finally {
      setSalvandoTeste(false);
    }
  }

  async function trocarPlano(plano) {
    if (!confirm(`Definir o plano ${NOMES[plano]} para esta empresa? Isso não passa por cobrança.`)) return;
    try {
      await api.definirPlano(id, plano);
      await carregar();
      onMudou?.();
    } catch (e) {
      setErro(e.message);
    }
  }

  async function alternarBloqueio() {
    const bloqueando = !dados.company.blocked;
    let motivo = null;
    if (bloqueando) {
      motivo = prompt("Motivo do bloqueio (fica registrado na auditoria):");
      if (motivo === null) return;
    } else if (!confirm("Desbloquear esta empresa?")) return;
    try {
      await api.bloquear(id, bloqueando, motivo);
      await carregar();
      onMudou?.();
    } catch (e) {
      setErro(e.message);
    }
  }

  async function abrirQuadros() {
    try {
      const r = await api.verQuadros(id);
      setQuadros(r.boards);
    } catch (e) {
      setErro(e.message);
    }
  }

  async function trocarPapel(usuario) {
    const novo = usuario.role === "master" ? "member" : "master";
    if (!confirm(`Tornar ${usuario.name} ${novo === "master" ? "master" : "membro"} desta empresa?`)) return;
    try {
      await api.definirPapel(id, usuario.id, novo);
      await carregar();
    } catch (e) {
      setErro(e.message);
    }
  }

  async function corrigirEmail(usuario) {
    const novo = prompt(`Novo e-mail de login para ${usuario.name}:`, usuario.email);
    if (novo === null || !novo.trim() || novo.trim().toLowerCase() === usuario.email.toLowerCase()) return;
    try {
      await api.definirEmailUsuario(id, usuario.id, novo.trim());
      await carregar();
    } catch (e) {
      setErro(e.message);
    }
  }

  if (!dados || !form) return <div className="adm-painel">{erro || "Carregando..."}</div>;
  const c = dados.company;

  return (
    <div className="adm-detalhe">
      <div className="adm-detalhe-topo">
        <h2>{c.name}</h2>
        <button className="adm-btn adm-btn-fantasma" onClick={onFechar}>
          Fechar
        </button>
      </div>
      {erro && <div className="adm-erro">{erro}</div>}

      <div className="adm-chips">
        <span className={"adm-chip adm-chip-" + c.status}>{SITUACAO[c.status] || c.status}</span>
        <span className="adm-chip">{NOMES[c.plan]}</span>
        <span className="adm-chip">{c.maxUsers === null ? "usuários ilimitados" : `até ${c.maxUsers} usuários`}</span>
        {c.expiresAt && <span className="adm-chip">vence {data(c.expiresAt)}</span>}
      </div>
      {c.blocked && (
        <div className="adm-bloqueio">
          Bloqueada em {dataHora(c.blockedAt)}
          {c.blockedReason ? ` — ${c.blockedReason}` : ""}
        </div>
      )}

      <div className="adm-secao">
        <h3>Contato</h3>
        <div className="adm-grade2">
          {[
            ["name", "Nome da empresa"],
            ["doc", "CNPJ ou CPF"],
            ["contactName", "Responsável"],
            ["contactEmail", "E-mail"],
            ["contactPhone", "Telefone"],
          ].map(([campo, rotulo]) => (
            <label className="adm-campo" key={campo}>
              <span>{rotulo}</span>
              <input value={form[campo]} onChange={(e) => setForm({ ...form, [campo]: e.target.value })} />
            </label>
          ))}
        </div>
        <label className="adm-campo">
          <span>Observações internas</span>
          <textarea rows={2} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
        </label>
        <button className="adm-btn adm-btn-primario" onClick={salvar} disabled={salvando}>
          {salvando ? "Salvando..." : "Salvar contato"}
        </button>
      </div>

      <div className="adm-secao">
        <h3>Uso</h3>
        <div className="adm-metricas">
          {Object.entries(dados.metricas).map(([k, v]) => (
            <div className="adm-metrica" key={k}>
              <div className="adm-metrica-valor">{v}</div>
              <div className="adm-metrica-nome">{k}</div>
            </div>
          ))}
        </div>
      </div>

      <div className="adm-secao">
        <h3>Plano e acesso</h3>
        <div className="adm-botoes">
          {PLANOS.map((p) => (
            <button key={p} className="adm-btn" disabled={p === c.plan} onClick={() => trocarPlano(p)}>
              {NOMES[p]}
            </button>
          ))}
        </div>
        <button className={"adm-btn " + (c.blocked ? "adm-btn-primario" : "adm-btn-perigo")} onClick={alternarBloqueio}>
          {c.blocked ? "Desbloquear empresa" : "Bloquear empresa"}
        </button>

        <div className="adm-grade2" style={{ marginTop: 14 }}>
          <label className="adm-campo">
            <span>Prorrogar teste (dias)</span>
            <input
              type="text"
              inputMode="numeric"
              placeholder="ex: 7"
              value={diasTeste}
              onChange={(e) => setDiasTeste(e.target.value)}
            />
          </label>
        </div>
        <p className="adm-fraco">
          Soma dias ao vencimento atual (ou começa a contar de hoje, se já tiver vencido) e garante que a empresa
          volte a aparecer como "Em teste" em vez de assinatura paga sem cobrança.
        </p>
        <button className="adm-btn adm-btn-primario" onClick={prorrogarTeste} disabled={salvandoTeste}>
          {salvandoTeste ? "Salvando..." : "Prorrogar teste"}
        </button>

        <div className="adm-grade2" style={{ marginTop: 14 }}>
          <label className="adm-campo">
            <span>Desconto fixo mensal (R$)</span>
            <input
              type="text"
              inputMode="decimal"
              placeholder="0,00"
              value={desconto}
              onChange={(e) => setDesconto(e.target.value)}
            />
          </label>
        </div>
        <p className="adm-fraco">
          Aplicado como desconto do Asaas em cima do preço de tabela em toda cobrança futura (Pix e boleto). Zerar
          remove o desconto.
        </p>
        <button className="adm-btn adm-btn-primario" onClick={salvarDesconto} disabled={salvandoDesconto}>
          {salvandoDesconto ? "Salvando..." : "Salvar desconto"}
        </button>
      </div>

      <div className="adm-secao">
        <h3>Exceções de limite</h3>
        <p className="adm-fraco">
          Por padrão do plano {NOMES[c.plan]}: {c.planMaxUsers === null ? "usuários ilimitados" : `até ${c.planMaxUsers} usuários`},
          anexos até {(c.planMaxAttachmentBytes / (1024 * 1024)).toFixed(0)} MB. Preencher aqui sobrepõe só esta
          empresa; deixar em branco volta a valer o padrão do plano.
        </p>
        <div className="adm-grade2">
          <label className="adm-campo">
            <span>Máximo de usuários</span>
            <input
              type="text"
              inputMode="numeric"
              placeholder={c.planMaxUsers === null ? "ilimitado" : String(c.planMaxUsers)}
              value={limiteUsuarios}
              onChange={(e) => setLimiteUsuarios(e.target.value)}
            />
          </label>
          <label className="adm-campo">
            <span>Máximo de anexo (MB)</span>
            <input
              type="text"
              inputMode="numeric"
              placeholder={String(Math.round(c.planMaxAttachmentBytes / (1024 * 1024)))}
              value={limiteAnexoMb}
              onChange={(e) => setLimiteAnexoMb(e.target.value)}
            />
          </label>
        </div>
        <button className="adm-btn adm-btn-primario" onClick={salvarLimites} disabled={salvandoLimites}>
          {salvandoLimites ? "Salvando..." : "Salvar exceções"}
        </button>
      </div>

      <div className="adm-secao">
        <h3>Usuários ({dados.usuarios.length})</h3>
        <table className="adm-tabela">
          <tbody>
            {dados.usuarios.map((u) => (
              <tr key={u.id}>
                <td>{u.name}</td>
                <td className="adm-fraco">{u.email}</td>
                <td>
                  <span className={"adm-chip" + (u.role === "master" ? " adm-chip-master" : "")}>{u.role}</span>
                </td>
                <td className="adm-direita">
                  <button className="adm-btn adm-btn-fantasma" onClick={() => corrigirEmail(u)}>
                    Editar e-mail
                  </button>
                  <button className="adm-btn adm-btn-fantasma" onClick={() => trocarPapel(u)}>
                    {u.role === "master" ? "Tornar membro" : "Tornar master"}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="adm-secao">
        <h3>Quadros</h3>
        {!quadros ? (
          <button className="adm-btn" onClick={abrirQuadros}>
            Abrir quadros em modo auditoria
          </button>
        ) : (
          <div className="adm-quadros">
            {quadros.length === 0 && <p className="adm-fraco">Nenhum quadro.</p>}
            {quadros.map((b) => (
              <div className="adm-quadro" key={b.id}>
                <div className="adm-quadro-titulo">
                  {b.title}
                  {b.visibility === "private" && <span className="adm-chip">privado</span>}
                </div>
                <div className="adm-quadro-listas">
                  {b.lists.map((l) => (
                    <div className="adm-quadro-lista" key={l.id}>
                      <div className="adm-quadro-lista-nome">
                        {l.title} <span className="adm-fraco">({l.cardIds.length})</span>
                      </div>
                      {l.cardIds.slice(0, 8).map((cid) => (
                        <div className="adm-quadro-cartao" key={cid}>
                          {b.cards[cid]?.title}
                        </div>
                      ))}
                      {l.cardIds.length > 8 && <div className="adm-fraco">+{l.cardIds.length - 8}</div>}
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="adm-secao">
        <h3>Últimos acessos a esta empresa</h3>
        <table className="adm-tabela">
          <tbody>
            {dados.auditoria.slice(0, 15).map((a) => (
              <tr key={a.id}>
                <td className="adm-fraco">{dataHora(a.createdAt)}</td>
                <td>{a.acao}</td>
                <td className="adm-fraco">{a.adminEmail}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default function Empresas() {
  const [lista, setLista] = useState(null);
  const [erro, setErro] = useState("");
  const [aberta, setAberta] = useState(null);
  const [busca, setBusca] = useState("");
  const [criando, setCriando] = useState(false);
  const [nova, setNova] = useState({ name: "", plan: "basic", contactName: "", contactEmail: "", contactPhone: "", doc: "" });

  const carregar = useCallback(async () => {
    try {
      setLista((await api.listarEmpresas()).companies);
    } catch (e) {
      setErro(e.message);
    }
  }, []);

  useEffect(() => {
    carregar();
  }, [carregar]);

  async function criar(e) {
    e.preventDefault();
    try {
      await api.criarEmpresa(nova);
      setCriando(false);
      setNova({ name: "", plan: "basic", contactName: "", contactEmail: "", contactPhone: "", doc: "" });
      await carregar();
    } catch (err) {
      setErro(err.message);
    }
  }

  if (aberta) return <Detalhe id={aberta} onFechar={() => setAberta(null)} onMudou={carregar} />;
  if (!lista) return <div className="adm-painel">{erro || "Carregando..."}</div>;

  const filtradas = lista.filter((c) =>
    !busca.trim() ? true : `${c.name} ${c.contactEmail || ""} ${c.emails.join(" ")}`.toLowerCase().includes(busca.toLowerCase())
  );

  return (
    <div className="adm-painel">
      {erro && <div className="adm-erro">{erro}</div>}
      <div className="adm-barra">
        <input className="adm-busca" placeholder="Buscar por nome ou e-mail" value={busca} onChange={(e) => setBusca(e.target.value)} />
        <button className="adm-btn adm-btn-primario" onClick={() => setCriando((v) => !v)}>
          {criando ? "Cancelar" : "Nova empresa"}
        </button>
      </div>

      {criando && (
        <form className="adm-form-nova" onSubmit={criar}>
          <div className="adm-grade2">
            <label className="adm-campo">
              <span>Nome da empresa</span>
              <input value={nova.name} onChange={(e) => setNova({ ...nova, name: e.target.value })} required autoFocus />
            </label>
            <label className="adm-campo">
              <span>Plano</span>
              <select value={nova.plan} onChange={(e) => setNova({ ...nova, plan: e.target.value })}>
                {PLANOS.map((p) => (
                  <option key={p} value={p}>
                    {NOMES[p]}
                  </option>
                ))}
              </select>
            </label>
            <label className="adm-campo">
              <span>Responsável</span>
              <input value={nova.contactName} onChange={(e) => setNova({ ...nova, contactName: e.target.value })} />
            </label>
            <label className="adm-campo">
              <span>E-mail</span>
              <input type="email" value={nova.contactEmail} onChange={(e) => setNova({ ...nova, contactEmail: e.target.value })} />
            </label>
          </div>
          <button className="adm-btn adm-btn-primario">Criar</button>
          <p className="adm-fraco">
            A empresa nasce sem usuários. Quem for usá-la precisa se cadastrar pelo app, ou você cria o master depois.
          </p>
        </form>
      )}

      <table className="adm-tabela adm-tabela-lista">
        <thead>
          <tr>
            <th>Empresa</th>
            <th>Plano</th>
            <th>Situação</th>
            <th>Contato</th>
            <th>Criada</th>
          </tr>
        </thead>
        <tbody>
          {filtradas.map((c) => (
            <tr key={c.id} onClick={() => setAberta(c.id)} className="adm-linha-clicavel">
              <td>
                <strong>{c.name}</strong>
                <div className="adm-fraco">{c.emails[0] || "sem usuários"}</div>
              </td>
              <td>{NOMES[c.plan]}</td>
              <td>
                <span className={"adm-chip adm-chip-" + c.status}>{SITUACAO[c.status] || c.status}</span>
              </td>
              <td className="adm-fraco">{c.contactEmail || c.contactPhone || "—"}</td>
              <td className="adm-fraco">{data(c.createdAt)}</td>
            </tr>
          ))}
          {filtradas.length === 0 && (
            <tr>
              <td colSpan={5} className="adm-fraco">
                Nenhuma empresa encontrada.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
