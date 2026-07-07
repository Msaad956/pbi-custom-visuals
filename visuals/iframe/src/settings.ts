/**
 * settings.ts
 * Formatting settings model for the Iframe visual.
 * Uses powerbi-visuals-utils-formattingmodel (v6) FormattingSettingsService pattern.
 *
 * Each card corresponds to an object declared in capabilities.json.
 * Property names must exactly match the property keys in capabilities.json objects.
 */

"use strict";

import { formattingSettings } from "powerbi-visuals-utils-formattingmodel";

// ─── Toolbar Position items ───────────────────────────────────────────────────

const toolbarPositionItems: powerbi.IEnumMember[] = [
    { value: "topRight",    displayName: "Top Right"    },
    { value: "topLeft",     displayName: "Top Left"     },
    { value: "bottomRight", displayName: "Bottom Right" },
    { value: "bottomLeft",  displayName: "Bottom Left"  }
];

// ─── Default text constants ───────────────────────────────────────────────────

export const DEFAULT_HINT_TEXT = "If the dashboard doesn't load, click Sign In, complete login in the new tab, then click Reload.";

// ─── Toolbar Card ─────────────────────────────────────────────────────────────

/**
 * Controls the floating Sign In / Reload toolbar overlay.
 * The toolbar is always rendered (not conditionally hidden) because cross-origin
 * iframe load success cannot be reliably detected from the parent frame.
 */
class ToolbarCard extends formattingSettings.SimpleCard {
    public show: formattingSettings.ToggleSwitch = new formattingSettings.ToggleSwitch({
        name: "show",
        displayName: "Show Toolbar",
        description: "Show or hide the Sign In / Reload toolbar overlay",
        value: true
    });

    public position: formattingSettings.ItemDropdown = new formattingSettings.ItemDropdown({
        name: "position",
        displayName: "Position",
        description: "Corner of the visual where the toolbar appears",
        items: toolbarPositionItems,
        value: toolbarPositionItems[0]   // default: Top Right
    });

    public showHint: formattingSettings.ToggleSwitch = new formattingSettings.ToggleSwitch({
        name: "showHint",
        displayName: "Show Hint Banner",
        description: "Show a dismissible hint banner above the toolbar",
        value: true
    });

    public hintText: formattingSettings.TextInput = new formattingSettings.TextInput({
        name: "hintText",
        displayName: "Hint Text",
        description: "Text shown in the hint banner (leave empty for default)",
        value: DEFAULT_HINT_TEXT,
        placeholder: DEFAULT_HINT_TEXT
    });

    public signInLabel: formattingSettings.TextInput = new formattingSettings.TextInput({
        name: "signInLabel",
        displayName: "Sign In Button Label",
        description: "Label for the Sign In button",
        value: "Sign In ↗",
        placeholder: "Sign In ↗"
    });

    public reloadLabel: formattingSettings.TextInput = new formattingSettings.TextInput({
        name: "reloadLabel",
        displayName: "Reload Button Label",
        description: "Label for the Reload button",
        value: "Reload",
        placeholder: "Reload"
    });

    public name: string = "toolbar";
    public displayName: string = "Toolbar";
    public slices: formattingSettings.Slice[] = [
        this.show,
        this.position,
        this.showHint,
        this.hintText,
        this.signInLabel,
        this.reloadLabel
    ];
}

// ─── Appearance Card ──────────────────────────────────────────────────────────

/** Controls border and background appearance of the visual container. */
class AppearanceCard extends formattingSettings.SimpleCard {
    public showBorder: formattingSettings.ToggleSwitch = new formattingSettings.ToggleSwitch({
        name: "showBorder",
        displayName: "Show Border",
        description: "Show or hide a border around the iframe",
        value: false
    });

    public borderColor: formattingSettings.ColorPicker = new formattingSettings.ColorPicker({
        name: "borderColor",
        displayName: "Border Color",
        description: "Color of the border around the iframe",
        value: { value: "#CCCCCC" }
    });

    public borderWidth: formattingSettings.NumUpDown = new formattingSettings.NumUpDown({
        name: "borderWidth",
        displayName: "Border Width (px)",
        description: "Width of the border in pixels",
        value: 1,
        options: {
            minValue: { value: 1, type: powerbi.visuals.ValidatorType.Min },
            maxValue: { value: 10, type: powerbi.visuals.ValidatorType.Max }
        }
    });

    public backgroundColor: formattingSettings.ColorPicker = new formattingSettings.ColorPicker({
        name: "backgroundColor",
        displayName: "Background Color",
        description: "Background color shown while the iframe is loading or in an error state",
        value: { value: "#F3F3F3" }
    });

    public name: string = "appearance";
    public displayName: string = "Appearance";
    public slices: formattingSettings.Slice[] = [
        this.showBorder,
        this.borderColor,
        this.borderWidth,
        this.backgroundColor
    ];
}

// ─── Behavior Card ────────────────────────────────────────────────────────────

/**
 * Controls load-time behavior.
 *
 * NOTE: autoHideToolbar relies on the iframe's native `onload` event, which fires
 * for cross-origin iframes regardless of whether the embedded content actually
 * rendered successfully or was blocked (e.g. by an auth redirect). Treat it as
 * best-effort only — the toolbar is never fully removed, only visually de-emphasized.
 */
class BehaviorCard extends formattingSettings.SimpleCard {
    public autoHideToolbar: formattingSettings.ToggleSwitch = new formattingSettings.ToggleSwitch({
        name: "autoHideToolbar",
        displayName: "Auto-Hide Toolbar After Load",
        description: "De-emphasize the toolbar after the iframe's load event fires (best-effort; cross-origin load cannot confirm success)",
        value: false
    });

    public loadTimeoutSeconds: formattingSettings.NumUpDown = new formattingSettings.NumUpDown({
        name: "loadTimeoutSeconds",
        displayName: "Load Timeout (seconds)",
        description: "Seconds to wait before surfacing the 'still loading / click Sign In' affordance",
        value: 8,
        options: {
            minValue: { value: 1,  type: powerbi.visuals.ValidatorType.Min },
            maxValue: { value: 120, type: powerbi.visuals.ValidatorType.Max }
        }
    });

    public name: string = "behavior";
    public displayName: string = "Behavior";
    public slices: formattingSettings.Slice[] = [
        this.autoHideToolbar,
        this.loadTimeoutSeconds
    ];
}

// ─── Root Settings Model ──────────────────────────────────────────────────────

/**
 * The top-level formatting settings model consumed by FormattingSettingsService.
 * All three cards are declared here and listed in `cards` so the Format pane
 * renders them in order.
 */
export class VisualFormattingSettingsModel extends formattingSettings.Model {
    public toolbar:    ToolbarCard    = new ToolbarCard();
    public appearance: AppearanceCard = new AppearanceCard();
    public behavior:   BehaviorCard   = new BehaviorCard();

    public cards: formattingSettings.SimpleCard[] = [
        this.toolbar,
        this.appearance,
        this.behavior
    ];
}
