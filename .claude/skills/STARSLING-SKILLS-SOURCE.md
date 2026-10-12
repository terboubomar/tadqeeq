# StarSling CI skills

`ci-secure` and `ci-score` come from https://github.com/starslingdev/skills (commit 16b5b6c, MIT licence, Copyright (c)
2026 StarSling; `LICENSE` in each folder). Copied unchanged without their `tests/` folders.

- `ci-secure`: scans `.github/workflows` for ten critical CI attack paths and offers fixes.
- `ci-score`: grades the workflows against eleven CI best-practice checks.

Both read the local checkout only, need python3 3.9+ and PyYAML, and never commit or push on their own.
