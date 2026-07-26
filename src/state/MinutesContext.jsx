import { createContext, useCallback, useContext, useEffect, useState } from "react";
import * as api from "./api.js";

const MinutesContext = createContext(null);

export function MinutesProvider({ children }) {
  const [minutes, setMinutes] = useState([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    const data = await api.listMinutes();
    setMinutes(data);
    return data;
  }, []);

  useEffect(() => {
    refresh()
      .catch((err) => console.error("Falha ao carregar as atas:", err))
      .finally(() => setLoading(false));
  }, [refresh]);

  async function createMinute(data) {
    const created = await api.createMinute(data);
    await refresh();
    return created;
  }
  async function updateMinute(id, patch) {
    await api.updateMinute(id, patch);
    await refresh();
  }
  async function deleteMinute(id) {
    await api.deleteMinute(id);
    await refresh();
  }

  return (
    <MinutesContext.Provider value={{ minutes, loading, refresh, createMinute, updateMinute, deleteMinute }}>
      {children}
    </MinutesContext.Provider>
  );
}

export function useMinutes() {
  return useContext(MinutesContext);
}
