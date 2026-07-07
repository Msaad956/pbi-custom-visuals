/**
 * visual.ts
 * Iframe — Power BI Custom Visual
 *
 * Displays an embedded iframe sourced from a DAX measure that returns either:
 *   • A full <iframe ...></iframe> HTML tag (src attribute is extracted via regex)
 *   • A direct HTTPS URL string
 *
 * Features:
 *   • Safe URL extraction — the raw measure string is never injected via innerHTML;
 *     only the extracted URL substring is set as an iframe src attribute.
 *   • Client-side hostname allow-list (matches capabilities.json WebAccess urls):
 *       app.powerbi.com  |  *.powerbi.com
 *     Additional domains can be appended to ALLOWED_HOSTNAMES below and to the
 *     WebAccess urls array in capabilities.json as needed (Power BI requires
 *     WebAccess domains to be explicitly pre-declared at build time).
 *   • Floating toolbar overlay with Sign In (opens URL in new tab) and Reload
 *     (forces iframe refresh) buttons — persistently available since cross-origin
 *     iframe load success cannot be reliably detected.
 *   • Dismissible hint banner with configurable text.
 *   • Format pane: Toolbar, Appearance, Behavior cards.
 *   • Responsive resize on update().
 *
 * IMPORTANT TENANT SETTING: A Power BI tenant admin must enable
 *   Admin Portal → Tenant settings → "Allow visuals to use iframes and embed
 *   content from external sites" for this visual to load any content at all.
 *   This is an out-of-band setting unrelated to this code.
 *
 * The first time a report uses this visual, Power BI will show a one-time
 * security consent prompt (due to the WebAccess privilege) that the report
 * author must accept.
 */

"use strict";

import powerbi from "powerbi-visuals-api";
import { FormattingSettingsService } from "powerbi-visuals-utils-formattingmodel";
import { VisualFormattingSettingsModel } from "./settings";

import VisualConstructorOptions = powerbi.extensibility.visual.VisualConstructorOptions;
import VisualUpdateOptions      = powerbi.extensibility.visual.VisualUpdateOptions;
import IVisual                  = powerbi.extensibility.visual.IVisual;

// ─── Allow-list ───────────────────────────────────────────────────────────────

/**
 * Client-side hostname allow-list, mirroring the WebAccess urls in capabilities.json.
 * A URL is permitted when its hostname exactly matches an entry OR matches the
 * wildcard pattern (hostname ends with ".powerbi.com" or equals "powerbi.com").
 *
 * To support additional domains (e.g. an internal company portal), append both here
 * and to the `privileges[].parameters.urls` array in capabilities.json, then rebuild.
 */
const ALLOWED_HOSTNAMES: string[] = [
    "app.powerbi.com",
    "powerbi.com"
];

/**
 * Returns true when the hostname is app.powerbi.com, powerbi.com, or any
 * subdomain of powerbi.com (e.g. embed.powerbi.com, analysis.windows.net subdomains
 * forwarded through powerbi.com are NOT in scope — only *.powerbi.com patterns).
 */
function isHostnameAllowed(hostname: string): boolean {
    const h = hostname.toLowerCase();
    for (const allowed of ALLOWED_HOSTNAMES) {
        if (h === allowed) return true;
        // Wildcard: *.powerbi.com — allow any subdomain
        if (allowed.startsWith("*.") && (h === allowed.slice(2) || h.endsWith("." + allowed.slice(2)))) {
            return true;
        }
    }
    // Direct check for *.powerbi.com pattern
    return h === "powerbi.com" || h.endsWith(".powerbi.com");
}

// ─── URL Extraction ───────────────────────────────────────────────────────────

/**
 * Safely extract an embed URL from the raw measure value.
 * Returns the URL string on success, or an error message string prefixed with
 * "ERROR:" on failure — never throws.
 *
 * Extraction order:
 *  1. Parse src="..." or src='...' from an <iframe> tag using a regex (no innerHTML).
 *  2. If no iframe tag found but the value starts with https://, use it directly.
 *  3. Otherwise return an error string describing what was expected.
 */
