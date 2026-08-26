// Acesso ao banco do módulo Xaphires Beauty. Como o repo.js de Saúde &
// Clínicas: tudo passa por getDb() (resolvido pelo AsyncLocalStorage do
// companyId) - só funciona dentro de um runWithCompany, que requireAuth já
// garante nas rotas autenticadas.
import { getDb } from "../../db.js";

// Fase 0: nenhuma tela ainda escreve nada aqui - a casca só precisa provar
// que schema -> banco -> rota -> tela funciona de ponta a ponta. As
// contagens vêm das tabelas reais criadas em schema.js (sempre zero até a
// Fase 1 ligar o CRUD de clientes/serviços/agendamentos).
export function getSummary() {
  const db = getDb();
  const clients = db.prepare("SELECT COUNT(*) AS n FROM beauty_clients").get().n;
  const services = db.prepare("SELECT COUNT(*) AS n FROM beauty_services").get().n;
  const appointments = db.prepare("SELECT COUNT(*) AS n FROM beauty_appointments").get().n;
  return { clients, services, appointments };
}
