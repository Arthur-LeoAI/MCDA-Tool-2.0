# 技术设计：MVP（v0.1.0）

- 状态：已确认（2026-10-23）
- 日期：2026-10-23
- 相关文档：[需求文档](prd.md)、ADR [0005](../adr/0005-value-functions-and-additive-model.md)、[0006](../adr/0006-project-file-format.md)、[0007](../adr/0007-deterministic-explanations.md)、[0008](../adr/0008-api-v1-evolves-until-first-release.md)

## 1. 总览

```
浏览器（React）                                   服务器（无状态）
┌─────────────────────────────┐   JSON/HTTP   ┌────────────────────────────────┐
│ 引导模式向导 / 专家模式页面  │ ────────────▶ │ mcda_api（FastAPI，/api/v1）    │
│ 项目状态（zustand）          │ ◀──────────── │   └─ mcda_core                 │
│ 自动保存到 localStorage      │               │       ├─ tables  表格读取和类型识别 │
│ 保存和打开 .mcda.json 文件   │               │       ├─ project 项目模型 v2      │
└─────────────────────────────┘               │       ├─ pipeline 分析流水线      │
                                              │       ├─ weighting 权重（排序、AHP）│
                                              │       ├─ robustness 蒙特卡洛      │
                                              │       ├─ explain 结论要点         │
                                              │       └─ （现有）methods、sensitivity、pareto │
                                              └────────────────────────────────┘
```

基本原则不变：计算只在 `mcda_core` 里实现（ADR 0002），服务器不保存数据（ADR 0003），错误都用代码表示（ADR 0004）。

新增的核心思路：**价值函数是统一的数据处理层**（ADR 0005）。所有原始数据（数值、等级、分类、是/否、缺失值）先换算成 0–1 的"价值分"，各种方法都在价值分上计算。现有的归一化方式都是价值函数的特例：

| 现有的归一化 | 对应的价值函数 |
|---|---|
| `min_max` | 线性，范围取数据的最小值和最大值 |
| `fixed_range` | 线性，范围由用户设定 |
| `none`（旧版 0–100 数据） | 线性，固定范围 [0, 100] |

把所有准则都按同一个比例缩放，不会改变加权和的排名，也不会改变稳定区间，所以旧版 Excel 的对照测试仍然成立。

## 2. 领域模型 v2

所有对象都有稳定的 `id`（短字符串），名称可以随意修改，不影响引用关系。

```
Project
├─ meta: name, description, template_id?, language, created, modified
├─ alternatives: [Alternative{id, name, note?}]
├─ groups: [Group{id, name}]                      （一层分组；可以为空）
├─ criteria: [Criterion]
│    Criterion{id, name, group_id?, type, unit?, direction?,
│              value_function, categories?, missing, note?}
├─ data: {criterion_id: {alternative_id: RawValue}}   RawValue = number | string | boolean | null
├─ constraints: [Constraint]
├─ weighting: Weighting
├─ analysis: AnalysisSettings
├─ source?: {filename, kind: "table" | "template" | "legacy", sheet?, header_row?, column_map?, legacy?}
└─ ui?: 界面状态（当前模式、步骤），不参与计算
```

### 2.1 准则类型

| `type` | 原始值 | 换算成价值分 |
|---|---|---|
| `numeric` | 数字 | 用 `value_function` 计算（见 §3.3） |
| `ordinal` | 有顺序的文字（如 低 < 中 < 高） | `categories: [{label, score}]`，按顺序排列；默认分数均匀分布在 0 到 1 之间，最好的取值为 1 |
| `categorical` | 没有顺序的文字 | `categories: [{label, score}]`，分数由用户设定 |
| `boolean` | 是/否 | `direction` 为 benefit 时，是 = 1、否 = 0；为 cost 时相反 |

### 2.2 价值函数（`numeric` 类型）

```
ValueFunction =
  | {kind: "linear", direction, bounds: "data" | [low, high]}
  | {kind: "log",    direction, bounds: "data" | [low, high]}       # 要求 x ≥ 0
  | {kind: "target", lower, ideal_low, ideal_high, upper}           # 梯形：区间内为 1，到边界线性降为 0
  | {kind: "piecewise", points: [[x, v], ...]}                      # 自定义折线，v ∈ [0, 1]
```

