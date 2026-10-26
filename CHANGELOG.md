# Changelog

本文件记录所有值得注意的改动。格式参考 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/)，版本号遵循 [语义化版本](https://semver.org/lang/zh-CN/)。

## [Unreleased]

### Added

- **价值函数和硬性条件（M2 S3）**：
  - 每个准则可以设置打分方式（线性、对数、目标区间、阈值、分段）、取值范围、分类分数和缺失值处理；
  - 价值曲线预览，显示每个方案在曲线上的位置；
  - 硬性条件（≥、≤、>、<、区间、属于）：不满足的方案在打分前被排除，结果页列出原因；
  - 新接口：`/api/v1/projects/curve`。
- **导入任意表格（M2 S2）**：
  - 自动识别工作表、表头行、方案名所在的列和每列的类型（数值、等级、分类、是/否）；
  - 能读懂"$12.99""15%""1.234,5""(300)"等写法，每一列统一判断小数点；"-""n/a"等占位符按缺失值处理；
  - 前端新增"对应列"步骤，可以调整类型、方向和等级的顺序；
  - 数据质量报告：缺失值、常数列、极端值、建议对数曲线、分类分数全部相同；
  - 新接口：`/api/v1/tables/inspect`、`/api/v1/tables/build`、`/api/v1/projects/quality`。
- **项目模型 v2（M2 S1）**：
  - `.mcda.json` 项目文件格式及其 JSON Schema（`backend/project.schema.json`）；
  - 版本迁移：版本 3 的"问题"格式和浏览器里的旧草稿都会自动升级；
  - 分析流水线：缺失值的四种处理方式、四种价值函数、等级/分类/是否的分数换算；
  - `/api/v1/projects/*` 接口：migrate、validate、evaluate、stability、import、report。
- 前端改为基于项目模型：可以保存和打开项目文件；空单元格允许保留，按"最差"处理；数据表格支持是/否、等级、分类类型的值；加权和按 0–100 分显示。

- 计算核心 `mcda_core`：数据模型和校验（效益型/成本型准则）、四种归一化、加权和、TOPSIS、折衷规划、Pareto 分析、权重稳定区间；与 10 个旧版 V7 Excel 工作簿对照验证。
- 导入导出：标准模板（.xlsx/.csv，支持分号分隔、小数逗号和 Windows 代码页）、旧版 V7 工作簿、Excel 报告。
- FastAPI 后端：导入、校验、计算、Pareto、敏感性分析、模板和报告导出。
- React 前端：数据、准则与权重、结果、敏感性分析、导出五个步骤；中英文界面。
- 工程基础（M0）：
  - CI（GitHub Actions）：后端在 Python 3.11 和 3.14 上检查和测试、前端检查和构建、API 约定一致性、端到端测试、Docker 镜像冒烟测试。
  - ruff、pyright、Prettier、oxlint、pre-commit、Dependabot。
  - Playwright 端到端测试。
  - Docker 镜像和 `docker compose`。
  - 请求编号（`X-Request-ID`）和结构化日志（`MCDA_LOG_FORMAT=json`）。
  - CONTRIBUTING、SECURITY、ADR、Apache-2.0 许可证。

### Changed

- 新项目默认只启用加权和（ADR 0005），TOPSIS 和 CP 可以在"结果"页打开。
- TOPSIS 和 CP 默认在价值分上计算；经典 TOPSIS（原始数据 + 向量归一化）作为可选的计算方式保留。

- **破坏兼容**：API 路径从 `/api/*` 改为 `/api/v1/*`。
- **破坏兼容**：错误响应改为 `{code, detail, params, issues, request_id}`。每个问题都有错误代码、参数和结构化的位置，由前端负责翻译。
- 设置错误（例如归一化方式和数据不匹配）统一抛出带错误代码的 `McdaError`。
- `DecisionProblem` 接受任意数组形式的矩阵，并按对象身份比较是否相等。
