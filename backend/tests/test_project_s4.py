"""S4: criteria groups, rank (ROC / rank-sum) and AHP weighting."""

import pytest

from mcda_core.errors import ProblemValidationError
from mcda_core.project import parse_project, prepare
from mcda_core.project.weighting import ahp_weights, derive, rank_weights

ITEMS = ["a", "b", "c"]


def project(groups=(), group_of=None, weighting=None) -> dict:
    """Four criteria c1..c4, optionally grouped; two alternatives."""
    group_of = group_of or {}
    return {
        "format": "mcda-project",
        "version": 2,
        "alternatives": [{"id": "x", "name": "X"}, {"id": "y", "name": "Y"}],
        "groups": [{"id": g, "name": g.upper()} for g in groups],
        "criteria": [
            {
                "id": f"c{k}",
                "name": f"C{k}",
                "group_id": group_of.get(f"c{k}"),
                "value_function": {"kind": "linear", "direction": "benefit"},
            }
            for k in range(1, 5)
        ],
        "data": {f"c{k}": {"x": k, "y": 5 - k} for k in range(1, 5)},
        "weighting": weighting or {},
    }


def weights_of(document: dict) -> dict[str, float]:
    return derive(parse_project(document)).global_weights


def consistent(w: dict[str, float]) -> dict[str, float]:
    """Comparisons that agree exactly with the weights w."""
    ids = list(w)
    return {f"{i}|{j}": w[i] / w[j] for n, i in enumerate(ids) for j in ids[n + 1 :]}


# --- Rank weights ------------------------------------------------------------------------


def test_roc_known_values():
    assert rank_weights(ITEMS, [["a"], ["b"], ["c"]], "roc") == pytest.approx([0.6111, 0.2778, 0.1111], abs=1e-4)


def test_rank_sum_known_values():
    assert rank_weights(ITEMS, [["a"], ["b"], ["c"]], "rank_sum") == pytest.approx([0.5, 1 / 3, 1 / 6])


def test_ties_share_the_mean_of_their_ranks():
    weights = rank_weights(ITEMS, [["a", "b"], ["c"]], "roc")
    assert weights[0] == weights[1] == pytest.approx((0.6111 + 0.2778) / 2, abs=1e-4)
    assert sum(weights) == pytest.approx(1)


def test_unranked_items_tie_last_and_unknown_ids_are_ignored():
    assert rank_weights(ITEMS, [["b"], ["zzz"]], "rank_sum") == pytest.approx([0.25, 0.5, 0.25])


# --- AHP ---------------------------------------------------------------------------------


def test_consistent_matrix_returns_its_weights():
    true = {"a": 0.5, "b": 0.3, "c": 0.2}
    weights, diagnostics = ahp_weights(ITEMS, consistent(true))
    assert weights == pytest.approx(list(true.values()))
    assert diagnostics.cr == pytest.approx(0, abs=1e-9)
    assert diagnostics.consistent
    assert diagnostics.worst_pairs == ()


def test_reverse_keys_mean_the_reciprocal():
    weights, _ = ahp_weights(["a", "b"], {"b|a": 4})
    assert weights == pytest.approx([0.2, 0.8])


def test_perturbed_matrix_is_inconsistent_and_names_the_changed_pair():
    ids = ["a", "b", "c", "d"]
    comparisons = consistent({"a": 0.4, "b": 0.3, "c": 0.2, "d": 0.1})
    comparisons["b|d"] = 1 / 5  # the true ratio is 3
    _, diagnostics = ahp_weights(ids, comparisons)
    assert diagnostics.cr > 0.1
    assert not diagnostics.consistent
    assert (diagnostics.worst_pairs[0].i, diagnostics.worst_pairs[0].j) == ("b", "d")
    assert len(diagnostics.worst_pairs) == 3


def test_nearly_consistent_matrix_has_small_cr():
    # a/b = 3, a/c = 5, b/c = 2 is close to consistent (3 * 2 = 6 vs 5).
    _, diagnostics = ahp_weights(ITEMS, {"a|b": 3, "a|c": 5, "b|c": 2})
    assert 0 < diagnostics.cr < 0.01


# --- Levels and global weights ------------------------------------------------------------


def test_without_groups_direct_weights_are_normalised():
    w = weights_of(project(weighting={"within": {"_root": {"weights": {"c1": 2, "c2": 1, "c3": 1}}}}))
    assert w == pytest.approx({"c1": 0.5, "c2": 0.25, "c3": 0.25, "c4": 0})


def test_group_weight_times_local_weight():
    document = project(
        groups=["g1", "g2"],
        group_of={"c1": "g1", "c2": "g1", "c3": "g2", "c4": "g2"},
        weighting={
            "groups": {"method": "rank", "order": [["g1"], ["g2"]], "formula": "rank_sum"},
            "within": {
                "g1": {"method": "ahp", "comparisons": {"c1|c2": 3}},
                "g2": {"weights": {"c3": 1, "c4": 3}},
            },
        },
    )
    w = weights_of(document)
    assert w == pytest.approx({"c1": 2 / 3 * 0.75, "c2": 2 / 3 * 0.25, "c3": 1 / 3 * 0.25, "c4": 1 / 3 * 0.75})
    assert sum(w.values()) == pytest.approx(1)