"阈值"和"阶梯"在界面上是 `piecewise` 的预设，例如 `[[t, 0], [full, 1]]`。

### 2.3 缺失值的处理方式（`missing`）

| 值 | 含义 |
|---|---|
| `worst`（默认） | 价值分取 0，最保守 |
| `mean` | 取其他方案在这个准则上价值分的平均值（在价值分上取平均，而不是在原始值上） |
| `exclude` | 排除这个方案，并记录原因 |
| `require` | 有缺失值就报校验错误，要求用户补全 |

### 2.4 硬性条件

```
Constraint =
  | {id, criterion_id, op: ">=" | "<=" | ">" | "<", value: number}
  | {id, criterion_id, op: "between", low, high}
  | {id, criterion_id, op: "in", labels: [string]}       # 等级、分类、是/否
  | {id, criterion_id, op: "present"}                    # 不能缺失
```

硬性条件作用在**原始值**上。如果条件涉及的值缺失了，这一条就算不满足，除非设置了 `allow_missing: true`。

### 2.5 权重

```
Weighting{
  groups?:  LevelWeighting           # 组之间的权重（有分组时）
  within:   {group_id | "_root": LevelWeighting}
}
LevelWeighting =
  | {method: "direct", weights: {id: number}}
  | {method: "rank",   order: [[id, ...], ...], formula: "roc" | "rank_sum"}   # 内层数组表示并列
  | {method: "ahp",    comparisons: {"i|j": number}}                          # Saaty 1–9 标度及其倒数
```

最终（全局）权重：w_j = W_g(j) · w_{j|g}，再归一化为总和 1。没有分组时，只有 `_root` 这一层。

每一层都保留**所有方式的输入**（例如同时保存排序和直接输入的权重），所以用户切换方式时不会丢失之前的输入；`method` 字段决定当前使用哪种方式。

### 2.6 分析设置

```
AnalysisSettings{
  methods: [MethodSpec]                    # 默认 [weighted_sum]；专家模式可以加 TOPSIS、CP
  robustness: {mode: "around" | "unknown", spread: 0.2, samples: 5000, seed: 1}
  stability_scope: "full_order" | "top1"
}
```

## 3. 分析流水线

```
原始数据 ─▶ ① 类型解析 ─▶ ② 硬性条件 ─▶ ③ 缺失值 ─▶ ④ 价值函数 ─▶ 价值矩阵 V (m 个方案 × n 个准则，值在 [0,1])
                                                                       │
权重设置 ─────────────────────▶ ⑤ 全局权重 w ────────────────────────┤
                                                                       ▼
                                   ⑥ 计算方法（加权和；专家模式可选 TOPSIS、CP） ─▶ 得分和排名
                                   ⑦ 稳健性分析（蒙特卡洛） ─▶ 名次概率
                                   ⑧ 结论要点 ─▶ 前端按模板生成文字
```

1. **类型解析**：把原始值解析成对应的类型。解析时接受"$1,234.5""15%""1.234,5"（欧洲格式）等写法，无法解析的值报告为数据质量问题。
2. **硬性条件**：不满足条件的方案移入"已排除"列表，并记录违反了哪一条。之后各步骤只处理剩下的方案（合格方案）。
3. **缺失值**：`exclude` 会排除方案；`require` 会报错；`worst` 和 `mean` 在第 4 步之后补上价值分。
4. **价值函数**：`bounds: "data"` 时，范围取**合格方案**在这个准则上的最小值和最大值。如果所有值都相同，价值分全部为 1（这个准则无法区分方案，界面会提示）。
5. **全局权重**：见 §3.2。
6. **计算方法**：
   - 加权和：S_i = Σ_j w_j · V_ij，显示时乘以 100，即 0–100 分；同时返回每个准则的得分贡献 w_j · V_ij。
   - TOPSIS 和 CP 直接用 V 计算（V 已经是"越大越好"的 [0,1] 分数）。
   - 专家模式保留"经典 TOPSIS（原始数据，向量归一化）"，前提是所有准则都是数值类型、并且都用线性价值函数。
   - 权重稳定区间和 Pareto 分析也在 V 上计算。

