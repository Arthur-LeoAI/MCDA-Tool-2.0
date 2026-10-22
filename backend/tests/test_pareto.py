from mcda_core import pareto_analysis, pareto_front


def test_dominance_respects_cost_direction(cars):
    # A (100, 30), B (150, 50), C (120, 30); price is a cost
    info = {i.alternative: i for i in pareto_analysis(cars)}
    assert info["C"].dominates == ("A",)
    assert info["A"].dominated_by == ("C",)
    assert info["B"].dominates == () and info["B"].dominated_by == ()
    assert pareto_front(cars) == ("B", "C")


def test_subset_of_criteria(cars):
    assert pareto_front(cars, criteria=["power"]) == ("B",)
    assert pareto_front(cars, criteria=["price"]) == ("A", "C")


def test_identical_alternatives_do_not_dominate_each_other(cars):
    twins = cars.__class__(("X", "Y"), cars.criteria, [[1.0, 1.0], [1.0, 1.0]])
    assert pareto_front(twins) == ("X", "Y")