function extractUrl(raw: string): string {
    if (!raw || !raw.trim()) {
        return "ERROR:empty";
    }

    // Try to find an <iframe ...> tag and extract its src attribute.
    // This regex handles both double- and single-quoted src values.
    const iframeMatch = raw.match(/<iframe[^>]+>/i);
    if (iframeMatch) {
        const tag = iframeMatch[0];
        // Match src="..." or src='...'
        const srcMatch = tag.match(/\bsrc\s*=\s*(?:"([^"]+)"|'([^']+)')/i);
        if (srcMatch) {
            return srcMatch[1] || srcMatch[2] || "ERROR:nosrc";
        }
        return "ERROR:nosrc";
    }

    // No iframe tag — accept a raw URL that starts with https:// or http://.
    // (http:// will pass through extractUrl but be rejected by validateUrl with a clear message.)
    const trimmed = raw.trim();
    if (/^https?:\/\//i.test(trimmed)) {
        return trimmed;
    }

    return "ERROR:unrecognized";
}

/**
 * Validate an extracted URL:
 *  - Must start with https://
 *  - Hostname must be in the allow-list
 * Returns null on success, or an error message string on failure.
 */
function validateUrl(url: string): string | null {
    if (!url.startsWith("https://")) {
        return "Only HTTPS URLs are permitted. Provide an https:// address.";
    }
    let hostname: string;
    try {
        hostname = new URL(url).hostname;
    } catch (e) {
        return "The extracted URL is not valid. Check the measure value.";
    }
    if (!isHostnameAllowed(hostname)) {
        return `This domain (${hostname}) is not permitted for this visual. Only app.powerbi.com and *.powerbi.com domains are allowed. To add additional domains, update capabilities.json and rebuild.`;
    }
    return null;
}

// ─── DOM Helpers ──────────────────────────────────────────────────────────────

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string): HTMLElementTagNameMap[K] {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    return e;
}

// ─── Visual Class ─────────────────────────────────────────────────────────────

export class Visual implements IVisual {
    private readonly container: HTMLElement;
    private readonly formattingSettingsService: FormattingSettingsService;
    private formattingSettings: VisualFormattingSettingsModel;

    // DOM structure
    private wrapper: HTMLDivElement;
    private iframe: HTMLIFrameElement;
    private toolbar: HTMLDivElement;
    private hintBanner: HTMLDivElement;
    private signInBtn: HTMLButtonElement;
    private reloadBtn: HTMLButtonElement;
    private messageEl: HTMLDivElement;
    private loadingIndicator: HTMLDivElement;

    // State
    private currentUrl: string = "";
    private hintDismissed: boolean = false;
    private loadTimeoutHandle: number | null = null;
    private loadedFired: boolean = false;

    constructor(options: VisualConstructorOptions) {
        this.container = options.element;
        this.formattingSettingsService = new FormattingSettingsService();
        this.formattingSettings = new VisualFormattingSettingsModel();
        this.buildDom();
    }

    // ── DOM Construction ──────────────────────────────────────────────────────

