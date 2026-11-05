"""LaTeX resume source -> plain text for matching (PRD F-06 text preparation).

A one-pass scanner, not a parser: malformed input (unbalanced braces, stray
backslashes) degrades to plain text and never raises (AC-06.10).
"""

_ESCAPABLE = frozenset("&%$#_{}")
_SPACE_LIKE = frozenset("{}~")


def prepare_resume_text(tex: str) -> str:
    out: list[str] = []
    i, n = 0, len(tex)
    while i < n:
        ch = tex[i]
        if ch == "%":
            # Escaped percents are consumed by the backslash branch, so any %
            # reached here is unescaped and starts a comment.
            newline = tex.find("\n", i)
            if newline == -1:
                break
            i = newline
            continue
        if ch == "\\":
            if i + 1 >= n:
                break
            nxt = tex[i + 1]
            if nxt in _ESCAPABLE:
                out.append(nxt)
                i += 2
            elif nxt == "\\":
                out.append("\n")
                i += 2
            elif nxt.isascii() and nxt.isalpha():
                j = i + 1
                while j < n and tex[j].isascii() and tex[j].isalpha():
                    j += 1
                if j < n and tex[j] == "*":
                    j += 1
                out.append(" ")
                i = j
            else:
                # Accents and spacing commands (\' \, \ ): drop the command,
                # keep whitespace so words stay separate.
                if nxt.isspace():
                    out.append(nxt)
                i += 2
            continue
        out.append(" " if ch in _SPACE_LIKE else ch)
        i += 1
    return "".join(out)
