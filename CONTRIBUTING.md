# 参与开发

## 环境准备

- [uv](https://docs.astral.sh/uv/)（Python 依赖管理）
- [Node.js](https://nodejs.org/) 24 或更新版本
- 可选：Docker（用来跑和生产环境一样的容器）

```bash
cd backend && uv sync
```

```bash
cd frontend && npm install
```

建议安装提交前检查（只需一次）。它会在每次提交前自动检查格式和静态问题：

```bash
uvx pre-commit install
```

## 工作流程

1. **从 `main` 拉一个短期分支**，例如 `feat/value-functions`、`fix/csv-decimal-comma`。`main` 必须始终可用。
2. **一个改动只做一件事**。较大的功能拆成几个可以独立审查的小改动。还没做完的功能用功能开关隐藏，不要让分支长期分叉。
3. **较大的功能先写设计说明**，说清楚要解决的问题、方案和放弃的替代方案。重要的架构决定记录在 [`docs/adr/`](docs/adr/)。
4. **测试和代码一起写**（见下文）。
5. **提交 Pull Request**。CI 必须全部通过，并经过审查后才能合并。
6. 更新 [`CHANGELOG.md`](CHANGELOG.md) 的 "Unreleased" 部分，以及相关文档。

## 提交信息

使用 [Conventional Commits](https://www.conventionalcommits.org/) 格式：

```
<类型>(<范围>): <简短说明>
```

常用类型：`feat` 新功能、`fix` 修复、`refactor` 重构、`test` 测试、`docs` 文档、`build` 构建、`ci` 持续集成、`chore` 杂项、`style` 格式。破坏兼容性的改动在类型后加 `!`，并在正文里写 `BREAKING CHANGE:`。

版本号遵循 [语义化版本](https://semver.org/lang/zh-CN/)：发布时打标签 `vX.Y.Z`。

## 检查和测试

提交 Pull Request 前，在本地跑一遍和 CI 相同的检查：

| | 命令（在对应目录下运行） |
|---|---|
| 后端代码检查和格式 | `uv run ruff check .` 和 `uv run ruff format --check .` |
| 后端类型检查 | `uv run pyright` |
| 后端测试和覆盖率 | `uv run pytest --cov` |
| 前端格式、代码检查和类型 | `npm run format:check`、`npm run lint`、`npm run typecheck` |
| 前端单元测试 | `npm test` |
| 端到端测试 | `npm run test:e2e`（会自动启动后端和构建好的前端） |
| API 约定 | 改了接口后运行 `npm run gen:api`，并提交 `backend/openapi.json` 和 `frontend/src/api/schema.d.ts` |

测试分三层，越往上越少：

- **单元测试**：计算、校验、数据转换这类纯逻辑，数量最多。计算方法的预期结果要能手算验证，或者来自可靠的参考数据（例如 `data/legacy/` 里的 Excel 结果）。
- **接口测试**：每个 API 接口的正常情况和错误情况。
- **端到端测试**：只覆盖关键的用户流程。

## 约定

- **计算只在后端实现一次**（`mcda_core`），前端不重复实现计算逻辑。
- **错误用代码表示**：新增错误时，先在 `backend/src/mcda_core/errors.py` 里加代码和英文文字，再在 `frontend/src/i18n/errors.ts` 里加中英文翻译。如果漏了翻译，测试会失败。
- **不在日志里记录用户的业务数据。**
- 界面文字放在 `frontend/src/i18n/`，不要直接写在组件里。

## 项目结构

见 [README.md](README.md#目录结构)。
