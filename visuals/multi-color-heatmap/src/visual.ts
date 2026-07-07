/**
 * visual.ts
 * Multi-Color Heatmap — Power BI Custom Visual
 *
 * Renders a 2D grid where:
 *   • X axis (category role)  → columns
 *   • Y axis (series role)    → rows
 *   • Value (measure role)    → cell fill color via a 5-stop gradient
 *
 * Features:
 *   • Configurable 5-stop color gradient (Min/Low/Mid/High/Max)
 *   • Cell borders, data labels, axis labels, and gradient legend
 *   • Hover tooltips via IVisualHost.tooltipService
 *   • Click cross-filtering via ISelectionManager (ctrl/cmd multi-select)
 *   • Empty-state message when no data is bound
 *   • Responsive re-render on viewport resize
 */

"use strict";

import powerbi from "powerbi-visuals-api";
import { FormattingSettingsService } from "powerbi-visuals-utils-formattingmodel";
import { VisualFormattingSettingsModel } from "./settings";

import VisualConstructorOptions  = powerbi.extensibility.visual.VisualConstructorOptions;
import VisualUpdateOptions       = powerbi.extensibility.visual.VisualUpdateOptions;
import IVisual                   = powerbi.extensibility.visual.IVisual;
import IVisualHost               = powerbi.extensibility.visual.IVisualHost;
import ISelectionId              = powerbi.visuals.ISelectionId;
import ISelectionManager         = powerbi.extensibility.ISelectionManager;
import DataViewCategoryColumn    = powerbi.DataViewCategoryColumn;
import DataViewValueColumns      = powerbi.DataViewValueColumns;

// ─── Color Utilities ──────────────────────────────────────────────────────────

