from collections import defaultdict

from app.comparison.vocabulary import TERMS

BY_NAME = {t.name: t for t in TERMS}


def test_at_least_150_terms():
    assert len(TERMS) >= 150


def test_names_unique():
    assert len(BY_NAME) == len(TERMS)


def test_no_form_shared_between_terms():
    owners: dict[str, set[str]] = defaultdict(set)
    for t in TERMS:
        for form in (t.name, *t.aliases, *t.insensitive_aliases):
            owners[form.casefold()].add(t.name)
    shared = {f: o for f, o in owners.items() if len(o) > 1}
    assert not shared


def test_required_terms():
    pg = BY_NAME["PostgreSQL"]
    assert {"Postgres", "psql"} <= set(pg.aliases)
    go = BY_NAME["Go"]
    assert go.case_sensitive and "Golang" in go.insensitive_aliases
    assert BY_NAME["R"].case_sensitive
    assert BY_NAME["C"].case_sensitive
    for name in ("Kubernetes", "CI/CD", "TDD"):
        assert name in BY_NAME


def test_case_sensitive_set():
    for name in (
        "Go", "R", "C", "Express", "Spring", "Swift", "Rust", "Dart", "Chef",
        "Puppet", "Make", "Jest", "REST",
    ):  # fmt: skip
        assert BY_NAME[name].case_sensitive, name


def test_forms_non_empty_and_stripped():
    for t in TERMS:
        for form in (t.name, *t.aliases, *t.insensitive_aliases):
            assert form
            assert form == form.strip()
