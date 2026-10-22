// `npm run app`(Vite 개발 서버)에서도 배포 서버와 같은 API(/api/*)가 동작하도록 붙이는 플러그인.
// 데이터는 프로젝트 폴더의 data/db.json에 저장된다. (git에는 올라가지 않음)

import path from "node:path";
import express from "express";
import type { Plugin } from "vite";
import { createApi, readApiEnv } from "./api";
import { openDb } from "./db";

export const appApiPlugin = (env: Record<string, string>): Plugin => {
  const mount = (attach: (path: string, handler: express.Express) => void) => {
    const db = openDb(env.DATA_DIR || path.resolve("data"));
    const app = express();
    app.use(createApi(db, readApiEnv(env)));
    attach("/api", app);
  };
  return {
    name: "zhuiju-app-api",
    configureServer(server) {
      mount((p, h) => server.middlewares.use(p, h));
    },
    configurePreviewServer(server) {
      mount((p, h) => server.middlewares.use(p, h));
    },
  };
};
