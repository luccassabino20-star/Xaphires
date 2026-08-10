import { createContext, useCallback, useContext, useEffect, useState } from "react";
import * as api from "./api.js";
import { useBoardRefetch } from "./BoardContext.jsx";

const UsersContext = createContext(null);

export function UsersProvider({ children }) {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const refetchBoards = useBoardRefetch();

  const refresh = useCallback(async () => {
    const data = await api.listUsers();
    setUsers(data);
    return data;
  }, []);

  useEffect(() => {
    // O catch é necessário: sem ele uma falha aqui virava unhandled rejection no
    // console, sem nada indicando que a lista de usuários não carregou.
    refresh()
      .catch((err) => console.error("Falha ao carregar os usuários:", err))
      .finally(() => setLoading(false));
  }, [refresh]);

  async function createUser(data) {
    await api.createUser(data);
    await refresh();
  }
  async function deleteUser(id) {
    await api.deleteUser(id);
    await Promise.all([refresh(), refetchBoards()]);
  }
  async function resetPassword(id, newPassword) {
    await api.resetUserPassword(id, newPassword);
  }
  async function renameUser(id, data) {
    await api.renameUser(id, data);
    await refresh();
  }
  async function setRole(id, role) {
    await api.setUserRole(id, role);
    await refresh();
  }

  return (
    <UsersContext.Provider value={{ users, loading, refresh, createUser, deleteUser, resetPassword, renameUser, setRole }}>
      {children}
    </UsersContext.Provider>
  );
}

export function useUsers() {
  return useContext(UsersContext);
}
