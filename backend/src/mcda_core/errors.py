"""Validation errors that report every problem at once, with locations."""

from __future__ import annotations

from collections.abc import Iterable
from dataclasses import dataclass


@dataclass(frozen=True)
class ValidationIssue:
    """A single problem found in user-supplied data.

    ``location`` is a human-readable pointer such as ``"B4"`` (a cell) or
    ``"criterion 'Capex'"``; it is ``None`` for problems that concern the
    data set as a whole.
    """

    message: str
    location: str | None = None

    def __str__(self) -> str:
        return f"{self.location}: {self.message}" if self.location else self.message


class ProblemValidationError(ValueError):
    """Raised when input data cannot form a valid decision problem."""

    def __init__(self, issues: Iterable[ValidationIssue]):
        self.issues = tuple(issues)
        lines = "\n".join(f"- {issue}" for issue in self.issues)
        super().__init__(f"Invalid decision problem ({len(self.issues)} issue(s)):\n{lines}")
