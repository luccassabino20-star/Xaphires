// Ícones do protótipo, um por categoria (Agendamento/Financeiro/Gestão/
// Comunicação/Clientes) - inline, sem lib nova, mesmo hábito do resto do
// projeto (ver ModuleIcon.jsx). Um ícone por card individual (27 ao todo)
// não agregaria clareza aqui; o ícone identifica o módulo, o badge identifica
// o plano.
const PATHS = {
  calendar: "M7 2v2H5a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2h-2V2h-2v2H9V2zm12 8v9H5v-9z",
  cifrao: "M12 2v2m0 16v2m5-14a4 4 0 0 0-4-3H11a3 3 0 0 0 0 6h2a3 3 0 0 1 0 6h-1a4 4 0 0 1-4-3",
  servicos: "M4 4h7v7H4zm9 0h7v7h-7zM4 13h7v7H4zm9 0h7v7h-7z",
  comunicacao: "M4 4h16a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1H8l-4 4V5a1 1 0 0 1 1-1z",
  clientes: "M9 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zm0 2c-4 0-8 2-8 5v2h16v-2c0-3-4-5-8-5zm8.5-3.5a3 3 0 1 0 0-6 3 3 0 0 0 0 6zm.5 1.7c-.4-.1-.9-.2-1.4-.2-1 0-2.1.2-3.1.7 1.9 1.1 3.2 2.8 3.5 4.8H23v-1.5c0-1.9-1.9-3.3-4-3.8z",
};

export default function XbIcon({ name, size = 20 }) {
  const d = PATHS[name] || PATHS.servicos;
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden="true">
      <path fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" d={d} />
    </svg>
  );
}