### 3.1 价值函数的公式

设范围为 [a, b]，原始值为 x，价值分 v ∈ [0, 1]，结果都会限制在 [0, 1] 内。

- **线性**：benefit 时 v = (x − a) / (b − a)，cost 时 v = (b − x) / (b − a)。a = b 时 v = 1。
- **对数**：先把每个值换成 L(x) = ln(1 + x)，再在 [L(a), L(b)] 上按线性公式计算。要求 x ≥ 0。
- **目标区间**：x 在 [ideal_low, ideal_high] 内时 v = 1；在 [lower, ideal_low] 之间从 0 线性升到 1；在 [ideal_high, upper] 之间从 1 线性降到 0；超出 [lower, upper] 时 v = 0。
- **自定义折线**：在相邻两个点之间线性插值；第一个点之前取第一个点的值，最后一个点之后取最后一个点的值。点要按 x 排序，并且 x 不能重复。

### 3.2 权重的公式

- **ROC（Rank Order Centroid）**：n 个对象中排第 r 位（1 为最重要）的权重是
  w_r = (1/n) · Σ_{k=r}^{n} 1/k。并列的对象取它们所占名次的 ROC 权重的平均值。
  例：n = 3 时，权重为 0.6111、0.2778、0.1111（Barron & Barrett, 1996）。
- **Rank-Sum**：w_r = 2(n + 1 − r) / (n(n + 1))，并列时同样取平均。
- **AHP**：两两比较构成正互反矩阵 A（a_ji = 1/a_ij）。
  - 权重 = 主特征向量，归一化为总和 1（用幂迭代求解，收敛阈值 1e-12）；
  - 一致性：λ_max 是主特征值，CI = (λ_max − n)/(n − 1)，CR = CI / RI(n)；
  - RI 取 Saaty 的随机一致性指数：n = 3 到 10 时分别为 0.58、0.90、1.12、1.24、1.32、1.41、1.45、1.49；n ≤ 2 时 CR = 0；
  - CR > 0.1 时提示判断不一致，并按 |ln(a_ij · w_j / w_i)| 从大到小，指出最不一致的几对比较；
  - 每层最多 10 个对象（比较次数为 n(n−1)/2，太多时用户难以做出一致的判断），超过时界面建议先分组。
  - 缺少的比较：MVP 要求每一对都要比较。

### 3.3 稳健性分析（蒙特卡洛）

先固定价值矩阵 V，只让权重随机变化：

- **"在当前权重附近"**（默认）：对数正态扰动 w'_j = w_j · exp(σ · z_j)，其中 z_j 服从标准正态分布，σ = spread（默认 0.2，大约相当于"±20%"），再归一化为总和 1。权重为 0 的准则保持为 0。
- **"权重完全未知"**：在所有权重大于 0 的准则上，按 Dirichlet(1, …, 1) 分布抽样，也就是在权重单纯形上均匀抽样。

每次抽样都计算加权和，然后用竞争排名（并列共享名次）排出名次。

输出：
- 名次接受度 b_i^r：方案 i 排在第 r 名的抽样比例（SMAA 中的 rank acceptability index）；
- 排第一的概率：b_i^1，并列第一也算；
- 两两胜率：P(i 的得分 > j 的得分)。

实现方式：权重样本矩阵（N 个样本 × n 个准则）乘以 Vᵀ（n × m），完全向量化计算。N 的上限为 20 000。给定 `seed` 后，结果可以完全复现（使用 `numpy.random.default_rng(seed)`）。

**可靠程度分级**（这是我们自己定的产品规则，不是文献里的标准）：排第一的概率 ≥ 0.8 为"高"，0.5–0.8 为"中"，< 0.5 为"低"。结论里同时显示具体的概率。

### 3.4 结论要点（ADR 0007）

后端只返回**结构化的要点**，文字由前端用 i18n 模板生成：

