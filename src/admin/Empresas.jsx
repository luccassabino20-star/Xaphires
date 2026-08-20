import { useCallback, useEffect, useState } from "react";
import * as api from "./api.js";

const PLANOS = ["basic", "intermediate", "professional", "enterprise"];
const NOMES = { basic: "Free", intermediate: "Unlimited", professional: "Pro", enterprise: "Enterprise" };
// Só planos pagos com preço de tabela levam desconto - Free já é grátis. O
// Enterprise passou a ter preço de tabela (autoatendimento igual aos demais),
// então entra na lista.
const PLANOS_COM_DESCONTO = ["intermediate", "professional", "enterprise"];
const SITUACAO = { active: "Ativa", trialing: "Em teste", grace: "Pagamento em aberto", expired: "Vencida", blocked: "Bloqueada" };
// Nomes dos módulos da plataforma para o painel (só em português, ferramenta
// interna). Espelha os ids de server/modules.js.
const NOMES_MODULOS = {
  quadro: "Quadro Kanban",
  "vendas-crm": "Vendas & CRM",
  financeiro: "ERP IRES",
  "saude-clinicas": "Saúde & Clínicas",
};

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
  const [descontos, setDescontos] = useState({});
  const [salvandoDesconto, setSalvandoDesconto] = useState(null); // planId em salvamento, ou null
  const [limiteUsuarios, setLimiteUsuarios] = useState("");
  const [limiteAnexoMb, setLimiteAnexoMb] = useState("");
  const [salvandoLimites, setSalvandoLimites] = useState(false);
  const [diasTeste, setDiasTeste] = useState("");
  const [salvandoTeste, setSalvandoTeste] = useState(null); // 1, -1 ou null
  const [modulos, setModulos] = useState(null); // [{id, core, available, entitled}]
  const [salvandoModulo, setSalvandoModulo] = useState(null); // id do módulo em salvamento

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
      // igual ao padrão de plans.js (nunca soma/subtrai o decimal). Um campo por
      // plano com desconto negociado; plano sem chave em discounts fica vazio.
      setDescontos(
        Object.fromEntries(
          PLANOS_COM_DESCONTO.map((p) => [p, d.company.discounts?.[p] ? String(d.company.discounts[p] / 100) : ""])
        )
      );
      setLimiteUsuarios(d.company.maxUsersOverride != null ? String(d.company.maxUsersOverride) : "");
      setLimiteAnexoMb(
        d.company.maxAttachmentBytesOverride != null ? String(Math.round(d.company.maxAttachmentBytesOverride / (1024 * 1024))) : ""
      );
      const m = await api.verModulos(id);
      setModulos(m.modules);
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

  async function salvarDesconto(plano) {
    const reais = parseFloat((descontos[plano] || "0").replace(",", "."));
    if (Number.isNaN(reais) || reais < 0) {
      setErro("Desconto inválido");
      return;
    }
    setSalvandoDesconto(plano);
    try {
      await api.definirDesconto(id, plano, Math.round(reais * 100));
      await carregar();
      onMudou?.();
    } catch (e) {
      setErro(e.message);
    } finally {
      setSalvandoDesconto(null);
    }
  }

  // Liga/desliga um módulo para a empresa. Monta a lista de ids liberados a
  // partir do estado atual e envia inteira - o servidor guarda a lista explícita.
  async function alternarModulo(mid) {
    if (!modulos) return;
    // Monta a partir do que está GRAVADO (stored), não do entitled resolvido:
    // entitled é false para módulo ainda indisponível ("Em breve"), então usá-lo
    // aqui apagaria a pré-autorização desses módulos a cada alternância.
    const liberados = modulos.filter((m) => m.stored).map((m) => m.id);
    const alvo = liberados.includes(mid) ? liberados.filter((x) => x !== mid) : [...liberados, mid];
    setSalvandoModulo(mid);
    try {
      const r = await api.definirModulos(id, alvo);
      setModulos(r.modules);
      onMudou?.();
    } catch (e) {
      setErro(e.message);
    } finally {
      setSalvandoModulo(null);
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

  // sinal: 1 prorroga, -1 encurta. O campo sempre recebe um número positivo de
  // dias - é o botão que decide a direção, para não depender de quem usa
  // lembrar de digitar o sinal de menos.
  async function ajustarTeste(sinal) {
    const dias = parseInt(diasTeste, 10);
    if (!Number.isInteger(dias) || dias <= 0) {
      setErro("Quantidade de dias inválida");
      return;
    }
    setSalvandoTeste(sinal);
    try {
      await api.prorrogarTeste(id, dias * sinal);
      setDiasTeste("");
      await carregar();
      onMudou?.();
    } catch (e) {
      setErro(e.message);
    } finally {
      setSalvandoTeste(null);
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

  async function alternarAcessoPermanente() {
    const concedendo = !dados.company.permanentAccess;
    let motivo = null;
    if (concedendo) {
      motivo = prompt("Motivo do acesso permanente (fica registrado na auditoria):");
      if (motivo === null) return;
    } else if (!confirm("Remover o acesso permanente desta empresa? Ela volta a depender do plano e do vencimento normais.")) return;
    try {
      await api.definirAcessoPermanente(id, concedendo, motivo);
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
        {c.permanentAccess && <span className="adm-chip adm-chip-permanente">acesso permanente</span>}
      </div>
      {c.blocked && (
        <div className="adm-bloqueio">
          Bloqueada em {dataHora(c.blockedAt)}
          {c.blockedReason ? ` — ${c.blockedReason}` : ""}
        </div>
      )}
      {c.permanentAccess && (
        <div className="adm-permanente">
          Acesso permanente concedido em {dataHora(c.permanentAccessAt)}
          {c.permanentAccessReason ? ` — ${c.permanentAccessReason}` : ""}
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
        <button
          className={"adm-btn " + (c.permanentAccess ? "adm-btn-perigo" : "adm-btn-primario")}
          onClick={alternarAcessoPermanente}
          style={{ marginLeft: 8 }}
        >
          {c.permanentAccess ? "Remover acesso permanente" : "Conceder acesso permanente"}
        </button>

        <div className="adm-grade2" style={{ marginTop: 14 }}>
          <label className="adm-campo">
            <span>Dias de teste</span>
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
          Prorrogar soma dias ao vencimento atual (ou começa a contar de hoje, se já tiver vencido). Encurtar sempre
          parte do vencimento atual, e pode até levá-lo para o passado, vencendo o teste na hora. Os dois garantem que
          a empresa apareça como "Em teste" em vez de assinatura paga sem cobrança.
        </p>
        <div className="adm-botoes">
          <button className="adm-btn adm-btn-primario" onClick={() => ajustarTeste(1)} disabled={salvandoTeste !== null}>
            {salvandoTeste === 1 ? "Salvando..." : "Prorrogar teste"}
          </button>
          <button className="adm-btn adm-btn-perigo" onClick={() => ajustarTeste(-1)} disabled={salvandoTeste !== null}>
            {salvandoTeste === -1 ? "Salvando..." : "Encurtar teste"}
          </button>
        </div>

        <p className="adm-fraco" style={{ marginTop: 14 }}>
          Desconto mensal fixo, negociado por fora, por plano - não segue a empresa se ela trocar de plano depois.
          Aplicado como desconto do Asaas em cima do preço de tabela em toda cobrança futura (Pix e boleto). Zerar
          remove o desconto daquele plano.
        </p>
        {PLANOS_COM_DESCONTO.map((p) => (
          <div className="adm-grade2" key={p} style={{ marginTop: 8, alignItems: "end" }}>
            <label className="adm-campo">
              <span>Desconto no {NOMES[p]} (R$)</span>
              <input
                type="text"
                inputMode="decimal"
                placeholder="0,00"
                value={descontos[p] || ""}
                onChange={(e) => setDescontos({ ...descontos, [p]: e.target.value })}
              />
            </label>
            <button
              className="adm-btn adm-btn-primario"
              onClick={() => salvarDesconto(p)}
              disabled={salvandoDesconto !== null}
            >
              {salvandoDesconto === p ? "Salvando..." : "Salvar"}
            </button>
          </div>
        ))}
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
        <h3>Módulos da plataforma</h3>
        <p className="adm-fraco">
          Controla o que esta empresa pode usar de cada módulo. "Em breve" ainda não foi construído -
          liberar aqui já deixa pré-autorizado para quando entrar no ar. Dentro da empresa, o master
          ainda decide quais usuários acessam cada módulo.
        </p>
        {!modulos ? (
          <p className="adm-fraco">Carregando...</p>
        ) : (
          <div className="adm-modulos">
            {modulos.map((m) => (
              <label key={m.id} className="adm-modulo">
                <input
                  type="checkbox"
                  checked={m.stored}
                  disabled={salvandoModulo === m.id}
                  onChange={() => alternarModulo(m.id)}
                />
                <span className="adm-modulo-nome">{NOMES_MODULOS[m.id] || m.id}</span>
                {m.core && <span className="adm-chip">core</span>}
                {!m.available && <span className="adm-chip adm-chip-fraco">em breve</span>}
              </label>
            ))}
          </div>
        )}
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
