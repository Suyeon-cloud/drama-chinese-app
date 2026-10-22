// 배포용 서버 (npm run build → npm start): 빌드된 웹앱(dist-app/) + API(/api/*)를 한 서버에서 제공한다.
// Railway는 PORT 환경변수를 넣어 준다. 로컬에서 확인할 때는 `npm run build` 후 `npm start` → http://localhost:3000
// (빌드 시 esbuild가 이 파일을 dist-server/index.mjs 하나로 묶는다)

import path from "node:path";
import { fileURLToPath } from "node:url";
import express from "express";
import { createApi, readApiEnv } from "./api";
import { openDb } from "./db";
import { youtubeCaptionsHandler } from "./viteCaptionsPlugin";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dist = path.join(root, "dist-app");
const dataDir = process.env.DATA_DIR || path.join(root, "data");

const db = openDb(dataDir);
const app = express();
app.set("trust proxy", true);

app.use("/api/youtube", youtubeCaptionsHandler);
app.use("/api", createApi(db, readApiEnv(process.env)));
app.use(express.static(dist, { index: "index.html" }));
// 화면 주소는 #/... 해시 방식이라 그 밖의 경로는 모두 index.html로 보낸다.
app.use((_req, res) => res.sendFile(path.join(dist, "index.html")));

const port = Number(process.env.PORT) || 3000;
app.listen(port, () => {
  console.log(`追剧学汉语 서버 실행 중: http://localhost:${port} (데이터: ${db.file})`);
  if (!process.env.DATA_DIR) console.log("⚠️ DATA_DIR이 없어 프로젝트 폴더의 data/에 저장해요. Railway에서는 Volume을 연결하세요.");
});