```
Explanation{
  winner, runner_up, score_gap,                               # 0–100 分制
  top_contributions: [{criterion, contribution}]              # 第一名得分贡献最大的 3 个准则
  advantages_vs_runner_up: [{criterion, difference}]          # d_j = w_j(V_winner,j − V_runner,j)，取正值中最大的 3 个
  disadvantages_vs_runner_up: [{criterion, difference}]       # 取负值中绝对值最大的 3 个
  confidence: {level: "high" | "medium" | "low", p_best}      # 来自稳健性分析
  excluded: [{alternative, constraint_ids, reasons}]
  caveats: [{code, params}]                                   # 例如 imputed_values、constant_criterion、high_ahp_inconsistency
}
```

只有加权和是可加模型，"优势和劣势"才能精确拆分到每个准则。所以结论页以加权和为准。如果专家模式里其他方法给出的第一名不同，会在 caveats 里提示 `methods_disagree`。

## 4. 项目文件格式（ADR 0006）

文件扩展名为 `.mcda.json`，UTF-8 编码的 JSON：

```json
{
  "format": "mcda-project",
  "version": 2,
  "app_version": "0.1.0",
  "meta": {"name": "2026 Q4 选品", "template_id": "amazon-us-product-selection", "language": "zh",
           "created": "2026-10-23T10:00:00Z", "modified": "2026-10-23T11:30:00Z"},
  "alternatives": [{"id": "a1", "name": "Silicone Baking Mat"}, {"id": "a2", "name": "Bamboo Organizer"}],
  "groups": [{"id": "g1", "name": "盈利"}, {"id": "g2", "name": "风险"}],
  "criteria": [
    {"id": "c1", "name": "预估月销量", "group_id": "g1", "type": "numeric", "unit": "units",
     "value_function": {"kind": "log", "direction": "benefit", "bounds": "data"}, "missing": "worst"},
    {"id": "c2", "name": "合规与认证难度", "group_id": "g2", "type": "ordinal",
     "categories": [{"label": "无", "score": 1}, {"label": "一般", "score": 0.5}, {"label": "需认证", "score": 0}],
     "missing": "worst"}
  ],
  "data": {"c1": {"a1": 850, "a2": 1200}, "c2": {"a1": "无", "a2": "一般"}},
  "constraints": [{"id": "k1", "criterion_id": "c3", "op": ">=", "value": 20}],
  "weighting": {"groups": {"method": "rank", "order": [["g1"], ["g2"]], "formula": "roc"},
                "within": {"g1": {"method": "direct", "weights": {"c1": 1}}}},
  "analysis": {"methods": [{"method": "weighted_sum"}],
               "robustness": {"mode": "around", "spread": 0.2, "samples": 5000, "seed": 1}}
}
```

- **版本升级**：`mcda_core.project.migrate(document)` 依次执行 v1 → v2 → …。浏览器里版本 3 的草稿算作 v1，会被转换成 v2：数值类型、线性价值函数（`bounds` 按当时选择的归一化方式决定）、直接输入的权重。
- **校验**：用 Pydantic 模型校验，并导出 JSON Schema（`backend/project.schema.json`），和 `openapi.json` 一样在 CI 里检查是否最新。
- **文件不包含计算结果**：打开项目时会重新计算。这样保证结果只来自"数据 + 设置 + 程序版本"。

## 5. API 变更（仍在 /api/v1 下，见 ADR 0008）

| 接口 | 作用 |
|---|---|
| `POST /tables/inspect`（上传文件，可带 `?sheet=`） | 读取任意 xlsx 或 csv，返回所有工作表名、猜测的表头行、每列的类型识别结果（数值解析成功率、不同取值、示例值），以及全部单元格（最多 500 行 × 200 列） |
| `POST /projects/validate` | 校验项目，返回问题列表和数据质量报告 |
| `POST /projects/evaluate` | 运行 §3 的第 1–6 步和第 8 步（不含稳健性分析），返回合格和已排除的方案、全局权重和权重诊断（如 CR）、价值矩阵、各方法的结果、Pareto 分析、结论要点 |
| `POST /projects/robustness` | 第 7 步，单独提供，因为它比较慢 |
| `POST /projects/stability` | 在价值矩阵上计算权重稳定区间 |
| `POST /weights/derive` | 计算某一层的权重（排序或 AHP），附带诊断信息；界面实时调用 |
| `POST /projects/report` | 生成 Excel 报告（v2 内容见 PRD F6.2） |
| `GET /templates`、`GET /templates/{id}` | 内置模板 |
| `POST /projects/import` | 标准模板和旧版 V7 工作簿直接转换成项目 |

