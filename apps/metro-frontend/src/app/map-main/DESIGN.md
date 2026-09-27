---
name: Metro Map Surface
description: A map-first transit workspace with a persistent, responsive information panel.
colors:
  primary: "var(--mat-sys-primary)"
  on-surface: "var(--mat-sys-on-surface)"
  map-canvas: "var(--mat-sys-surface-container)"
  panel: "var(--mat-sys-surface-container-low)"
  control-surface: "var(--mat-sys-surface-container-high)"
  control-hover: "var(--mat-sys-surface-container-highest)"
  supporting-text: "var(--mat-sys-on-surface-variant)"
  outline: "var(--mat-sys-outline)"
typography:
  body:
    fontFamily: "Inter Variable, sans-serif"
  map-title:
    fontFamily: "Inter Variable, sans-serif"
    fontSize: "1.5rem"
    fontWeight: 600
    lineHeight: 1.25
  map-summary:
    fontFamily: "Inter Variable, sans-serif"
    fontSize: "0.875rem"
    lineHeight: 1.4
rounded:
  panel: "16px"
  control: "24px"
  control-tray: "28px"
  focus: "12px"
  grabber: "4px"
spacing:
  xxs: "4px"
  xs: "8px"
  sm: "12px"
  md: "16px"
  lg: "24px"
components:
  map-panel:
    backgroundColor: "{colors.panel}"
    textColor: "{colors.on-surface}"
    rounded: "{rounded.panel}"
    width: "min(400px, calc(100% - 24px))"
  map-panel-handle:
    backgroundColor: "transparent"
    rounded: "{rounded.focus}"
    height: "48px"
    width: "100%"
  map-primary-control:
    rounded: "{rounded.control}"
    height: "48px"
    padding: "0 12px"
  map-secondary-control-tray:
    backgroundColor: "{colors.control-surface}"
    rounded: "{rounded.control-tray}"
    padding: "4px"
---

# Design System: Metro Map Surface

## Overview

**Creative North Star: "Map-First Workspace"**

The map is the working canvas, with route and stop information in one persistent Material surface over the geographic view. Keep the sheet compact and scannable so the map remains useful while people search, locate nearby transit, or inspect a selection.

The surface inherits Metro's Inter Variable typography, Angular Material semantic colors, and the active light or dark scheme. Snapping changes how much content is exposed while the selected title, summary, and information remain in the same panel; the map stays visible around the panel.

**Key Characteristics:**
- The map remains the workspace behind and around the panel.
- One panel presents the same selected information at compact, half, and expanded heights.
- Search and Perto de mim sit in the panel footer; Camadas and map options stay at the upper right.
- Material semantic colors, Inter Variable, and reduced-motion behavior carry through.

## Colors

The surface uses Angular Material role tokens so foregrounds, panels, controls, and focus states follow the active light or dark scheme. The app configures the Material Azure primary and blue tertiary palettes; map styles consume semantic roles instead of defining local swatches.

### Primary
- Material primary drives the filled search action and visible keyboard focus.

### Neutral
- Surface-container fills the map workspace.
- Surface-container-low carries the information panel and its footer.
- Surface-container-high supports the floating secondary-control tray; surface-container-highest marks its hover state.
- On-surface supplies primary text, on-surface-variant supplies summaries, and outline draws the grabber.

**The Semantic Surface Rule.** Keep map surfaces and text on Angular Material system roles so the panel follows both color schemes.

## Typography

**Display Font:** Inter Variable (with sans-serif fallback)  
**Body Font:** Inter Variable (with sans-serif fallback)

**Character:** Familiar Material hierarchy keeps transit labels easy to scan. The selected feature title is the strongest text in the panel; supporting detail stays quieter.

### Hierarchy
- **Title** (600, 1.5rem, 1.25 line-height): selected map feature and panel title.
- **Body** (Material body-medium token): ordinary panel content.
- **Supporting** (400, 0.875rem, 1.4 line-height): title summary and secondary detail.

## Layout

The map fills the navigation-free viewport supplied by the toolbar layout. On desktop, the panel floats at the lower left, 12px from the side and 24px from the bottom, with a maximum width of 400px. On screens up to 767px, it docks across the full bottom edge with only its upper corners rounded. Expanded height is the map workspace height minus 104px on desktop and 80px on mobile. For selected content, compact height is measured from the handle, footer, and visible header; the middle anchor stays near half the workspace while leaving room above compact for long titles. Feature details default to expanded on desktop and half height on mobile. Short notices open compact on both, while layer settings request the expanded anchor. With no active content, the panel shows only its action buttons and sizes to that row; mobile omits the grabber in this initial state.

Search and Perto de mim remain in the panel footer. Camadas and the options menu stay at the map's upper right. At widths up to 360px, the primary controls tighten their gaps and horizontal padding. On mobile, attribution follows the docked panel and fades linearly with its expansion, becoming transparent at the expanded anchor.

**The Persistent Map Rule.** Resizing the panel must leave the map available as the surrounding workspace.

## Elevation & Depth

The panel uses Angular Material level 2 elevation. The upper-right control tray uses two soft black shadows (2px 4px and 4px 8px, each at 8% opacity); the development-only diagnostics surface uses Material level 1. Tonal system surfaces provide the remaining separation. Panel height transitions use 220ms with cubic-bezier(0.2, 0, 0, 1), and are disabled when reduced motion is requested.

## Shapes

The panel has 16px corners, changing to 16px only at its upper corners when docked on mobile. Search and nearby actions are pill-shaped at 24px; the secondary-control tray uses 28px corners. The centered grabber is 36px by 4px with 4px corners. Keyboard focus uses a 2px primary outline inset from the handle edge.

## Components

### Map information panel

The same title, summary, and feature content stay in place at compact, half, and expanded snaps. When details or selection controls are present, the centered 48px handle tracks pointer movement and settles at one of those three heights. A tap advances to the next snap; arrow keys adjust height, Home returns to compact, End expands, and Escape closes selected information or returns an empty panel to compact. Dragging never dismisses the panel. Compact and active-drag states keep the body from scrolling. The empty initial panel has no explanatory copy; on mobile it has no handle, and on desktop it contains only the action buttons.

The 1.5rem selected title shares a row with a mobile-only close button at the far right. That button appears only when the panel descriptor allows dismissal; map-layer settings explicitly disable it. Embedded dialog headings are hidden so the persistent panel title remains the single heading.

### Primary map actions

Search and Perto de mim use Angular Material filled and tonal button variants. They share the footer, each flexes to the available width, and use 48px height, 8px gap, 12px horizontal padding, and 24px corners. At 360px and below, the gap becomes 4px and horizontal padding becomes 8px.

### Secondary map controls

Camadas and map options sit in a floating high-surface tray at the upper right. The tray has 4px padding and 28px corners; its icon button and options action are 48px high.

## Do's and Don'ts

### Do:
- Do keep Search and Perto de mim in the panel footer and Camadas/options at the upper right.
- Do use Material system colors and the existing Inter typography for map surfaces.
- Do keep the selected title and information unchanged across all three panel heights.

### Don't:
- Don't add separate expand or minimize buttons; the centered handle and its keyboard controls own panel height.
- Don't dismiss the panel when a drag reaches compact.
- Don't show the mobile close button for map-layer settings.