    private buildDom(): void {
        this.container.style.position = "relative";
        this.container.style.overflow = "hidden";
        this.container.style.fontFamily = "Segoe UI, sans-serif";

        // Outer wrapper fills the container
        this.wrapper = el("div", "iframe-wrapper");
        this.wrapper.style.cssText = "width:100%;height:100%;position:relative;";
        this.container.appendChild(this.wrapper);

        // The embedded iframe
        this.iframe = el("iframe", "iframe-embed");
        this.iframe.setAttribute("frameborder", "0");
        this.iframe.setAttribute("allowfullscreen", "true");
        // Omit sandbox to allow Power BI's own auth/JS to function fully.
        // If sandbox is ever needed, include at minimum:
        //   allow-scripts allow-same-origin allow-forms allow-popups allow-popups-to-escape-sandbox
        this.iframe.style.cssText = "width:100%;height:100%;border:none;display:block;";
        this.wrapper.appendChild(this.iframe);

        // Inline message element (empty state / error state)
        this.messageEl = el("div", "iframe-message");
        this.messageEl.style.cssText = [
            "position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);",
            "max-width:80%;text-align:center;color:#444;font-size:14px;line-height:1.5;",
            "background:rgba(255,255,255,0.9);padding:16px 20px;border-radius:6px;",
            "box-shadow:0 2px 8px rgba(0,0,0,0.12);display:none;"
        ].join("");
        this.wrapper.appendChild(this.messageEl);

        // Still-loading indicator
        this.loadingIndicator = el("div", "iframe-loading");
        this.loadingIndicator.style.cssText = [
            "position:absolute;bottom:8px;left:50%;transform:translateX(-50%);",
            "background:rgba(0,0,0,0.65);color:#fff;font-size:12px;padding:6px 12px;",
            "border-radius:4px;display:none;pointer-events:none;"
        ].join("");
        this.loadingIndicator.textContent = "Still loading… Click Sign In if this doesn't load.";
        this.wrapper.appendChild(this.loadingIndicator);

        // Floating toolbar overlay
        this.toolbar = el("div", "iframe-toolbar");
        this.toolbar.style.cssText = [
            "position:absolute;z-index:100;display:flex;flex-direction:column;align-items:flex-end;gap:4px;",
            "padding:6px;"
        ].join("");
        this.wrapper.appendChild(this.toolbar);

        // Hint banner (dismissible)
        this.hintBanner = el("div", "iframe-hint");
        this.hintBanner.style.cssText = [
            "background:rgba(0,90,158,0.9);color:#fff;font-size:12px;padding:6px 10px;",
            "border-radius:4px;max-width:260px;line-height:1.4;position:relative;"
        ].join("");

        const dismissBtn = el("button");
        dismissBtn.textContent = "×";
        dismissBtn.setAttribute("aria-label", "Dismiss hint");
        dismissBtn.style.cssText = [
            "position:absolute;top:2px;right:4px;background:none;border:none;",
            "color:#fff;cursor:pointer;font-size:14px;line-height:1;padding:0;"
        ].join("");
        dismissBtn.addEventListener("click", () => {
            this.hintDismissed = true;
            this.hintBanner.style.display = "none";
        });
        this.hintBanner.appendChild(dismissBtn);

        const hintTextNode = document.createTextNode("");
        this.hintBanner.appendChild(hintTextNode);
        this.toolbar.appendChild(this.hintBanner);

        // Button row
        const btnRow = el("div");
        btnRow.style.cssText = "display:flex;gap:4px;";

        this.signInBtn = el("button", "iframe-btn iframe-signin");
        this.signInBtn.style.cssText = this.buttonStyle("#0078D4");
        this.signInBtn.addEventListener("click", () => this.onSignIn());

        this.reloadBtn = el("button", "iframe-btn iframe-reload");
        this.reloadBtn.style.cssText = this.buttonStyle("#107C10");
        this.reloadBtn.addEventListener("click", () => this.onReload());

        btnRow.appendChild(this.signInBtn);
        btnRow.appendChild(this.reloadBtn);
        this.toolbar.appendChild(btnRow);

        // iframe load event — best-effort auto-hide detection
        // NOTE: onload fires for cross-origin iframes regardless of whether the
        // embedded content rendered successfully (e.g. an auth redirect also
        // fires onload). This should NOT be treated as a reliable success signal.
        this.iframe.addEventListener("load", () => {
            this.loadedFired = true;
            this.clearLoadTimeout();
            this.loadingIndicator.style.display = "none";
            if (this.formattingSettings.behavior.autoHideToolbar.value) {
                this.deemphasizeToolbar();
            }
        });
    }

