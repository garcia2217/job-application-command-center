import re

from app.comparison.latex import prepare_resume_text


def _words(text: str) -> set[str]:
    return set(re.findall(r"[A-Za-z0-9]+", text))


def test_textbf_is_stripped_and_word_kept():
    out = prepare_resume_text(r"\textbf{PostgreSQL}")
    assert "PostgreSQL" in _words(out)
    assert "textbf" not in out


def test_comment_is_removed():
    out = prepare_resume_text("% Kubernetes\nPython")
    assert "Kubernetes" not in out
    assert "Python" in out


def test_escaped_percent_is_literal():
    assert prepare_resume_text(r"50\% faster") == "50% faster"


def test_double_backslash_then_comment():
    out = prepare_resume_text("line\\\\% hidden\nshown")
    assert "hidden" not in out
    assert "shown" in out


def test_escaped_specials():
    assert prepare_resume_text(r"C\#") == "C#"
    assert prepare_resume_text(r"R\&D") == "R&D"
    assert prepare_resume_text(r"snake\_case") == "snake_case"


def test_item_command_removed():
    out = prepare_resume_text(r"\item Go")
    assert "Go" in out
    assert "item" not in out


def test_starred_section():
    out = prepare_resume_text(r"\section*{Skills}")
    assert "Skills" in out
    assert "*" not in out


def test_accent_command_removed():
    out = prepare_resume_text(r"Andr\'e")
    assert "Andr" in out
    assert "e" in out
    assert "'" not in out


def test_trailing_backslash():
    out = prepare_resume_text("ends with \\")
    assert out == "ends with "
    assert not out.endswith("\\")


def test_unbalanced_inputs_never_raise():
    assert "Python" in _words(prepare_resume_text(r"\textbf{Python"))
    assert "Python" in _words(prepare_resume_text("Python}}}"))
    assert prepare_resume_text("{{{").strip() == ""
    assert "itemize" in _words(prepare_resume_text(r"\begin{itemize"))


def test_tilde_is_space():
    assert prepare_resume_text("a~b") == "a b"


def test_empty():
    assert prepare_resume_text("") == ""
