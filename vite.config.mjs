// Vite config for the 《追剧学汉语》 web app (separate from the Remotion Studio setup).
import { defineConfig } from "vite";
import { youtubeCaptionsPlugin } from "./server/viteCaptionsPlugin.ts";

export default defineConfig({
  oxc: {
    jsx: { runtime: "automatic", importSource: "react" },
  },
  // 로컬 자막 API (/api/youtube/*) — npm run app 실행 시 함께 동작
  plugins: [youtubeCaptionsPlugin()],
  server: { port: 5173, strictPort: true },
  build: { outDir: "dist-app" },
});