    private buttonStyle(bg: string): string {
        return [
            `background:${bg};color:#fff;border:none;border-radius:4px;`,
            "padding:6px 12px;cursor:pointer;font-size:12px;font-family:Segoe UI,sans-serif;",
            "white-space:nowrap;box-shadow:0 1px 3px rgba(0,0,0,0.3);"
        ].join("");
    }

    /** Visually de-emphasize (but never fully remove) the toolbar after load fires. */
    private deemphasizeToolbar(): void {
        this.toolbar.style.opacity = "0.35";
        this.toolbar.style.transition = "opacity 0.4s";
        this.toolbar.addEventListener("mouseenter", () => {
            this.toolbar.style.opacity = "1";
        });
        this.toolbar.addEventListener("mouseleave", () => {
            this.toolbar.style.opacity = "0.35";
        });
    }

    // ── Button Handlers ───────────────────────────────────────────────────────

    private onSignIn(): void {
        if (this.currentUrl) {
            window.open(this.currentUrl, "_blank", "noopener");
        }
    }

    private onReload(): void {
        if (this.currentUrl) {
            // Reset opacity in case it was de-emphasized
            this.toolbar.style.opacity = "1";
            this.loadedFired = false;
            this.loadingIndicator.style.display = "none";
            this.clearLoadTimeout();
            // Force reload by clearing src then reassigning
            this.iframe.src = "";
            // Small timeout to ensure the browser registers the src clear
            setTimeout(() => {
                this.iframe.src = this.currentUrl;
                this.startLoadTimeout();
            }, 50);
        }
    }

    // ── Load Timeout ──────────────────────────────────────────────────────────

    private startLoadTimeout(): void {
        this.clearLoadTimeout();
        const seconds = this.formattingSettings.behavior.loadTimeoutSeconds.value || 8;
        this.loadTimeoutHandle = window.setTimeout(() => {
            if (!this.loadedFired) {
                this.loadingIndicator.style.display = "block";
            }
        }, seconds * 1000);
    }

    private clearLoadTimeout(): void {
        if (this.loadTimeoutHandle !== null) {
            clearTimeout(this.loadTimeoutHandle);
            this.loadTimeoutHandle = null;
        }
    }

    // ── IVisual.update ────────────────────────────────────────────────────────

