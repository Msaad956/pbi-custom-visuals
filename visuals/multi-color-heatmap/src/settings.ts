/**
 * settings.ts
 * Formatting settings model for the Multi-Color Heatmap visual.
 * Uses powerbi-visuals-utils-formattingmodel (v6) FormattingSettingsService pattern.
 *
 * Each card corresponds to an object declared in capabilities.json.
 * Property names must exactly match the property keys in capabilities.json objects.
 */

"use strict";

import { formattingSettings } from "powerbi-visuals-utils-formattingmodel";

// ─── Color Gradient Card ─────────────────────────────────────────────────────

/**
 * Five independently configurable color stops that form the heat gradient:
 * Min (cold) → Low → Mid → High → Max (hot)
 */
class ColorGradientCard extends formattingSettings.SimpleCard {
    public colorMin: formattingSettings.ColorPicker = new formattingSettings.ColorPicker({
        name: "colorMin",
        displayName: "Min Color",
        description: "Color for the minimum value",
        value: { value: "#1A53FF" }   // blue
    });

    public colorLow: formattingSettings.ColorPicker = new formattingSettings.ColorPicker({
        name: "colorLow",
        displayName: "Low Color",
        description: "Color for low values",
        value: { value: "#00B050" }   // green
    });

    public colorMid: formattingSettings.ColorPicker = new formattingSettings.ColorPicker({
        name: "colorMid",
        displayName: "Mid Color",
        description: "Color for mid-range values",
        value: { value: "#FFFF00" }   // yellow
    });

    public colorHigh: formattingSettings.ColorPicker = new formattingSettings.ColorPicker({
        name: "colorHigh",
        displayName: "High Color",
        description: "Color for high values",
        value: { value: "#FF8C00" }   // orange
    });

    public colorMax: formattingSettings.ColorPicker = new formattingSettings.ColorPicker({
        name: "colorMax",
        displayName: "Max Color",
        description: "Color for the maximum value",
        value: { value: "#FF0000" }   // red
    });

    public name: string = "colorGradient";
    public displayName: string = "Color Gradient";
    public slices: formattingSettings.Slice[] = [
        this.colorMin, this.colorLow, this.colorMid, this.colorHigh, this.colorMax
    ];
}

// ─── Cells Card ──────────────────────────────────────────────────────────────

/** Controls cell border appearance. */
class CellsCard extends formattingSettings.SimpleCard {
    public showBorder: formattingSettings.ToggleSwitch = new formattingSettings.ToggleSwitch({
        name: "showBorder",
        displayName: "Show Border",
        description: "Show or hide the border around each cell",
        value: true
    });

    public borderColor: formattingSettings.ColorPicker = new formattingSettings.ColorPicker({
        name: "borderColor",
        displayName: "Border Color",
        description: "Color of the cell borders",
        value: { value: "#FFFFFF" }
    });

    public name: string = "cells";
    public displayName: string = "Cells";
    public slices: formattingSettings.Slice[] = [this.showBorder, this.borderColor];
}

// ─── Data Labels Card ─────────────────────────────────────────────────────────

/** Controls the value labels rendered inside each cell. */
class DataLabelsCard extends formattingSettings.SimpleCard {
    public show: formattingSettings.ToggleSwitch = new formattingSettings.ToggleSwitch({
        name: "show",
        displayName: "Show Labels",
        description: "Show the numeric value inside each cell",
        value: false
    });

    public fontFamily: formattingSettings.FontPicker = new formattingSettings.FontPicker({
        name: "fontFamily",
        displayName: "Font Family",
        value: "Segoe UI, sans-serif"
    });

    public fontSize: formattingSettings.NumUpDown = new formattingSettings.NumUpDown({
        name: "fontSize",
        displayName: "Font Size",
        description: "Font size for cell value labels (px)",
        value: 11,
        options: { minValue: { value: 6, type: powerbi.visuals.ValidatorType.Min },
                   maxValue: { value: 40, type: powerbi.visuals.ValidatorType.Max } }
    });

    public fontColor: formattingSettings.ColorPicker = new formattingSettings.ColorPicker({
        name: "fontColor",
        displayName: "Font Color",
        value: { value: "#000000" }
    });

    public name: string = "dataLabels";
    public displayName: string = "Data Labels";
    public slices: formattingSettings.Slice[] = [
        this.show, this.fontFamily, this.fontSize, this.fontColor
    ];
}

// ─── X Axis Card ─────────────────────────────────────────────────────────────

