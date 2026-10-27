# S6 设计说明：结论页和报告 v2

- 状态：已完成
- 依据：需求文档 F6.1、F6.2；技术设计 §3.4、§5；ADR 0007、ADR 0008

## 要解决的问题

现在的结果页只有图表和表格。用户还需要自己回答"推荐哪个，为什么，靠不靠得住"。Excel 报告也只有计算结果，没有记录数据是怎么处理的、权重是怎么来的。S6 补上这两部分，并删除已经不用的旧接口。

## 结论要点（后端）

`mcda_core.project.conclusions` 根据加权和的结果计算**结构化的要点**（ADR 0007）：

| 字段 | 内容 |
|---|---|
| `winner`、`runner_up` | 第一名和第二名的 id 和得分（0–100 分）。计算至少需要 2 个合格方案，所以总有第二名；并列时按方案顺序取 |
| `score_gap` | 两者的分差 |
| `tied` | 和第一名并列的方案（不含第一名本身） |
| `top_contributions` | 第一名得分贡献最大的 3 个准则：w_j · V_winner,j，乘以 100 |
| `advantages` | 相对第二名的优势：d_j = w_j · (V_winner,j − V_runner,j) × 100，正值中最大的 3 个 |
| `disadvantages` | 负值中绝对值最大的 3 个 |
| `caveats` | 需要提醒用户的事项，每条是代码加参数 |

只有加权和是可加模型，优势和劣势才能精确地拆分到每个准则，所以结论以加权和为准，和技术设计 §3.4 一致。

**提醒（caveats）**：

| 代码 | 什么时候出现 |
|---|---|
| `caveat_tied_first` | 有方案和第一名并列 |
| `caveat_imputed` | 有缺失值被补上（列出涉及的准则） |
| `caveat_constant` | 某个权重大于 0 的准则在合格方案上全部相同，没有区分作用 |
| `caveat_ahp_inconsistent`、`caveat_ahp_inconsistent_groups`、`caveat_ahp_inconsistent_criteria` | 某个分组内、分组之间或未分组准则的两两比较 CR > 0.1 |
| `caveat_methods_disagree` | 专家模式里打开的其他方法给出的第一名不同 |
| `caveat_excluded` | 有方案被硬性条件或缺失值处理排除 |

和错误代码一样，这些代码放在后端的 `MESSAGES` 里（英文），前端翻译，`errors.test.ts` 检查每个代码都有中英文。

**可靠程度**来自 S5 的稳健性分析（`/projects/robustness` 的 `confidence`）。它比较慢，所以不放进 `/projects/evaluate`；结果页单独请求，然后和要点一起写成文字。

`/projects/evaluate` 新增字段 `conclusion`。

## 结论文字（前端）

`frontend/src/i18n/conclusion.ts` 用固定模板把要点写成几段话，中英文各一套，不调用大语言模型。同样的要点总是得到同样的文字。内容依次是：

1. 推荐：`推荐 {winner}，得分 {score}，比第二名 {runner_up} 高 {gap} 分。`（并列第一时用别的句式）
2. 理由：得分贡献最大的准则。
3. 和第二名相比：优势在哪里，劣势在哪里（没有劣势时说明）。
4. 可靠程度：等级和排第一的概率，以及抽样方式。
5. 提醒：每条 caveat 一句。被排除的方案及原因仍然在下方单独列出。

分差很小（< 1 分）时，第一句会提醒"差距很小"。

结果页在最上方显示"结论"卡片。

## Excel 报告 v2

`POST /api/v1/projects/report` 新增参数：
- `conclusion`：前端已经生成好的结论文字（按界面语言），写进"Conclusion"工作表。这样报告和界面上的文字完全一样，模板也只维护一份；
- `include_robustness`：默认 true。

工作表（表头用英文，和现有报告一致）：

| 工作表 | 内容 |
|---|---|
| Conclusion | 结论文字；要点表（第一名、第二名、分差、可靠程度、排第一的概率） |
| Results | 不变 |
| Data handling | 每个准则的分组、类型、单位、价值函数及参数、缺失值处理；硬性条件；被排除的方案及原因；补上的缺失值 |
| Weights | 每一层：方式（直接、排序及公式、两两比较）、每一项的局部权重和最终权重；两两比较的 CR |
| Robustness | 抽样设置；每个方案排第一的概率、平均名次、各名次的概率 |
| Stability、Pareto、Decision | 不变 |

## 删除旧接口（ADR 0008）

前端已经全部改用 `/projects/*` 和 `/tables/*`。删除：`/problems/validate`、`/problems/import`、`/evaluate`、`/pareto`、`/sensitivity/stability`、`/export/problem`、`/export/report`，以及只有它们用到的请求和响应模型。保留 `/health`、`/methods`、`/template`。相应的 API 测试改为针对项目接口，计算核心的测试不变。

## 怎么验证

- 后端单元测试：贡献、优势和劣势的手算值；并列第一；每种提醒的触发条件；报告的工作表和关键单元格；旧接口返回 404。
- 前端单元测试：中英文结论文字的几种情况（正常、并列、差距很小、没有劣势），同样的输入得到同样的文字。
- 端到端测试：示例数据的结果页显示结论和可靠程度；下载的报告包含新的工作表。