    public update(options: VisualUpdateOptions): void {
        // populateFormattingSettingsModel expects a single DataView (not the array)
        const dataView = options.dataViews && options.dataViews[0];
        this.formattingSettings = this.formattingSettingsService.populateFormattingSettingsModel(
            VisualFormattingSettingsModel,
            dataView
        );

        const width  = options.viewport.width;
        const height = options.viewport.height;

        // Apply container dimensions
        this.wrapper.style.width  = `${width}px`;
        this.wrapper.style.height = `${height}px`;
        this.iframe.style.width   = `${width}px`;
        this.iframe.style.height  = `${height}px`;

        // Apply appearance settings
        const app = this.formattingSettings.appearance;
        const bgColor = app.backgroundColor.value?.value || "#F3F3F3";
        this.wrapper.style.backgroundColor = bgColor;
        if (app.showBorder.value) {
            const bw = app.borderWidth.value || 1;
            const bc = app.borderColor.value?.value || "#CCCCCC";
            this.wrapper.style.border = `${bw}px solid ${bc}`;
        } else {
            this.wrapper.style.border = "none";
        }

        // Toolbar position
        this.positionToolbar(this.formattingSettings.toolbar.position.value?.value as string);

        // Update button labels
        const tb = this.formattingSettings.toolbar;
        this.signInBtn.textContent = tb.signInLabel.value || "Sign In ↗";
        this.reloadBtn.textContent = tb.reloadLabel.value || "Reload";

        // Toolbar visibility
        const showToolbar = tb.show.value !== false;
        this.toolbar.style.display = showToolbar ? "flex" : "none";

        // Hint banner
        const showHint = tb.showHint.value !== false && !this.hintDismissed;
        if (showToolbar && showHint) {
            this.hintBanner.style.display = "block";
            // Update hint text node (the last child is the text node appended in buildDom)
            const lastChild = this.hintBanner.lastChild;
            if (lastChild && lastChild.nodeType === Node.TEXT_NODE) {
                // Fall back to the settings default when value is empty
                lastChild.textContent = tb.hintText.value || tb.hintText["defaultValue"] ||
                    "If the dashboard doesn't load, click Sign In, complete login in the new tab, then click Reload.";
            }
        } else {
            this.hintBanner.style.display = "none";
        }

        // ── Data binding ─────────────────────────────────────────────────────
        if (!dataView || !dataView.single || dataView.single.value == null) {
            this.showMessage("Add a measure returning an embed <iframe> tag or HTTPS URL to the Embed Source field.");
            this.setIframeUrl("", false);
            return;
        }

        const rawValue = String(dataView.single.value);
        const extracted = extractUrl(rawValue);

        if (extracted.startsWith("ERROR:")) {
            const code = extracted.slice(6);
            let msg = "Unable to read an embed URL from the bound measure.";
            if (code === "unrecognized") {
                msg = "Unable to read an embed URL from the bound measure. Provide an <iframe> tag or a direct HTTPS URL.";
            } else if (code === "nosrc") {
                msg = "Found an <iframe> tag but could not extract its src attribute. Check the measure value.";
            } else if (code === "empty") {
                msg = "The bound measure returned an empty value. Provide an <iframe> tag or a direct HTTPS URL.";
            }
            this.showMessage(msg);
            this.setIframeUrl("", false);
            return;
        }

        // Validate the extracted URL
        const validationError = validateUrl(extracted);
        if (validationError) {
            this.showMessage(validationError);
            this.setIframeUrl("", false);
            return;
        }

        // All checks passed — load the URL if it has changed
        this.hideMessage();
        this.setIframeUrl(extracted, this.currentUrl !== extracted);
    }

    // ── Helpers ───────────────────────────────────────────────────────────────

    private showMessage(text: string): void {
        this.messageEl.style.display = "block";
        // Use textContent to avoid XSS — never innerHTML
        this.messageEl.textContent = text;
        this.iframe.style.display = "none";
    }

    private hideMessage(): void {
        this.messageEl.style.display = "none";
        this.iframe.style.display = "block";
    }

    /**
     * Set or update the iframe src.
     * @param url     URL to load (empty string = clear / don't load)
     * @param changed Whether the URL differs from the currently-loaded one
     */
    private setIframeUrl(url: string, changed: boolean): void {
        if (!url) {
            this.iframe.src = "";
            this.currentUrl = "";
            this.clearLoadTimeout();
            this.loadingIndicator.style.display = "none";
            return;
        }
        if (changed) {
            this.loadedFired = false;
            this.loadingIndicator.style.display = "none";
            this.clearLoadTimeout();
            this.currentUrl = url;
            this.iframe.src = url;
            this.startLoadTimeout();
            // Reset de-emphasis on URL change
            this.toolbar.style.opacity = "1";
            this.toolbar.style.transition = "";
        }
    }

    private positionToolbar(position: string): void {
        const s = this.toolbar.style;
        // Reset all edges first
        s.top = s.left = s.bottom = s.right = "";
        switch (position) {
            case "topLeft":
                s.top = "0"; s.left = "0";
                s.alignItems = "flex-start";
                break;
            case "bottomRight":
                s.bottom = "0"; s.right = "0";
                s.alignItems = "flex-end";
                break;
            case "bottomLeft":
                s.bottom = "0"; s.left = "0";
                s.alignItems = "flex-start";
                break;
            case "topRight":
            default:
                s.top = "0"; s.right = "0";
                s.alignItems = "flex-end";
                break;
        }
    }

    // ── IVisual.getFormattingModel ─────────────────────────────────────────────

    public getFormattingModel(): powerbi.visuals.FormattingModel {
        return this.formattingSettingsService.buildFormattingModel(this.formattingSettings);
    }
}
