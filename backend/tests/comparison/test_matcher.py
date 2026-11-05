from app.comparison import compare, find_terms
from app.comparison.matcher import match_percentage


def test_ac_06_1_basic_compare():
    r = compare(r"\textbf{PostgreSQL}", "Experience with Postgres and Kubernetes")
    assert r.matched == ["PostgreSQL"]
    assert r.missing == ["Kubernetes"]
    assert r.match_percentage == 50


def test_ac_06_2_deduplicated():
    r = compare("", "PostgreSQL, PostgreSQL and PostgreSQL")
    assert r.requirement_count == 1
    assert r.matched + r.missing == ["PostgreSQL"]


def test_ac_06_3_commented_out_term_is_missing():
    r = compare("% Kubernetes\n", "Kubernetes")
    assert r.missing == ["Kubernetes"]
    assert r.matched == []


def test_ac_06_4_go_is_case_sensitive():
    assert "Go" not in find_terms("go to market")
    assert "Go" in find_terms("Golang")
    assert "Go" in find_terms("golang")
    assert "Go" in find_terms("Go")


def test_ac_06_5_no_requirements():
    r = compare("Python", "We value kindness and curiosity")
    assert r.requirement_count == 0
    assert r.match_percentage is None


def test_c_family_traps():
    found = find_terms("C++ and C#")
    assert {"C++", "C#"} <= found
    assert "C" not in found
    assert "R" not in find_terms("R&D budget")
    assert "C" not in find_terms("C-level stakeholders")
    assert "R" in find_terms("Experience with R.")


def test_java_not_in_javascript():
    found = find_terms("JavaScript")
    assert "JavaScript" in found
    assert "Java" not in found


def test_dotnet_traps():
    found = find_terms("ASP.NET")
    assert "ASP.NET" in found
    assert ".NET" not in found
    assert "Node.js" in find_terms("Node.js.")


def test_express_and_rest_case_sensitivity():
    assert "Express" not in find_terms("express interest")
    assert "Express" in find_terms("Express.js")
    assert "REST" not in find_terms("the rest of the team")


def test_react_native_literal_rule():
    found = find_terms("React Native")
    assert {"React Native", "React"} <= found


def test_whitespace_runs():
    assert "CI/CD" in find_terms("continuous\n   integration")


def test_job_description_is_not_latex_prepared():
    assert "Python" in find_terms("100% remote, Python")


def test_capitalised_sentence_start_is_a_known_false_positive():
    # Documented limitation, PRD R-04: "Go to market." cannot be told from the language.
    assert "Go" in find_terms("Go to market.")


def test_make_sure_is_a_known_false_positive():
    # Documented limitation, PRD R-04: sentence-initial "Make" reads as the tool.
    assert "Make" in find_terms("Make sure tests pass.")
    assert "Make" not in find_terms("please make sure tests pass")


def test_match_percentage_rounding():
    assert match_percentage(1, 8) == 13
    assert match_percentage(2, 3) == 67
    assert match_percentage(1, 3) == 33
    assert match_percentage(0, 4) == 0
    assert match_percentage(0, 0) is None


def test_ordering_is_case_insensitive():
    r = compare("", "gRPC, Docker, AWS")
    assert r.missing == ["AWS", "Docker", "gRPC"]


def test_ac_06_10_malformed_latex():
    r = compare(r"\textbf{Python", "Python")
    assert r.matched == ["Python"]


def test_pandas_lowercase_is_found():
    assert "Pandas" in find_terms("pandas and numpy")


def test_flask_is_case_insensitive():
    assert "Flask" in find_terms("flask")


def test_helm_is_case_sensitive():
    assert "Helm" not in find_terms("at the helm of the team")
    assert "Helm" in find_terms("Helm charts")


def test_bootstrap_is_case_sensitive():
    assert "Bootstrap" not in find_terms("bootstrap a new team")
