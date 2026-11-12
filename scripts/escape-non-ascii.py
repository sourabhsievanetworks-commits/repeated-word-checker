"""Rewrites non-ASCII characters in code lines as \\uXXXX escapes so invisible
characters (soft hyphen, zero-width joiner) are visible in the source.
Comment lines are left alone.  Usage: python3 scripts/escape-non-ascii.py FILE..."""
import sys

for path in sys.argv[1:]:
    out = []
    for line in open(path, encoding="utf-8").read().split("\n"):
        if line.lstrip().startswith(("*", "//", "/**")):
            out.append(line)
        else:
            out.append("".join(c if ord(c) < 128 else "\\u%04X" % ord(c) for c in line))
    open(path, "w", encoding="utf-8").write("\n".join(out))
