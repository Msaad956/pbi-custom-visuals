# Visuals Directory

Each custom Power BI visual lives in its own subfolder in this directory and follows the standard Power BI Visuals SDK (`pbiviz`) layout:

- `src/visual.ts`
- `capabilities.json`
- `pbiviz.json`
- `assets/`
- `style/`
- `tsconfig.json`
- `package.json`

## Naming convention

Use a short kebab-case folder name matching the request, for example:

- `visuals/radial-kpi-gauge/`

## How visuals get added

New visuals are scaffolded and implemented by the Copilot coding agent from an approved request in the [Custom Visual Request issue form](../.github/ISSUE_TEMPLATE/custom-visual-request.yml).

Manual edits are fine for follow-up revisions to existing visuals.

> Scaffolding-only note: no actual visual project folders are added in this phase.
