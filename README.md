# MCDA 决策分析工具（重构版）

多准则决策分析（MCDA）工具的重构版本，用来替代旧仓库 [MCDA-Tool-2.0](https://github.com/Arthur-LeoAI/MCDA-Tool-2.0)。

所有计算都只在 Python 计算核心 `mcda_core` 里实现一次，后端 API 和前端只调用它，不再像旧版那样在 JS 和 Python 里各写一套。

## 目录结构

```
backend/              Python 后端
  src/mcda_api/       FastAPI 服务（HTTP 接口）
    main.py           应用入口、配置（CORS、上传大小）
    routes.py         接口实现
    schemas.py        请求/响应数据结构
    errors.py         统一的错误格式
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
  tests/              单元测试、API 测试，以及与旧版 Excel 结果的对照测试
data/legacy/          旧版 V7 工作簿，作为对照参考数据
docs/data-format.md   输入模板格式说明
frontend/             前端：React + TypeScript + Vite + ECharts（见 frontend/README.md）
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

### 运行测试

```bash
cd backend && uv run pytest
```

```bash
cd frontend && npm test
```

### 启动 API

```bash
cd backend
uv run uvicorn mcda_api.main:app --reload
```

启动后打开 http://127.0.0.1:8000/docs ，可以看到交互式接口文档，并直接在页面上试用每个接口。

可用环境变量配置：

| 变量 | 默认值 | 作用 |
|---|---|---|
| `MCDA_CORS_ORIGINS` | `http://localhost:5173,http://127.0.0.1:5173` | 允许跨域访问的前端地址，逗号分隔 |
| `MCDA_MAX_UPLOAD_MB` | `5` | 上传文件的大小上限 |

### 接口一览

API 是**无状态**的：前端在每次请求里带上完整的问题数据，服务器不保存任何内容。

| 接口 | 作用 |
|---|---|
| `GET /api/health` | 健康检查 |
| `GET /api/methods` | 可用方法、可选的归一化方式和默认参数 |
| `POST /api/problems/import` | 上传 `.xlsx` / `.csv`，自动识别标准模板或旧版 V7 工作簿 |
| `POST /api/problems/validate` | 校验问题数据 |
| `POST /api/evaluate` | 用一种或多种方法计算得分和排名 |
| `POST /api/pareto` | Pareto 支配分析 |
| `POST /api/sensitivity/stability` | 权重稳定区间（全排序或第一名） |
| `GET /api/template` | 下载示例模板（xlsx / csv） |
| `POST /api/export/problem` | 把问题导出为模板文件 |
| `POST /api/export/report` | 导出 Excel 报告：结果、稳定区间、Pareto，以及可重新导入的原始数据 |

所有错误都用同一种格式返回，方便前端直接逐条显示：

```json
{"detail": "Invalid decision problem",
 "issues": [{"location": "C4", "message": "value must be a number"}]}
```

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

- [x] 阶段 0：新项目骨架、`.gitignore`
- [x] 阶段 1：计算核心、导入校验、单元测试
- [x] 阶段 2：FastAPI 后端（上传、计算、敏感性分析、导出）
- [x] 阶段 3：前端（React + TypeScript + Vite + ECharts）
- [ ] 阶段 4：情景对比、蒙特卡洛权重模拟、AHP / 熵权法、VIKOR / PROMETHEE、报告导出
