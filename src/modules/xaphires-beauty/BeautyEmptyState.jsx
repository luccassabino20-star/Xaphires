// Estado vazio compartilhado pelas listas do módulo (agenda/clientes/
// serviços/equipe/financeiro) - ilustração de traço fino (sem preenchimento
// pesado) + texto acolhedor, no lugar do antigo "Nenhum X cadastrado ainda"
// cru dentro de uma célula de tabela.
export default function BeautyEmptyState({ title, text }) {
  return (
    <div className="beauty-empty-state">
      <svg viewBox="0 0 64 64" width="52" height="52" aria-hidden="true">
        <circle cx="32" cy="32" r="22" fill="none" stroke="currentColor" strokeWidth="1.4" strokeDasharray="3 5" />
        <path d="M22 33c2-4 6-6 10-6s8 2 10 6" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
        <circle cx="26" cy="26" r="1.6" fill="currentColor" />
        <circle cx="38" cy="26" r="1.6" fill="currentColor" />
        <path d="M32 12v4M46 18l-3 3M18 18l3 3" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
      </svg>
      <p className="beauty-empty-state-title">{title}</p>
      {text && <p className="beauty-empty-state-text">{text}</p>}
    </div>
  );
}
