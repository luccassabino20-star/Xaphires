import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      "/api": {
        target: "http://localhost:4000",
        changeOrigin: true,
      },
      // Imagem do pop-up é servida pelo Express (server/app.js), fora de /api. Sem
      // este proxy ela carrega certo em produção (um processo só) e quebra só em
      // `npm run dev`, porque o Vite não sabe que esse caminho é do outro servidor.
      "/uploads": {
        target: "http://localhost:4000",
        changeOrigin: true,
      },
    },
  },
});