def test_ungrouped_criteria_form_the_root_item_and_empty_groups_are_skipped():
    document = project(
        groups=["g1", "empty"],
        group_of={"c1": "g1"},
        weighting={"groups": {"weights": {"g1": 1, "_root": 3}}},
    )
    result = derive(parse_project(document))
    assert [level.key for level in result.levels] == ["groups", "within.g1", "within._root"]
    assert result.levels[0].items == ("g1", "_root")
    assert result.global_weights == pytest.approx({"c1": 0.25, "c2": 0.25, "c3": 0.25, "c4": 0.25})


def test_levels_without_settings_are_equal():
    document = project(groups=["g1"], group_of={"c1": "g1", "c2": "g1", "c3": "g1"})
    assert weights_of(document) == pytest.approx({"c1": 1 / 6, "c2": 1 / 6, "c3": 1 / 6, "c4": 0.5})


def test_switching_methods_keeps_other_inputs():
    level = {"method": "direct", "weights": {"c1": 1}, "order": [["c4"]], "comparisons": {"c1|c2": 9}}
    document = project(weighting={"within": {"_root": level}})
    assert weights_of(document)["c1"] == 1
    level["method"] = "rank"
    assert parse_project(document).weighting.within["_root"].weights == {"c1": 1}
    w = weights_of(document)
    assert max(w, key=lambda k: w[k]) == "c4"


def test_prepare_uses_global_weights():
    order = [["c4"], ["c3"], ["c2"], ["c1"]]
    prepared = prepare(parse_project(project(weighting={"within": {"_root": {"method": "rank", "order": order}}})))
    assert prepared.weights.sum() == pytest.approx(1)
    assert list(prepared.weights) == sorted(prepared.weights)


# --- Validation -----------------------------------------------------------------------------


def codes(document: dict) -> list[str]:
    with pytest.raises(ProblemValidationError) as caught:
        prepare(parse_project(document))
    return [issue.code for issue in caught.value.issues]


def test_ahp_needs_every_pair():
    document = project(weighting={"within": {"_root": {"method": "ahp", "comparisons": {"c1|c2": 2}}}})
    assert codes(document) == ["ahp_incomplete"] * 5


def test_ahp_values_must_be_in_scale_and_given_once():
    pairs = consistent({"c1": 1, "c2": 1, "c3": 1, "c4": 1}) | {"c1|c2": 12, "c4|c3": 1}
    document = project(weighting={"within": {"_root": {"method": "ahp", "comparisons": pairs}}})
    assert codes(document) == ["ahp_value_invalid", "ahp_value_invalid"]


def test_ahp_at_most_ten_items():
    document = project(weighting={"within": {"_root": {"method": "ahp"}}})
    for k in range(5, 12):
        document["criteria"].append({**document["criteria"][0], "id": f"c{k}", "name": f"C{k}"})
    assert codes(document) == ["ahp_too_many_items"]


def test_rank_duplicates_are_reported():
    document = project(weighting={"within": {"_root": {"method": "rank", "order": [["c1"], ["c1", "c2"]]}}})
    assert codes(document) == ["weighting_duplicate"]


def test_upper_level_may_reference_root_but_not_unknown_groups():
    weighting = {"groups": {"weights": {"_root": 1, "nope": 1}}}
    assert codes(project(groups=["g1"], group_of={"c1": "g1"}, weighting=weighting)) == ["unknown_reference"]


# --- API -----------------------------------------------------------------------------------


def test_weights_endpoint(client):
    comparisons = {"c1|c2": 9, "c2|c3": 9, "c1|c3": 1 / 9}
    document = project(
        groups=["g1"],
        group_of={"c1": "g1", "c2": "g1", "c3": "g1"},
        weighting={"within": {"g1": {"method": "ahp", "comparisons": comparisons}}},
    )
    document["data"] = {}  # weights do not need data
    response = client.post("/api/v1/projects/weights", json=document)
    assert response.status_code == 200
    body = response.json()
    assert [level["key"] for level in body["levels"]] == ["groups", "within.g1", "within._root"]
    ahp = body["levels"][1]["ahp"]
    assert not ahp["consistent"]
    assert ahp["cr"] > 1
    assert body["weights"]["c4"] == pytest.approx(0.5)


def test_weights_endpoint_reports_invalid_inputs(client):
    response = client.post("/api/v1/projects/weights", json=project(weighting={"within": {"_root": {"method": "ahp"}}}))
    assert response.status_code == 422
    assert {issue["code"] for issue in response.json()["issues"]} == {"ahp_incomplete"}
