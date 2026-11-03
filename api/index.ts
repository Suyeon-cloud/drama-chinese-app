// Vercel 서버리스 함수 진입점: /api/* 요청을 기존 Express API로 넘긴다. (vercel.json의 rewrite가 이 함수로 보낸다)
// - server/index.ts(상시 실행 서버)와 같은 API를 쓰되, listen·정적 파일 제공은 하지 않는다. (웹앱은 Vercel이 dist-app/에서 제공)
// - AUTH_BACKEND=supabase: openDbFor가 db.json을 열지 않으므로 파일시스템을 쓰지 않는다.
//   (dbjson은 Vercel용이 아니다 — 쓰기 가능한 임시 폴더라도 요청·인스턴스마다 사라진다)
// - service-role 등 서버 전용 값은 이 함수(서버)에서만 읽는다.
import express from "express";
import { createApi, readApiEnv } from "../server/api";
import { openDbFor } from "../server/db";
import { youtubeCaptionsHandler } from "../server/viteCaptionsPlugin";

const env = readApiEnv(process.env);
const app = express();
app.set("trust proxy", true);

app.use("/api/youtube", youtubeCaptionsHandler);
app.use("/api", createApi(openDbFor(env.authBackend, "/tmp/zhuiju-data"), env));

export default app;