/** Parse a CSS hex color string (#RRGGBB or #RGB) into [r, g, b] components (0–255). */
function hexToRgb(hex: string): [number, number, number] {
    const clean = hex.replace(/^#/, "");
    let full = clean;
    if (clean.length === 3) {
        full = clean[0] + clean[0] + clean[1] + clean[1] + clean[2] + clean[2];
    }
    const num = parseInt(full, 16);
    return [(num >> 16) & 255, (num >> 8) & 255, num & 255];
}

/** Convert [r, g, b] components (0–255) back to a CSS hex string. */
function rgbToHex(r: number, g: number, b: number): string {
    const toHex = (v: number) => ("0" + Math.max(0, Math.min(255, Math.round(v))).toString(16)).slice(-2);
    return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

/** Linearly interpolate between two hex colors by factor t ∈ [0, 1]. */
function lerpColor(hexA: string, hexB: string, t: number): string {
    const [r1, g1, b1] = hexToRgb(hexA);
    const [r2, g2, b2] = hexToRgb(hexB);
    return rgbToHex(r1 + (r2 - r1) * t, g1 + (g2 - g1) * t, b1 + (b2 - b1) * t);
}

/**
 * Map a numeric value within [min, max] to a color by interpolating across
 * an ordered array of `stops` hex colors (must have ≥ 2 elements).
 */
function getGradientColor(value: number, min: number, max: number, stops: string[]): string {
    if (!stops || stops.length < 2) return "#CCCCCC";
    if (min === max) return stops[Math.floor(stops.length / 2)];
    const t = Math.max(0, Math.min(1, (value - min) / (max - min)));
    const segments = stops.length - 1;
    const seg = Math.min(Math.floor(t * segments), segments - 1);
    const segT = t * segments - seg;
    return lerpColor(stops[seg], stops[seg + 1], segT);
}

// ─── SVG Helper ───────────────────────────────────────────────────────────────

const SVG_NS = "http://www.w3.org/2000/svg";

function svgEl<K extends keyof SVGElementTagNameMap>(tag: K): SVGElementTagNameMap[K] {
    return document.createElementNS(SVG_NS, tag) as SVGElementTagNameMap[K];
}

// ─── Data Structures ──────────────────────────────────────────────────────────

interface CellData {
    xi: number;
    yi: number;
    xLabel: string;
    yLabel: string;
    value: number | null;
    formattedValue: string;
    selectionId: ISelectionId;
}

// ─── Visual Class ─────────────────────────────────────────────────────────────

export class Visual implements IVisual {
    private readonly host: IVisualHost;
    private readonly container: HTMLElement;
    private readonly svg: SVGSVGElement;
    private readonly selectionManager: ISelectionManager;
    private readonly formattingSettingsService: FormattingSettingsService;

    private formattingSettings: VisualFormattingSettingsModel;

    /** Active selection keys (from ISelectionId.getKey()). Empty = no selection. */
    private selectedKeys: Set<string> = new Set();

    /** Refs to rendered cell rects for opacity updates without full re-render. */
    private cellElements: Array<{ rect: SVGRectElement; key: string }> = [];

    constructor(options: VisualConstructorOptions) {
        this.host = options.host;
        this.container = options.element;
        this.selectionManager = this.host.createSelectionManager();
        this.formattingSettingsService = new FormattingSettingsService();

        // Initialise with defaults so getFormattingModel() works before first update
        this.formattingSettings = new VisualFormattingSettingsModel();

        // Root SVG — fills the visual's iframe
        this.svg = svgEl("svg");
        this.svg.style.width = "100%";
        this.svg.style.height = "100%";
        this.svg.style.overflow = "hidden";
        this.container.appendChild(this.svg);

        // Clear selection when clicking the SVG background (outside any cell)
        this.svg.addEventListener("click", (e: MouseEvent) => {
            if ((e.target as SVGElement) === this.svg) {
                this.selectionManager.clear().then(() => {
                    this.selectedKeys.clear();
                    this.updateCellOpacity();
                });
            }
        });

        // Respond to cross-filter changes initiated by other visuals
        this.selectionManager.registerOnSelectCallback((ids: ISelectionId[]) => {
            this.selectedKeys.clear();
            ids.forEach(id => this.selectedKeys.add(id.getKey()));
            this.updateCellOpacity();
        });
    }

    // ── IVisual.update ────────────────────────────────────────────────────────

    public update(options: VisualUpdateOptions): void {
        const dataViews = options.dataViews;
        const dataView  = dataViews && dataViews[0];

        // Refresh formatting settings from the current dataView objects
        // populateFormattingSettingsModel expects a single DataView (not the array)
        this.formattingSettings = this.formattingSettingsService.populateFormattingSettingsModel(
            VisualFormattingSettingsModel,
            dataView
        );

        // Wipe the canvas
        this.clearSvg();
        this.cellElements = [];

        const { width, height } = options.viewport;
        this.svg.setAttribute("width",  String(width));
        this.svg.setAttribute("height", String(height));

        // Guard: no data or missing required sections
        const categorical = dataView && dataView.categorical;
        const hasCategories = categorical &&
            categorical.categories && categorical.categories.length > 0 &&
            categorical.categories[0].values.length > 0;
        const hasValues = categorical && categorical.values && categorical.values.length > 0;

        if (!hasCategories || !hasValues) {
            this.renderEmptyState(width, height);
            return;
        }

        this.renderHeatmap(categorical, dataView, width, height);
    }

    // ── IVisual.getFormattingModel ─────────────────────────────────────────────

    public getFormattingModel(): powerbi.visuals.FormattingModel {
        return this.formattingSettingsService.buildFormattingModel(this.formattingSettings);
    }

    // ── Private: Empty State ──────────────────────────────────────────────────

    private renderEmptyState(width: number, height: number): void {
        const text = svgEl("text");
        text.setAttribute("x", String(width  / 2));
        text.setAttribute("y", String(height / 2));
        text.setAttribute("text-anchor", "middle");
        text.setAttribute("dominant-baseline", "middle");
        text.setAttribute("fill", "#888888");
        text.setAttribute("font-size", "14");
        text.setAttribute("font-family", "Segoe UI, sans-serif");
        text.textContent = "Add X Axis, Y Axis, and Value fields to render the heatmap.";
        this.svg.appendChild(text);
    }

    // ── Private: Main Render ──────────────────────────────────────────────────

    private renderHeatmap(
        categorical: powerbi.DataViewCategorical,
        dataView: powerbi.DataView,
        width: number,
        height: number
    ): void {
        const settings = this.formattingSettings;

        // ── 1. Extract data ──────────────────────────────────────────────────

        const xCatCol  = categorical.categories[0];
        const xLabels  = xCatCol.values.map(v => v == null ? "" : String(v));
        const yGroups  = categorical.values.grouped();
        const yLabels  = yGroups.map(g => g.name == null ? "" : String(g.name));

        // Build flat cell list and discover global min/max
        const cells: CellData[] = [];
        let globalMin =  Infinity;
        let globalMax = -Infinity;

        // Retrieve the measure's format string (if available) for tooltip display
        const measureFormatString = yGroups.length > 0 && yGroups[0].values.length > 0
            ? (yGroups[0].values[0].source.format || "")
            : "";

        for (let yi = 0; yi < yGroups.length; yi++) {
            const group      = yGroups[yi];
            const measureCol = group.values[0];   // the single bound measure

            for (let xi = 0; xi < xLabels.length; xi++) {
                const raw   = measureCol ? measureCol.values[xi] : null;
                const value = (raw != null && typeof raw === "number") ? raw : null;

                if (value !== null) {
                    if (value < globalMin) globalMin = value;
                    if (value > globalMax) globalMax = value;
                }

                // Build a SelectionId that encodes both the X category and the Y series group
                const selId = this.host.createSelectionIdBuilder()
                    .withCategory(xCatCol, xi)
                    .withSeries(categorical.values as DataViewValueColumns, measureCol)
                    .createSelectionId();

                const formattedValue = value !== null
                    ? this.formatValue(value, measureFormatString)
                    : "N/A";

                cells.push({ xi, yi, xLabel: xLabels[xi], yLabel: yLabels[yi],
                             value, formattedValue, selectionId: selId });
            }
        }

        // Fallback when all values are null/equal
        if (!isFinite(globalMin)) { globalMin = 0; globalMax = 1; }
        if (globalMin === globalMax) { globalMin -= 0.5; globalMax += 0.5; }

        // ── 2. Compute layout margins ────────────────────────────────────────

        const xAxisSettings = settings.xAxis;
        const yAxisSettings = settings.yAxis;
        const legendSettings = settings.legend;

        const yAxisVisible  = yAxisSettings.show.value;
        const xAxisVisible  = xAxisSettings.show.value;
        const legendVisible = legendSettings.show.value;
        const legendPos     = legendSettings.position.value
            ? String((legendSettings.position.value as { value: string }).value)
            : "Bottom";

        const legendBarThickness = 16;  // px
        const legendPadding      = 28;  // px (bar + text label row)

        const marginLeft   = yAxisVisible ? 90 : 8;
        const marginTop    = 8;
        const marginBottom = xAxisVisible
            ? (xAxisSettings.labelRotation.value > 0 ? 70 : 30)
            : 8;

        const legendTopExtra    = (legendVisible && legendPos === "Top")    ? legendPadding : 0;
        const legendBottomExtra = (legendVisible && legendPos === "Bottom") ? legendPadding : 0;
        const legendRightExtra  = (legendVisible && legendPos === "Right")  ? 90            : 0;

        const gridLeft   = marginLeft;
        const gridTop    = marginTop + legendTopExtra;
        const gridWidth  = Math.max(1, width  - marginLeft - legendRightExtra - 8);
        const gridHeight = Math.max(1, height - marginTop  - marginBottom - legendTopExtra - legendBottomExtra);

        const numX    = xLabels.length;
        const numY    = yLabels.length;
        const cellW   = numX > 0 ? gridWidth  / numX : 0;
        const cellH   = numY > 0 ? gridHeight / numY : 0;

        // ── 3. Build gradient color stops ───────────────────────────────────

        const gradientStops = [
            settings.colorGradient.colorMin.value.value,
            settings.colorGradient.colorLow.value.value,
            settings.colorGradient.colorMid.value.value,
            settings.colorGradient.colorHigh.value.value,
            settings.colorGradient.colorMax.value.value,
        ];

        // ── 4. Draw cells ────────────────────────────────────────────────────

        for (const cell of cells) {
            const cx = gridLeft + cell.xi * cellW;
            const cy = gridTop  + cell.yi * cellH;

            const fillColor = cell.value !== null
                ? getGradientColor(cell.value, globalMin, globalMax, gradientStops)
                : "#DDDDDD";

            const rect = svgEl("rect");
            rect.setAttribute("x",      String(cx));
            rect.setAttribute("y",      String(cy));
            rect.setAttribute("width",  String(Math.max(0, cellW)));
            rect.setAttribute("height", String(Math.max(0, cellH)));
            rect.setAttribute("fill",   fillColor);

            if (settings.cells.showBorder.value) {
                rect.setAttribute("stroke",       settings.cells.borderColor.value.value);
                rect.setAttribute("stroke-width", "1");
            }

            // Initial opacity reflects current selection state
            const key = cell.selectionId.getKey();
            const opacity = this.selectedKeys.size === 0 || this.selectedKeys.has(key) ? "1" : "0.3";
            rect.setAttribute("opacity", opacity);
            rect.style.cursor = "pointer";

            // Attach interaction handlers
            this.attachCellHandlers(rect, cell, key);

            this.svg.appendChild(rect);
            this.cellElements.push({ rect, key });

            // ── Data label ───────────────────────────────────────────────────
            if (settings.dataLabels.show.value && cell.value !== null &&
                cellW > 10 && cellH > 10) {
                const lbl = svgEl("text");
                lbl.setAttribute("x",                  String(cx + cellW / 2));
                lbl.setAttribute("y",                  String(cy + cellH / 2));
                lbl.setAttribute("text-anchor",        "middle");
                lbl.setAttribute("dominant-baseline",  "middle");
                lbl.setAttribute("font-size",          String(settings.dataLabels.fontSize.value));
                lbl.setAttribute("font-family",        settings.dataLabels.fontFamily.value);
                lbl.setAttribute("fill",               settings.dataLabels.fontColor.value.value);
                lbl.setAttribute("pointer-events",     "none");
                lbl.textContent = cell.formattedValue;
                this.svg.appendChild(lbl);
            }
        }

        // ── 5. Y Axis labels ─────────────────────────────────────────────────

        if (yAxisVisible) {
            for (let yi = 0; yi < yLabels.length; yi++) {
                const cy = gridTop + yi * cellH + cellH / 2;
                const lbl = svgEl("text");
                lbl.setAttribute("x",                 String(gridLeft - 6));
                lbl.setAttribute("y",                 String(cy));
                lbl.setAttribute("text-anchor",       "end");
                lbl.setAttribute("dominant-baseline", "middle");
                lbl.setAttribute("font-size",         String(yAxisSettings.fontSize.value));
                lbl.setAttribute("fill",              yAxisSettings.fontColor.value.value);
                lbl.setAttribute("font-family",       "Segoe UI, sans-serif");
                lbl.textContent = this.truncate(yLabels[yi], 14);
                this.svg.appendChild(lbl);
            }
        }

        // ── 6. X Axis labels ─────────────────────────────────────────────────

        if (xAxisVisible) {
            const rotation = xAxisSettings.labelRotation.value;
            for (let xi = 0; xi < xLabels.length; xi++) {
                const cx = gridLeft + xi * cellW + cellW / 2;
                const cy = gridTop + gridHeight + 4;
                const lbl = svgEl("text");
                lbl.setAttribute("x",           String(cx));
                lbl.setAttribute("y",           String(cy));
                lbl.setAttribute("font-size",   String(xAxisSettings.fontSize.value));
                lbl.setAttribute("fill",        xAxisSettings.fontColor.value.value);
                lbl.setAttribute("font-family", "Segoe UI, sans-serif");

                if (rotation === 0) {
                    lbl.setAttribute("text-anchor",       "middle");
                    lbl.setAttribute("dominant-baseline", "hanging");
                } else {
                    lbl.setAttribute("text-anchor",   "end");
                    lbl.setAttribute("transform",
                        `rotate(-${rotation}, ${cx}, ${cy})`);
                    lbl.setAttribute("dominant-baseline", "middle");
                }

                lbl.textContent = this.truncate(xLabels[xi], 12);
                this.svg.appendChild(lbl);
            }
        }

        // ── 7. Gradient Legend ────────────────────────────────────────────────

        if (legendVisible) {
            this.renderLegend(
                legendPos, gradientStops, globalMin, globalMax,
                gridLeft, gridTop, gridWidth, gridHeight,
                width, height, marginBottom, legendBarThickness, legendPadding
            );
        }
    }

    // ── Private: Legend ───────────────────────────────────────────────────────

    private renderLegend(
        position: string,
        stops: string[],
        min: number,
        max: number,
        gridLeft: number,
        gridTop: number,
        gridWidth: number,
        gridHeight: number,
        totalWidth: number,
        totalHeight: number,
        marginBottom: number,
        barThickness: number,
        legendPadding: number
    ): void {
        const numSteps = 100;   // gradient resolution
        const stepW = gridWidth / numSteps;

        let barX: number, barY: number, barW: number, barH: number;
        let isHorizontal = true;

        switch (position) {
            case "Top":
                barX = gridLeft;
                barY = 6;
                barW = gridWidth;
                barH = barThickness;
                isHorizontal = true;
                break;
            case "Right":
                barX = gridLeft + gridWidth + 8;
                barY = gridTop;
                barW = barThickness;
                barH = gridHeight;
                isHorizontal = false;
                break;
            default: // Bottom
                barX = gridLeft;
                barY = gridTop + gridHeight + marginBottom + 4;
                barW = gridWidth;
                barH = barThickness;
                isHorizontal = true;
        }

        // Render the gradient bar as a series of thin colored rects
        for (let i = 0; i < numSteps; i++) {
            const t     = i / (numSteps - 1);
            const color = getGradientColor(min + t * (max - min), min, max, stops);
            const seg   = svgEl("rect");

            if (isHorizontal) {
                seg.setAttribute("x",      String(barX + i * (barW / numSteps)));
                seg.setAttribute("y",      String(barY));
                seg.setAttribute("width",  String(Math.ceil(barW / numSteps) + 1));
                seg.setAttribute("height", String(barH));
            } else {
                // Vertical: top = max, bottom = min
                const yOff = (1 - t) * barH;
                seg.setAttribute("x",      String(barX));
                seg.setAttribute("y",      String(barY + yOff));
                seg.setAttribute("width",  String(barW));
                seg.setAttribute("height", String(Math.ceil(barH / numSteps) + 1));
            }

            seg.setAttribute("fill", color);
            seg.setAttribute("pointer-events", "none");
            this.svg.appendChild(seg);
        }

        // Labels: min and max
        const labelStyle = (t: SVGTextElement) => {
            t.setAttribute("font-size",   "10");
            t.setAttribute("fill",        "#555555");
            t.setAttribute("font-family", "Segoe UI, sans-serif");
            t.setAttribute("pointer-events", "none");
        };

        const minLabel = svgEl("text");
        const maxLabel = svgEl("text");
        labelStyle(minLabel);
        labelStyle(maxLabel);
        minLabel.textContent = this.formatValue(min, "");
        maxLabel.textContent = this.formatValue(max, "");

        if (isHorizontal) {
            minLabel.setAttribute("x", String(barX));
            minLabel.setAttribute("y", String(barY + barThickness + 12));
            minLabel.setAttribute("text-anchor", "start");
            maxLabel.setAttribute("x", String(barX + barW));
            maxLabel.setAttribute("y", String(barY + barThickness + 12));
            maxLabel.setAttribute("text-anchor", "end");
        } else {
            minLabel.setAttribute("x", String(barX + barThickness + 4));
            minLabel.setAttribute("y", String(barY + barH));
            minLabel.setAttribute("dominant-baseline", "auto");
            maxLabel.setAttribute("x", String(barX + barThickness + 4));
            maxLabel.setAttribute("y", String(barY));
            maxLabel.setAttribute("dominant-baseline", "hanging");
        }

        this.svg.appendChild(minLabel);
        this.svg.appendChild(maxLabel);
    }

    // ── Private: Cell Interaction ──────────────────────────────────────────────

    private attachCellHandlers(rect: SVGRectElement, cell: CellData, key: string): void {
        // Click: select/deselect (ctrl/cmd = multi-select)
        rect.addEventListener("click", (e: MouseEvent) => {
            e.stopPropagation();
            const multi = e.ctrlKey || e.metaKey;
            this.selectionManager.select(cell.selectionId, multi).then(() => {
                const ids = this.selectionManager.getSelectionIds() as ISelectionId[];
                this.selectedKeys.clear();
                ids.forEach(id => this.selectedKeys.add(id.getKey()));
                this.updateCellOpacity();
            });
        });

        // Mouseover: show tooltip
        rect.addEventListener("mouseover", (e: MouseEvent) => {
            this.host.tooltipService.show({
                coordinates: [e.clientX, e.clientY],
                isTouchEvent: false,
                dataItems: [
                    { displayName: "X",     value: cell.xLabel         },
                    { displayName: "Y",     value: cell.yLabel         },
                    { displayName: "Value", value: cell.formattedValue }
                ],
                identities: [cell.selectionId]
            });
        });

        // Mousemove: update tooltip position
        rect.addEventListener("mousemove", (e: MouseEvent) => {
            this.host.tooltipService.move({
                coordinates: [e.clientX, e.clientY],
                isTouchEvent: false,
                dataItems: [
                    { displayName: "X",     value: cell.xLabel         },
                    { displayName: "Y",     value: cell.yLabel         },
                    { displayName: "Value", value: cell.formattedValue }
                ],
                identities: [cell.selectionId]
            });
        });

        // Mouseout: hide tooltip
        rect.addEventListener("mouseout", () => {
            this.host.tooltipService.hide({ immediately: false, isTouchEvent: false });
        });
    }

    // ── Private: Opacity Update ────────────────────────────────────────────────

    /** Update every cell rect's opacity to reflect the current selection state. */
    private updateCellOpacity(): void {
        const hasSelection = this.selectedKeys.size > 0;
        for (const { rect, key } of this.cellElements) {
            rect.setAttribute("opacity",
                (!hasSelection || this.selectedKeys.has(key)) ? "1" : "0.3");
        }
    }

    // ── Private: Utilities ─────────────────────────────────────────────────────

    /** Remove all child nodes from the root SVG. */
    private clearSvg(): void {
        while (this.svg.firstChild) {
            this.svg.removeChild(this.svg.firstChild);
        }
    }

    /** Truncate a string to maxLen characters, appending "…" if needed. */
    private truncate(s: string, maxLen: number): string {
        return s.length > maxLen ? s.slice(0, maxLen - 1) + "…" : s;
    }

    /**
     * Format a numeric value for display.
     * Uses the measure's format string when available (e.g. currency/percentage),
     * otherwise falls back to a locale-friendly number string.
     */
    private formatValue(value: number, formatString: string): string {
        if (!formatString) {
            // Generic: up to 4 significant figures
            return Number.isInteger(value)
                ? value.toLocaleString()
                : value.toPrecision(4).replace(/\.?0+$/, "");
        }
        // Simple format string support: handle #,0 and basic numeric patterns
        try {
            return value.toLocaleString(undefined, { maximumFractionDigits: 4 });
        } catch {
            return String(value);
        }
    }
}
