import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";

// https://vitejs.dev/config/
export default defineConfig(async () => ({
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  // Vite options tailored for Tauri development and only applied in `tauri dev` or `tauri build`
  clearScreen: false,
  build: {
    rollupOptions: {
      output: {
        manualChunks(id: string) {
          if (id.includes('node_modules')) {
            // 核心 React 运行时（react / react-dom / react-router / react-router-dom / scheduler）：
            // 每个页面/入口都需要，独立成块便于浏览器长期缓存；用精确路径正则避免误匹配 react-is 等
            if (
              /[\\/]node_modules[\\/](react|react-dom|react-router|react-router-dom|scheduler)[\\/]/.test(
                id,
              ) ||
              id.includes('react-router-dom')
            ) {
              return 'vendor-react';
            }
            // 重型可视化库：仅 AnalyticsPage（已懒加载）使用，隔离避免拖慢首屏
            if (id.includes('/recharts/') || id.includes('/d3-') || id.includes('/victory/')) {
              return 'vendor-recharts';
            }
            // 其余第三方依赖统一归入 vendor，防止未来新增重型依赖污染入口 chunk
            return 'vendor';
          }
        },
      },
    },
  },
  server: {
    port: 1420,
    strictPort: true,
    watch: {
      // tell vite to ignore watching `src-tauri`
      ignored: ["**/src-tauri/**"],
    },
  },
  test: {
    globals: true,
    environment: "jsdom",
    setupFiles: ["src/test-setup.ts"],
    coverage: {
      provider: "v8",
      reporter: ["text", "json-summary", "html"],
      include: ["src/**/*.{ts,tsx}"],
      exclude: ["src/**/*.test.{ts,tsx}", "src/types/**"],
    },
  },
}));
