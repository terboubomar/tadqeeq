<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->
- Password sign-ins require a per-session 6-digit email code (email_signin_codes + private.email_code_satisfied, checked in server-auth and the _authenticated gate); why: second step without an authenticator app.

## Project operating rules

Tadqeeq is a production-critical product. It is not an MVP. Preserve existing behavior, compatibility, data integrity, and operational stability in every change.

- Never merge into `main` until the complete CI/CD quality gate has passed. At minimum, run the frozen dependency install, typecheck, lint, full test suite, production build, and dependency audit, then verify the remote CI/CD checks are successful. Never skip, weaken, bypass, or disable a required check.
- Never modify the deterministic accounting engine or anything that can affect its behavior. This includes platform parsers, accounting calculations, reconciliation logic, financial formulas, rates, tolerances, mappings, engine types, audit-result generation, engine fixtures, golden outputs, and engine-related migrations or integrations. If a requested task may touch this boundary, stop and ask the user before making any change.
- Implement only what the user explicitly requests. Do not improvise features, behavior, architecture, copy, workflows, refactors, dependency upgrades, cleanup, formatting sweeps, or adjacent fixes.
- Keep every change narrowly scoped and preserve unrelated code. Do not use a task as permission for opportunistic changes.
- Do not claim that work is ready to merge or deploy without evidence from the required checks.
- Follow the user's stated rules and acceptance criteria exactly. When requirements are ambiguous or conflict with these rules, stop and ask rather than guessing.