/** Controls the column (X) axis labels. */
class XAxisCard extends formattingSettings.SimpleCard {
    public show: formattingSettings.ToggleSwitch = new formattingSettings.ToggleSwitch({
        name: "show",
        displayName: "Show Labels",
        description: "Show or hide X axis labels",
        value: true
    });

    public fontSize: formattingSettings.NumUpDown = new formattingSettings.NumUpDown({
        name: "fontSize",
        displayName: "Font Size",
        value: 11,
        options: { minValue: { value: 6, type: powerbi.visuals.ValidatorType.Min },
                   maxValue: { value: 40, type: powerbi.visuals.ValidatorType.Max } }
    });

    public fontColor: formattingSettings.ColorPicker = new formattingSettings.ColorPicker({
        name: "fontColor",
        displayName: "Font Color",
        value: { value: "#333333" }
    });

    public labelRotation: formattingSettings.NumUpDown = new formattingSettings.NumUpDown({
        name: "labelRotation",
        displayName: "Label Rotation (°)",
        description: "Rotation angle for X axis labels (0–90 degrees)",
        value: 45,
        options: { minValue: { value: 0, type: powerbi.visuals.ValidatorType.Min },
                   maxValue: { value: 90, type: powerbi.visuals.ValidatorType.Max } }
    });

    public name: string = "xAxis";
    public displayName: string = "X Axis";
    public slices: formattingSettings.Slice[] = [
        this.show, this.fontSize, this.fontColor, this.labelRotation
    ];
}

// ─── Y Axis Card ─────────────────────────────────────────────────────────────

/** Controls the row (Y) axis labels. */
class YAxisCard extends formattingSettings.SimpleCard {
    public show: formattingSettings.ToggleSwitch = new formattingSettings.ToggleSwitch({
        name: "show",
        displayName: "Show Labels",
        description: "Show or hide Y axis labels",
        value: true
    });

    public fontSize: formattingSettings.NumUpDown = new formattingSettings.NumUpDown({
        name: "fontSize",
        displayName: "Font Size",
        value: 11,
        options: { minValue: { value: 6, type: powerbi.visuals.ValidatorType.Min },
                   maxValue: { value: 40, type: powerbi.visuals.ValidatorType.Max } }
    });

    public fontColor: formattingSettings.ColorPicker = new formattingSettings.ColorPicker({
        name: "fontColor",
        displayName: "Font Color",
        value: { value: "#333333" }
    });

    public name: string = "yAxis";
    public displayName: string = "Y Axis";
    public slices: formattingSettings.Slice[] = [
        this.show, this.fontSize, this.fontColor
    ];
}

// ─── Legend Card ──────────────────────────────────────────────────────────────

/** The position items for the legend dropdown. */
const legendPositionItems: powerbi.IEnumMember[] = [
    { value: "Top",    displayName: "Top"    },
    { value: "Bottom", displayName: "Bottom" },
    { value: "Right",  displayName: "Right"  }
];

/** Controls the color-scale gradient legend bar. */
class LegendCard extends formattingSettings.SimpleCard {
    public show: formattingSettings.ToggleSwitch = new formattingSettings.ToggleSwitch({
        name: "show",
        displayName: "Show Legend",
        description: "Show or hide the gradient color-scale legend",
        value: true
    });

    public position: formattingSettings.ItemDropdown = new formattingSettings.ItemDropdown({
        name: "position",
        displayName: "Position",
        description: "Position of the gradient legend",
        items: legendPositionItems,
        value: legendPositionItems[1]   // default: Bottom
    });

    public name: string = "legend";
    public displayName: string = "Legend";
    public slices: formattingSettings.Slice[] = [this.show, this.position];
}

// ─── Root Settings Model ──────────────────────────────────────────────────────

/**
 * The top-level formatting settings model consumed by FormattingSettingsService.
 * All six cards are declared here and listed in `cards` so the Format pane
 * renders them in order.
 */
export class VisualFormattingSettingsModel extends formattingSettings.Model {
    public colorGradient: ColorGradientCard = new ColorGradientCard();
    public cells: CellsCard             = new CellsCard();
    public dataLabels: DataLabelsCard   = new DataLabelsCard();
    public xAxis: XAxisCard             = new XAxisCard();
    public yAxis: YAxisCard             = new YAxisCard();
    public legend: LegendCard           = new LegendCard();

    public cards: formattingSettings.SimpleCard[] = [
        this.colorGradient,
        this.cells,
        this.dataLabels,
        this.xAxis,
        this.yAxis,
        this.legend
    ];
}
