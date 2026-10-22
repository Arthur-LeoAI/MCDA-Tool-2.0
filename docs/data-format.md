# 输入数据格式

## 标准模板（`mcda_core.io.read_problem`）

支持 `.xlsx` 和 `.csv`。Excel 文件优先读取名为 `Decision` 的工作表，没有的话读取第一个工作表。

| A 列 | B 列 | C 列 | … |
|---|---|---|---|
| `Criterion` | 准则 1 名称 | 准则 2 名称 | … |
| `Direction` | `benefit` | `cost` | … |
| `Weight` | 0.6 | 0.4 | … |
| 方案 1 名称 | 数值 | 数值 | … |
| 方案 2 名称 | 数值 | 数值 | … |

- `Direction` 填 `benefit`（越大越好）或 `cost`（越小越好），也接受 `max` / `min` 和 `1` / `0`。
- 权重不能为负，且至少有一个大于 0；权重总和不需要等于 1。
- 至少要有 2 个方案、1 个准则；方案名和准则名都不能重复。
- 空行和右侧的空列会被忽略。
- CSV 支持逗号或分号分隔。分号分隔的文件（德语或欧洲区域设置的 Excel 导出）可以使用小数逗号，例如 `0,6`。
- 读取时会一次性列出所有问题，每个问题都带单元格位置（如 `C4: value must be a number`）。

可以用 `mcda_core.io.write_problem(problem, "template.xlsx")` 从现有问题生成一份模板。

## 旧版 V7 工作簿（`mcda_core.io.read_legacy_workbook`）

工作表名为 "Stability Interval"，标签都在 A 列：

| 行 | 内容 |
|---|---|
| 1 | 每个准则的目标：1 = 最大化，0 = 最小化 |
| 2 | 该列是否已缩放到 Max = 100 / Min = 0（1 = 是） |
| 3 | 表头：`No.`、各准则名称、`Rank` |
| 4 起 | 每行一个方案，后面接 `Criteria Weight` 行 |
| 之后 | Excel 计算的权重稳定区间：`Maximum/Minimum Criteria Weight (Full Order)`、`… - Top:1`，以及对应的 `Normalised` 版本 |

注意事项：

- `Rank` 列表示的是**排序**，不是每个方案自己的名次：第 k 行的值是排在第 k 位的方案编号。
- 某个权重可以无限增大时，Excel 有时写空值，有时写一个很大的数（约 4e15）。两种情况在读取时都按无穷大处理。
- 权重为 0 的准则，Excel 的区间一律写 0/0，表示没有分析，不是计算结果。
