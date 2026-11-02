// 배포용 서버 (npm run build → npm start): 빌드된 웹앱(dist-app/) + API(/api/*)를 한 서버에서 제공한다.
// 호스팅이 PORT 환경변수를 넣어 준다. 로컬에서 확인할 때는 `npm run build` 후 `npm start` → http://localhost:3000
// (빌드 시 esbuild가 이 파일을 dist-server/index.mjs 하나로 묶는다)
// AUTH_BACKEND=supabase: 데이터는 모두 Supabase에 있다. db.json을 열거나 만들지 않고 DATA_DIR도 쓰지 않는다.

import path from "node:path";
import { fileURLToPath } from "node:url";
import express from "express";
import { createApi, readApiEnv } from "./api";
import { openDbFor } from "./db";
import { youtubeCaptionsHandler } from "./viteCaptionsPlugin";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dist = path.join(root, "dist-app");
const env = readApiEnv(process.env);
const dataDir = process.env.DATA_DIR || path.join(root, "data");

const db = openDbFor(env.authBackend, dataDir);
const app = express();
app.set("trust proxy", true);

app.use("/api/youtube", youtubeCaptionsHandler);
app.use("/api", createApi(db, env));
app.use(express.static(dist, { index: "index.html" }));
// 화면 주소는 #/... 해시 방식이라 그 밖의 경로는 모두 index.html로 보낸다.
app.use((_req, res) => res.sendFile(path.join(dist, "index.html")));

const port = Number(process.env.PORT) || 3000;
app.listen(port, () => {
  if (env.authBackend === "supabase") {
    console.log(`追剧学汉语 서버 실행 중: http://localhost:${port} (데이터: Supabase)`);
    return;
  }
  console.log(`追剧学汉语 서버 실행 중: http://localhost:${port} (데이터: ${db.file})`);
  if (!process.env.DATA_DIR) console.log("⚠️ DATA_DIR이 없어 프로젝트 폴더의 data/에 저장해요. 서버 파일이 남는 저장소(Volume 등)를 연결하세요.");
});
