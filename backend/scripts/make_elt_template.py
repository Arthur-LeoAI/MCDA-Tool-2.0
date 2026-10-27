"""Generate the ELT technology assessment template from the legacy V7 workbooks.

Groups follow the legacy scenarios: Tech weights criteria 1-5, Econ 6-13, Enviro 14-34.
Run from backend/: uv run python scripts/make_elt_template.py
"""

import json
from pathlib import Path

from mcda_core.io import read_legacy_workbook

root = Path(__file__).resolve().parents[2]
legacy = root / "data" / "legacy"
out = root / "backend" / "src" / "mcda_core" / "templates" / "elt-technology-assessment.json"

# (id, zh, en) in workbook order; en fixes the typo "Eenergy" (the original stays an alias).
CRITERIA = [
    ("mass_yield", "产品总质量收率", "Overall product mass yield"),
    ("waste_factor", "废物系数", "Waste factor"),
    ("energy_consumption", "每吨废轮胎处理能耗", "Energy consumption per t ELT treated"),
    ("energy_efficiency", "能源效率", "Energy efficiency"),
    ("trl", "技术成熟度（TRL）", "Technology readiness level (TRL)"),
    ("capex", "资本支出（Capex）", "Capex"),
    ("opex", "运营支出（Opex）", "Opex"),
    ("npv", "净现值（NPV）", "NPV"),
    ("irr", "内部收益率（IRR）", "Internal rate of return"),
    ("payback", "投资回收期", "Payback period"),
    ("mpsp", "最低产品售价（MPSP）", "MPSP"),
    ("mpsp_ratio", "MPSP 与市场价格之比", "MPSP to market price ratio"),
    ("mpsp_half_capacity", "半产能时 MPSP 的变化", "MPSP variation at half capacity"),
    ("global_warming", "全球变暖", "Global warming"),
    ("ozone_depletion", "平流层臭氧消耗", "Stratospheric ozone depletion"),
    ("ionizing_radiation", "电离辐射", "Ionizing radiation"),
    ("ozone_human", "臭氧形成（人体健康）", "Ozone formation, human health"),
    ("particulate_matter", "细颗粒物形成", "Fine particulate matter formation"),
    ("ozone_terrestrial", "臭氧形成（陆地生态系统）", "Ozone formation, terrestrial ecosystems"),
    ("acidification", "陆地酸化", "Terrestrial acidification"),
    ("freshwater_eutrophication", "淡水富营养化", "Freshwater eutrophication"),
    ("marine_eutrophication", "海洋富营养化", "Marine eutrophication"),
    ("terrestrial_ecotoxicity", "陆地生态毒性", "Terrestrial ecotoxicity"),
    ("freshwater_ecotoxicity", "淡水生态毒性", "Freshwater ecotoxicity"),
    ("marine_ecotoxicity", "海洋生态毒性", "Marine ecotoxicity"),
    ("human_carcinogenic", "人体致癌毒性", "Human carcinogenic toxicity"),
    ("human_noncarcinogenic", "人体非致癌毒性", "Human non-carcinogenic toxicity"),
    ("land_use", "土地利用", "Land use"),
    ("mineral_scarcity", "矿产资源稀缺", "Mineral resource scarcity"),
    ("fossil_scarcity", "化石资源稀缺", "Fossil resource scarcity"),
    ("water_consumption", "水消耗", "Water consumption"),
    ("human_health", "人体健康（终点）", "Human health (endpoint)"),
    ("ecosystem", "生态系统（终点）", "Ecosystem (endpoint)"),
    ("resources", "资源（终点）", "Resources (endpoint)"),
]
GROUPS = [
    ("technical", "技术", "Technical", 0, 5),
    ("economic", "经济", "Economic", 5, 13),
    ("environmental", "环境", "Environmental", 13, 34),
]

books = {
    s: read_legacy_workbook(legacy / f"MCDA ELT V7_{s}_G_Top1.xlsx")
    for s in ("Equal", "Hier", "Econ", "Tech", "Enviro")
}
problem = books["Hier"].problem
assert len(problem.criteria) == len(CRITERIA) == 34
for _criterion, c in zip(CRITERIA, problem.criteria, strict=True):
    assert c.direction.value == "benefit", c.name

group_of = {cid: g for g, _, _, a, b in GROUPS for cid, _, _ in CRITERIA[a:b]}


def weights_of(book) -> list[float]:
    return [c.weight for c in book.problem.criteria]


def preset(scenario: str) -> dict:
    """Group weights that reproduce the scenario's criterion weights, criteria equal within groups."""
    w = weights_of(books[scenario])
    group_weights = {g: sum(w[a:b]) for g, _, _, a, b in GROUPS}
    for g, _, _, a, b in GROUPS:  # the scenarios weigh criteria equally within each group
        assert max(w[a:b]) - min(w[a:b]) < 1e-9, (scenario, g)
    total = sum(group_weights.values())
    return {"groups": {"method": "direct", "weights": {g: round(v / total, 12) for g, v in group_weights.items()}}}


NAMES = {
    "equal": ("所有准则同等重要", "All criteria equal", "Equal"),
    "hier": ("三组同等重要（默认）", "Groups equal (default)", "Hier"),
    "econ": ("只看经济", "Economic only", "Econ"),
    "tech": ("只看技术", "Technical only", "Tech"),
    "enviro": ("只看环境", "Environmental only", "Enviro"),
}

ids = [f"t{i + 1}" for i in range(len(problem.alternatives))]
template = {
    "id": "elt-technology-assessment",
    "version": 1,
    "domain": "research",
    "name": {"zh": "ELT 技术评估", "en": "ELT technology assessment"},
    "description": {
        "zh": (
            "比较 7 种废旧轮胎（ELT）处理技术的技术、经济和环境表现，数据来自旧版 V7 工作簿。"
            "所有指标都已换算为 0–100 分，分数越高越好。"
        ),
        "en": (
            "Compare seven end-of-life tyre (ELT) treatment technologies on technical, economic and environmental "
            "performance, with the data of the legacy V7 workbooks. Every indicator is already a 0-100 score; "
            "higher is better."
        ),
    },
    "terms": {"alternative": {"zh": "技术", "en": "Technology"}},
    "groups": [{"id": g, "name": {"zh": zh, "en": en}} for g, zh, en, _, _ in GROUPS],
    "criteria": [
        {
            "id": cid,
            "group_id": group_of[cid],
            "name": {"zh": zh, "en": en},
            "aliases": sorted({c.name, en}),
            "unit": {"zh": "分", "en": "score"},
            "value_function": {"kind": "linear", "direction": "benefit", "bounds": [0, 100]},
        }
        for (cid, zh, en), c in zip(CRITERIA, problem.criteria, strict=True)
    ],
    "presets": [
        {"id": pid, "name": {"zh": zh, "en": f"{en} ({legacy_name})"}, "weighting": preset(legacy_name)}
        for pid, (zh, en, legacy_name) in NAMES.items()
    ],
    "default_preset": "hier",
    "example": {
        "alternatives": [{"id": i, "name": n} for i, n in zip(ids, problem.alternatives, strict=True)],
        "data": {
            cid: {i: float(problem.matrix[r][j]) for r, i in enumerate(ids)} for j, (cid, _, _) in enumerate(CRITERIA)
        },
    },
}
out.write_text(json.dumps(template, ensure_ascii=False, indent=2) + "\n", encoding="utf-8", newline="\n")
print("wrote", out, {p["id"]: p["weighting"]["groups"]["weights"] for p in template["presets"]})
