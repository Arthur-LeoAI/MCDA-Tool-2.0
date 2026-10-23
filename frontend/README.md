# 前端

React + TypeScript + Vite + Tailwind CSS，图表用 ECharts。界面支持中文和英文。

## 开发

先启动后端（见根目录 README），再运行：

```bash
npm install
npm run dev
```

打开 http://localhost:5173 。开发服务器会把 `/api` 请求转发到 `http://127.0.0.1:8000`，所以不需要配置跨域。

| 命令 | 作用 |
|---|---|
| `npm run dev` | 开发服务器 |
| `npm test` | 单元测试（Vitest） |
| `npm run lint` | 代码检查（oxlint） |
| `npm run build` | 类型检查 + 生产构建，输出到 `dist/` |
| `npm run gen:api` | 根据正在运行的后端重新生成 `src/api/schema.d.ts`（后端接口改动后运行） |

如果前端和 API 不在同一个域名下部署，构建时用 `VITE_API_BASE` 指定 API 地址，并在后端的 `MCDA_CORS_ORIGINS` 里加上前端的地址。

## 结构

```
src/
  api/          API 客户端；schema.d.ts 由 OpenAPI 自动生成，types.ts 给常用类型起了简短的名字
  components/   通用组件（数据表格、数字输入框、图表封装、错误列表等）
  pages/        五个步骤页面：数据、准则与权重、结果、敏感性分析、导出
  lib/          不依赖 React 的纯函数：数据编辑、图表配置、数字解析
  i18n/         中英文文本
  store.ts      全局状态（zustand），保存在浏览器的 localStorage 里，刷新页面不会丢失
  hooks.ts      防抖的 API 请求、本地数据检查
```

所有计算都由后端完成，前端只负责编辑数据和展示结果。
