import { createContext, useCallback, useContext, useEffect, useState } from "react";
import * as api from "./api.js";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      setUser(await api.getMe());
    } catch {
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  async function registerCompany(data) {
    setUser(await api.registerCompany(data));
  }
  async function login(data) {
    setUser(await api.login(data));
  }
  async function logout() {
    await api.logout();
    setUser(null);
  }
  // Aplica direto a resposta de /api/profile (já é o publicUser atualizado) -
  // sem isto, refletir nome/foto/bio recém-salvos exigiria um refresh() cheio,
  // que religa loading=true e pisca o app inteiro por causa de uma edição
  // pequena no próprio perfil.
  function applyProfileUpdate(updated) {
    setUser(updated);
  }

  return (
    <AuthContext.Provider value={{ loading, user, registerCompany, login, logout, refresh, applyProfileUpdate }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
