# Power BI Custom Visuals Factory

This repository is a self-service factory for requesting, building, and packaging custom Power BI visuals (`.pbiviz`).

## 3-Phase Process

### Phase 1 — Intake & Specification
Requesters open a **Custom Visual Request** issue using the issue form. The request can include a plain-language description, a reference image/mockup/screenshot, or both. A maintainer reviews the request and confirms the build specification (chart type, data roles, format options, interactions) before any code is written.

### Phase 2 — Build (Coding Agent)
After spec approval, the GitHub Copilot coding agent is assigned to the issue. It scaffolds a new visual under `visuals/<visual-name>/` using the Power BI Visuals SDK (`pbiviz`) layout, implements `src/visual.ts`, `capabilities.json`, styles/assets, and opens a pull request.

### Phase 3 — Test, Package & Deploy
The GitHub Actions workflow at `.github/workflows/build-visual.yml` builds each changed visual under `visuals/*` by running `pbiviz package` and uploads generated `.pbiviz` files as downloadable artifacts. Reviewers test via `pbiviz start` + Developer visual (iteration) or Power BI Desktop import (`Visualizations` pane → `...` → `Import a visual from a file`) for final testing. Once approved/merged, the `.pbiviz` can optionally be published to Organizational Visuals via the Power BI Admin Portal.

## Repository Structure

```text
.
├── .github/
│   ├── ISSUE_TEMPLATE/
│   │   ├── config.yml
│   │   └── custom-visual-request.yml
│   └── workflows/
│       └── build-visual.yml
├── visuals/
│   ├── README.md
│   └── <visual-name>/
│       ├── pbiviz.json
│       ├── capabilities.json
│       ├── src/
│       │   └── visual.ts
│       ├── assets/
│       └── style/
└── README.md
```

## Requesting a New Visual

Use the issue template chooser: [Request a custom visual](../../issues/new/choose)

In the **🎨 Custom Visual Request** form, describe the visual in words and/or attach a reference image directly in the form.
