import { AsyncLocalStorage } from "node:async_hooks";

const als = new AsyncLocalStorage();

export function runWithCompany(companyId, fn) {
  return als.run({ companyId }, fn);
}

export function getCurrentCompanyId() {
  const store = als.getStore();
  if (!store?.companyId) {
    throw new Error("getCurrentCompanyId() chamado fora de um contexto de empresa");
  }
  return store.companyId;
}
