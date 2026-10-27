# MCDA 决策分析工具（重构版）

多准则决策分析（MCDA）工具，是对本仓库原有版本的完整重构。重构前的旧版本保留在标签 [`v1-legacy`](https://github.com/Arthur-LeoAI/MCDA-Tool-2.0/tree/v1-legacy) 上。

所有计算都只在 Python 计算核心 `mcda_core` 里实现一次，后端 API 和前端只调用它，不再像旧版那样在 JS 和 Python 里各写一套。

网站有两个页面：主页 `/` 介绍这个工具，工具本身在 `/app`。工具的代码按需加载，主页打开得更快。

工具有两种模式，用同一个项目，随时可以切换：

- **引导模式**（新用户默认）：场景 → 导入 → 对应列 → 检查 → 准则 → 权重 → 结论，每一步只展示必要的选项；
- **专家模式**：数据、准则与权重、结果、敏感性分析、导出五个页面，可以选择方法、查看稳定区间和稳健性分析。

内置两个模板：Amazon 美国站选品、ELT 技术评估（来自旧版 V7 工作簿）。

## 目录结构

```
backend/              Python 后端
  src/mcda_api/       FastAPI 服务（HTTP 接口）
    main.py           应用入口、配置（CORS、上传大小、日志）
    routes.py         通用接口（/api/v1：health、methods、template）和上传处理
    projects.py       项目接口（/api/v1/projects/*）
    tables.py         任意表格的识别和转换（/api/v1/tables/*）
    templates.py      内置模板（/api/v1/templates/*）
    schemas.py        请求/响应数据结构
    errors.py         统一的错误格式（错误代码 + 参数 + 位置）
    observability.py  请求编号和结构化日志
    export_openapi.py 导出 API 约定 openapi.json
  src/mcda_core/
    model.py          数据模型：方案 × 准则矩阵、权重、方向（效益型/成本型）、校验
    normalization.py  归一化：none / min_max / fixed_range / vector
    methods.py        加权和、TOPSIS、折衷规划 (CP)
    ranking.py        得分 → 排名（并列名次按 "1224" 处理）
    pareto.py         Pareto 支配分析
    sensitivity.py    权重稳定区间（加权和；全排序 / 第一名）
    io/template.py    标准模板导入导出（.xlsx / .csv）
    io/legacy.py      读取旧版 "MCDA ELT V7" 工作簿
    io/report.py      Excel 报告导出
    project/          项目模型 v2：校验、迁移、分析流水线、价值函数、硬性条件、权重、
                      稳健性分析、结论要点、报告 v2 的工作表
    tables/           任意表格：读取、识别表头和列类型、转换成项目
    templates/        内置模板（*.json）及按别名对应列
  scripts/            make_elt_template.py：从旧版工作簿生成 ELT 模板
  tests/              单元测试、API 测试，以及与旧版 Excel 结果的对照测试
  openapi.json        API 约定（自动生成，前端类型由它生成）
frontend/             前端：React + TypeScript + Vite + ECharts（见 frontend/README.md）
  e2e/                Playwright 端到端测试
data/legacy/          旧版 V7 工作簿，作为对照参考数据
docs/
  ROADMAP.md          路线图
  data-format.md      输入模板格式说明
  adr/                架构决策记录
.github/              CI 流程和 Dependabot 配置
docker-compose.yml    用容器在本地运行完整服务
```

## 快速开始

需要先安装 [uv](https://docs.astral.sh/uv/) 和 [Node.js](https://nodejs.org/)（24 或更新版本）。

开两个终端，分别启动后端和前端：

```bash
cd backend && uv sync && uv run uvicorn mcda_api.main:app --reload
```

```bash
cd frontend && npm install && npm run dev
```

然后打开 http://localhost:5173 。

在 Claude 桌面应用里，`.claude/launch.json` 已经配置好了 `api` 和 `web` 两个启动项。

### 界面流程

1. **数据**：上传标准模板或旧版 V7 工作簿（也可以用示例数据），然后直接在表格里修改。缺值、重名等问题会实时提示，并标出具体位置。
2. **准则与权重**：设置每个准则的方向和权重（滑块或输入框），右侧实时显示加权和排名，并标出与导入时相比的名次变化。
3. **结果**：选择方法和归一化方式，对比各方法的排名，并查看得分图、名次变化图、加权和得分构成和 Pareto 分析。
4. **敏感性分析**：权重稳定区间图（完整排序或第一名），以及最敏感的准则。
5. **导出**：下载 Excel 报告，或把数据导出为模板。

### 用 Docker 运行

不需要安装 Python 和 Node.js，只要有 Docker：

```bash
docker compose up --build
```

然后打开 http://localhost:8080 。

### 开发

开发流程、代码规范、测试和提交约定见 [CONTRIBUTING.md](CONTRIBUTING.md)。

后端启动后，打开 http://127.0.0.1:8000/docs 可以看到交互式接口文档，并直接试用每个接口。

可用环境变量配置：

| 变量 | 默认值 | 作用 |
|---|---|---|
| `MCDA_CORS_ORIGINS` | `http://localhost:5173,http://127.0.0.1:5173` | 允许跨域访问的前端地址，逗号分隔 |
| `MCDA_MAX_UPLOAD_MB` | `5` | 上传文件的大小上限 |
| `MCDA_LOG_LEVEL` | `INFO` | 日志级别 |
| `MCDA_LOG_FORMAT` | `text` | 日志格式：开发用 `text`，生产环境用 `json` |

### 接口一览

API 是**无状态**的：前端在每次请求里带上完整的项目数据，服务器不保存任何内容。项目文件的格式见 `backend/project.schema.json`。

旧的"问题"接口（`/problems/*`、`/evaluate`、`/pareto`、`/sensitivity/stability`、`/export/*`）已经删除（ADR 0008）。在 v0.1.0 之前，接口仍可能不兼容地改变，外部程序不应依赖这个 API。

| 接口 | 作用 |
|---|---|
| `POST /api/v1/projects/migrate` | 把任意受支持版本的项目文件（或版本 3 的问题格式）升级为当前版本 |
| `POST /api/v1/tables/inspect` | 上传任意 `.xlsx` / `.csv`：标准模板和旧版工作簿直接返回项目，其他表格返回识别出的结构；带 `template_id` 时按别名匹配模板准则 |
| `POST /api/v1/tables/build` | 按用户选择的列对应关系，把表格转换成项目 |
| `POST /api/v1/projects/quality` | 数据质量报告（缺失值、常数列、极端值等） |
| `POST /api/v1/projects/import` | 上传标准模板或旧版 V7 工作簿，转换成项目 |
| `POST /api/v1/projects/validate` | 校验项目 |
| `POST /api/v1/projects/evaluate` | 计算：合格和被排除的方案、补全的缺失值、权重、价值分、各方法结果、Pareto 分析、结论要点 |
| `POST /api/v1/projects/weights` | 各层的局部权重（含 AHP 一致性）和每个准则的最终权重 |
| `POST /api/v1/projects/curve` | 某个准则的价值曲线及各方案在曲线上的位置 |
| `POST /api/v1/projects/robustness` | 蒙特卡洛稳健性分析：名次分布、排第一的概率、两两胜率、可靠程度 |
| `POST /api/v1/projects/stability` | 权重稳定区间（基于价值分上的加权和） |
| `POST /api/v1/projects/report` | Excel 报告：结论、结果、数据处理说明、权重来源、稳定区间、Pareto、稳健性，以及可重新导入的原始数据 |
| `GET /api/v1/templates` | 内置模板列表（Amazon 美国站选品、ELT 技术评估） |
| `GET /api/v1/templates/{id}/project` | 从模板生成项目（可选示例数据和权重预设） |
| `GET /api/v1/health` | 健康检查 |
| `GET /api/v1/methods` | 可用方法、可选的归一化方式和默认参数 |
| `GET /api/v1/template` | 下载示例模板（xlsx / csv） |

所有错误都用同一种格式返回。`code` 是固定的错误代码，由前端翻译成用户的语言；`detail` 和 `message` 是英文备用文字：

```json
{"code": "invalid_problem", "detail": "Invalid decision problem", "params": {},
 "issues": [{"code": "value_not_number", "params": {"value": "n/a"},
             "location": {"kind": "cell", "ref": "C4"},
             "message": "value must be a number, found 'n/a'"}],
 "request_id": "3f2c…"}
```

每个请求都有编号（响应头 `X-Request-ID`），日志里也会记录，方便排查问题。日志不会记录请求里的业务数据。

稳定区间里，上限为 `null` 表示该权重可以无限增大而排名不变。

### 在 Python 里直接调用

```python
from mcda_core import weighted_sum, topsis, compromise_programming, weight_stability_intervals
from mcda_core.io import read_problem

problem = read_problem("my_problem.xlsx")
result = topsis(problem)
print(result.order)                       # 从最优到最差
print(weight_stability_intervals(problem))
```

## 方法说明

| 方法 | 得分含义 | 默认归一化 |
|---|---|---|
| `weighted_sum` | 权重 × 归一化值之和，越高越好 | min_max |
| `topsis` | 与理想解的相对贴近度（0–1），越高越好 | vector（经典 TOPSIS） |
| `compromise_programming` | 到理想点的加权 L_p 距离，越低越好；`p` 可调（1、2、∞） | min_max |

- 准则支持**效益型（越大越好）和成本型（越小越好）**两种方向。
- `fixed_range` 按固定上下限归一化（例如旧版的 0–100 量纲）。用它时，一个方案的得分不会因为增删其他方案而改变。
- 权重按给定值保存，计算时归一化为总和 1，这不影响排名。

### 与旧版工具的区别

- 旧版 TOPSIS 和 CP 固定用 100/0 作为理想点，而且所有准则都默认越大越好。新版使用标准定义，并支持准则方向。所以**同一份数据在新旧两版里的 TOPSIS/CP 得分可能不同**，这是有意的改动。想得到"固定理想点"的效果，可以选 `fixed_range` 归一化。
- 旧版"CP"实际算的是一个类似 TOPSIS 的比值。新版 CP 是 Zeleny 定义的 L_p 距离。

## 已验证的内容

`tests/test_legacy_reference.py` 用 `data/legacy/` 里全部 10 个 V7 工作簿做对照：

- 加权和排序与 Excel 的排序一致（并列方案除外）；
- 每个权重非零的准则，其权重稳定区间（原始值和归一化值，全排序和第一名两种口径）与 Excel 的结果一致（相对误差 1e-6）。

## 路线图

已完成：计算核心、FastAPI 后端、React 前端，以及 M0 工程基础。后续计划见 [docs/ROADMAP.md](docs/ROADMAP.md)。

## 许可证

[Apache License 2.0](LICENSE)
