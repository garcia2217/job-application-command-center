"""Vocabulary matching (PRD F-06). Pure functions; no I/O."""

import re
from dataclasses import dataclass

from app.comparison.latex import prepare_resume_text
from app.comparison.vocabulary import TERMS, Term

# Characters that glue onto a term: letters/digits plus + # & so that C does not
# match inside C++, C#, or R&D. "." and "-" are not glue ("Python.", "Go-based").
_GLUE = "A-Za-z0-9_+#&"


def _form_pattern(form: str, *, ignore_case: bool, single_char: bool) -> str:
    glue = _GLUE + ("\\-" if single_char else "")
    body = re.escape(form).replace("\\ ", r"\s+")
    if ignore_case:
        body = f"(?i:{body})"
    return f"(?<![{glue}]){body}(?![{glue}])"


def _compile(term: Term) -> re.Pattern[str]:
    single = term.case_sensitive and len(term.name) == 1
    forms: list[tuple[str, bool]] = [
        (f, not term.case_sensitive) for f in (term.name, *term.aliases)
    ]
    forms += [(f, True) for f in term.insensitive_aliases]
    forms.sort(key=lambda item: len(item[0]), reverse=True)
    return re.compile(
        "|".join(
            _form_pattern(f, ignore_case=ic, single_char=single) for f, ic in forms
        )
    )


_PATTERNS: tuple[tuple[str, re.Pattern[str]], ...] = tuple(
    (term.name, _compile(term)) for term in TERMS
)


def find_terms(text: str) -> set[str]:
    return {name for name, pattern in _PATTERNS if pattern.search(text)}


def match_percentage(matched: int, total: int) -> int | None:
    """Nearest whole number, halves rounded up; None when nothing to divide by."""
    if total == 0:
        return None
    return (matched * 200 + total) // (total * 2)


def _ordered(names: set[str]) -> list[str]:
    return sorted(names, key=lambda name: (name.casefold(), name))


@dataclass(frozen=True)
class ComparisonResult:
    matched: list[str]
    missing: list[str]
    match_percentage: int | None

    @property
    def requirement_count(self) -> int:
        return len(self.matched) + len(self.missing)


def compare(resume_tex: str, job_description: str) -> ComparisonResult:
    requirements = find_terms(job_description)
    in_resume = find_terms(prepare_resume_text(resume_tex))
    matched = requirements & in_resume
    return ComparisonResult(
        matched=_ordered(matched),
        missing=_ordered(requirements - matched),
        match_percentage=match_percentage(len(matched), len(requirements)),
    )
