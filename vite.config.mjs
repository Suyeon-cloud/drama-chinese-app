// Vite config for the 《追剧学汉语》 web app (separate from the Remotion Studio setup).
import { defineConfig, loadEnv } from "vite";
import { appApiPlugin } from "./server/viteApiPlugin.ts";
import { youtubeCaptionsPlugin } from "./server/viteCaptionsPlugin.ts";

export default defineConfig(({ mode }) => ({
  oxc: {
    jsx: { runtime: "automatic", importSource: "react" },
  },
  // npm run app 실행 시 자막 API(/api/youtube/*)와 회원·학습 데이터 API(/api/*)가 함께 동작한다.
  // 자막 API를 먼저 붙여야 /api/youtube 요청이 데이터 API로 가지 않는다.
  plugins: [youtubeCaptionsPlugin(), appApiPlugin(loadEnv(mode, process.cwd(), ""))],
  server: { port: 5173, strictPort: true },
  build: { outDir: "dist-app" },
  // 음성 인식(Whisper) Web Worker는 ES 모듈로 빌드한다.
  worker: { format: "es" },
}));