现有的 `/problems/*`、`/evaluate`、`/pareto`、`/sensitivity/stability`、`/export/*`：等前端迁移到项目接口之后，在发布 v0.1.0 **之前删除**，以免同时维护两套接口。

**新增的错误代码**（前后端同时添加）：`unparseable_value`、`unknown_category`、`constraint_criterion_type`、`value_function_invalid`、`log_negative_value`、`piecewise_points_invalid`、`ahp_incomplete`、`ahp_too_many_items`、`weighting_unknown_id`、`all_alternatives_excluded`、`project_version_unsupported`、`sheet_not_found`、`table_too_large` 等。

## 6. 前端设计

- **状态**：store v2 = `project`（就是 §4 的文件结构）+ `ui`（当前模式、步骤，不参与计算）。zustand 的 persist 功能升级到 version 2，`migrate` 负责把 v1 草稿转换成项目。
- **保存**：自动保存到 localStorage（延迟 500 ms）；超过 4 MB 时提示用户另存为文件。"保存"会下载 `.mcda.json`；"打开"读取文件，由后端迁移版本并校验。
- **引导模式**：新的向导组件，包括场景、导入、对应列、检查、准则、权重、结论七步。每一步的界面都是可以单独测试的组件，并复用专家模式的部件（数据表格、曲线预览、排序列表）。
- **专家模式**：现有的五个页面改为基于项目模型，新增"数据处理"页面（类型、价值函数、缺失值、硬性条件）。
- **新部件**：
  - 价值函数编辑器：在 ECharts 曲线上标出各个方案的位置，可以拖动折线的点；
  - 可拖动的排序列表：支持键盘操作，可以设置并列；
  - AHP 比较矩阵：只需要填上三角部分，自动显示一致性；
  - 名次概率热力图；
  - 结论卡片。
- **功能开关**：`src/flags.ts`。未完成的功能（例如引导模式）默认关闭；开发时可以通过 `?flags=guided` 打开。
- **结论文字**：在 `i18n/explain.ts` 里按语言维护模板，输入是 §3.4 的结构化要点，输出是段落。

## 7. 模板格式

```json
{
  "id": "amazon-us-product-selection", "version": 1, "domain": "ecommerce",
  "name": {"zh": "Amazon 美国站选品", "en": "Amazon US product selection"},
  "description": {"zh": "...", "en": "..."},
  "terms": {"alternative": {"zh": "产品", "en": "Product"}},
  "currency": "USD",
  "groups": [{"id": "profit", "name": {"zh": "盈利", "en": "Profit"}}, ...],
  "criteria": [
    {"id": "monthly_sales", "group_id": "demand", "name": {"zh": "预估月销量", "en": "Est. monthly sales"},
     "aliases": ["monthly sales", "est. monthly sales", "月销量", "销量"],
     "type": "numeric", "unit": "units",
     "value_function": {"kind": "log", "direction": "benefit", "bounds": "data"},
     "missing": "worst", "help": {"zh": "...", "en": "..."}}
  ],
  "constraints": [{"criterion_id": "margin", "op": ">=", "value": 20, "optional": true}],
  "weighting": {"groups": {"method": "rank", "order": [["profit"], ["demand"], ["competition"], ["risk"]]}},
  "example": {"alternatives": [...], "data": {...}}
}
```

**Amazon 美国站选品**（分组和准则；具体数值都由用户填写，模板不内置任何费用标准）：

