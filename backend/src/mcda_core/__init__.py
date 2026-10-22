"""Calculation core for the MCDA decision-support tool."""

from .errors import ProblemValidationError, ValidationIssue
from .methods import MethodResult, compromise_programming, topsis, weighted_sum
from .model import Criterion, DecisionProblem, Direction
from .normalization import Normalization, normalize
from .pareto import DominanceInfo, pareto_analysis, pareto_front
from .ranking import rank_scores
from .sensitivity import StabilityScope, WeightInterval, weight_stability_intervals

__all__ = [
    "Criterion",
    "DecisionProblem",
    "Direction",
    "DominanceInfo",
    "MethodResult",
    "Normalization",
    "ProblemValidationError",
    "StabilityScope",
    "ValidationIssue",
    "WeightInterval",
    "compromise_programming",
    "normalize",
    "pareto_analysis",
    "pareto_front",
    "rank_scores",
    "topsis",
    "weight_stability_intervals",
    "weighted_sum",
]