| 分组 | 准则 | 类型 | 方向和价值函数 |
|---|---|---|---|
| 需求 | 预估月销量 | 数值 | 越大越好，对数 |
| 需求 | 季节性 | 等级（全年稳定、一般、强季节性） | 越稳定越好 |
| 盈利 | 预估利润率（%） | 数值 | 越大越好，线性；建议硬性条件 ≥ 20 |
| 盈利 | 平台和物流费用占售价比例（%） | 数值 | 越小越好，线性 |
| 竞争 | 头部竞品的平均评论数 | 数值 | 越小越好，对数 |
| 竞争 | 头部竞品的平均评分 | 数值 | 越小越好（评分越低，说明市场越有改进空间），目标区间可选 |
| 风险 | 预估退货率（%） | 数值 | 越小越好，线性 |
| 风险 | 尺寸等级（标准尺寸、大件） | 等级 | 标准尺寸更好 |
| 风险 | 合规和认证难度（无、一般、需认证，如 FCC、儿童产品 CPC） | 等级 | 越低越好 |
| 运营 | 最小起订量 | 数值 | 越小越好，对数 |

**技术评估（ELT）**：用旧版 V7 数据的准则和分组，各准则用线性价值函数，固定范围 [0, 100]。组权重的预设对应旧版的 Equal、Econ、Enviro、Tech、Hier 五种情景（MVP 只能选其中一种作为当前权重，情景对比在 M3）。

模板文件放在 `backend/src/mcda_core/templates/*.json`，用 Pydantic 模型校验，并有测试确认示例数据能完整跑通一遍分析。

## 8. 测试策略

| 层次 | 内容 |
|---|---|
| 单元测试（核心） | 每种价值函数的边界情况和手算值；ROC 和 Rank-Sum 的已知值（如 n = 3）；AHP：用已知权重构造一致矩阵，应该原样还原权重且 CR = 0，用扰动过的矩阵检验 CR 和"最不一致的比较对"；RI 表；缺失值的四种处理；硬性条件；蒙特卡洛：固定种子可复现、"权重完全未知"时平均权重约为 1/n、被支配的方案永远不排第一 |
| 回归测试 | 旧版 V7 对照测试改为走新的流水线（线性、固定范围 [0, 100]），结果必须不变 |
| 属性测试 | 用 Hypothesis 检验：价值分总在 [0,1] 内；把所有权重乘以同一个倍数，排名不变；交换方案的顺序，结果不变 |
| 接口测试 | 每个新接口的正常和错误情况，以及错误代码 |
| 前端单元测试 | 结论文字模板（中英文）、排序转权重的交互逻辑、文件版本迁移 |
| 端到端测试 | 旗舰流程：选模板 → 导入示例表格 → 对应列 → 设置权重 → 查看结论 → 保存项目 → 重新打开后结果一致；旧版工作簿在专家模式下的流程 |
| 性能测试 | 在 CI 里对 100 × 20 的数据跑计算和蒙特卡洛，超过 PRD 的指标就失败 |

## 9. 交付顺序和依赖

```
S1 项目模型 ─┬─▶ S2 数据准备 ─▶ S3 价值函数和硬性条件 ─┐
             └─▶ S4 分组和权重 ──────────────────────────┼─▶ S6 结论页和报告 ─▶ S7 模板 ─▶ S8 引导模式
                 S5 稳健性分析（只依赖 S1 和价值矩阵）─────┘
```

- 每个功能单独开分支、单独合并，没做完的部分用功能开关隐藏。
- S1 完成后，所有现有功能都切换到项目模型上，原有的测试必须全部通过。
- S6 完成后删除旧接口（§5）。
- S8 完成后打开引导模式的开关，跑完所有端到端测试，再按 PRD §7 做可用性测试，然后打标签 v0.1.0。

## 10. 待定问题

1. **AHP 缺少比较时怎么办**：MVP 要求比较完整；以后可以用不完整的 AHP 算法补齐。
2. **多层准则**：M3 再做。v2 的数据结构已经为它留了余地，只要允许分组再包含分组即可。
3. **大文件**：超过 500 行时，`tables/inspect` 只返回前 500 行，并提示用户。
4. **货币和单位换算**：MVP 不做，单位只用于显示。
