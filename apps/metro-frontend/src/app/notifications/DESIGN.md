---
name: Metro Notifications
description: Compact Material controls for configuring transport alerts around a rider's routine.
colors:
  primary: "var(--mat-sys-primary)"
  on-primary: "var(--mat-sys-on-primary)"
  surface: "var(--mat-sys-surface)"
  surface-container-low: "var(--mat-sys-surface-container-low)"
  surface-container: "var(--mat-sys-surface-container)"
  on-surface: "var(--mat-sys-on-surface)"
  on-surface-variant: "var(--mat-sys-on-surface-variant)"
  outline-variant: "var(--mat-sys-outline-variant)"
  primary-container: "var(--mat-sys-primary-container)"
  on-primary-container: "var(--mat-sys-on-primary-container)"
  secondary-container: "var(--mat-sys-secondary-container)"
  on-secondary-container: "var(--mat-sys-on-secondary-container)"
  error-container: "var(--mat-sys-error-container)"
  on-error-container: "var(--mat-sys-on-error-container)"
typography:
  title:
    fontFamily: "Inter Variable, sans-serif"
    fontSize: "2rem"
    fontWeight: 650
    lineHeight: "1.2"
    letterSpacing: "-0.02em"
  body:
    fontFamily: "Inter Variable, sans-serif"
    lineHeight: "1.5"
  supporting:
    fontFamily: "Inter Variable, sans-serif"
    fontSize: "0.86rem"
    lineHeight: "1.45"
  label:
    fontFamily: "Inter Variable, sans-serif"
    fontSize: "0.8rem"
    fontWeight: 650
rounded:
  sm: "8px"
  md: "12px"
  pill: "999px"
spacing:
  xs: "4px"
  sm: "8px"
  md: "16px"
  lg: "24px"
components:
  primary-action:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.on-primary}"
    rounded: "{rounded.pill}"
  outlined-surface:
    backgroundColor: "{colors.surface-container-low}"
    textColor: "{colors.on-surface}"
    rounded: "{rounded.md}"
    padding: "20px"
---

# Design System: Metro Notifications

## Overview

**Creative North Star: "The Transit Alert Console"**

This is an Operate surface for riders who need to configure and maintain transport alerts quickly. The page leads with a plain Portuguese heading, a device-delivery card, and a compact list of named triggers. Inline editing keeps the trigger being changed beside its saved summary, so the user can scan, act, and return to the list without losing context.

The surface extends the existing Angular Material light/dark system. Inter Variable, semantic Material roles, restrained separators, and familiar controls keep a dense settings task legible at phone widths. The supplied desktop, mobile, dark mobile, editor, and arrival-horizon captures were part of the reviewer pass. The mobile-overflow and switch accessible-name findings are resolved, and the browser UI suite passed 5/5.

## Colors

Use Material system roles for structure and state. Primary marks actions and notification cues; surface and outline roles provide the quiet hierarchy; secondary containers carry device/status badges; error containers carry recoverable failures. Theme variables stay live so the same surface works in light and dark mode.

**The Semantic State Rule.** Pair color with text, structure, or an icon. A selected day, active switch, paused trigger, delivery warning, and error must remain understandable without color perception.

## Typography

**Display Font:** Inter Variable (with `sans-serif` fallback)
**Body Font:** Inter Variable (with `sans-serif` fallback)

The page title is compact and confident (`2rem`, weight `650`, `-0.02em` tracking). Supporting descriptions and trigger metadata are quieter (`0.86rem` and `0.82rem`) while retaining a `1.45`–`1.5` line height. Keep Portuguese labels and operational copy direct; preserve tabular readability for times.

## Layout

The page is capped at `1120px` with `32px` horizontal gutters on desktop, `24px` top and `40px` bottom padding, and a `24px` gap below the header. At widths up to `700px`, use `12px` gutters and `16px` top padding. The push card precedes the trigger section; triggers are a full-width list divided by `1px` outline-variant rules. On mobile, each trigger stacks its copy and actions, with actions aligned to the end. The editor uses two columns on wide screens and one column below `700px`; its time-window row keeps start, end, and delete controls usable without horizontal overflow.

## Elevation & Depth

The surface is flat at rest. Depth comes from outlined Material cards/editor panels, tonal surface containers, dashed state/empty boundaries, and list separators. No custom shadow vocabulary is used.

## Shapes

Use gently rounded Material forms: `12px` for the push card, editor, and state panels; `8px` for warnings, result lists, and day controls; pill geometry for status/device/target badges and Material primary actions. Prefer one-pixel semantic outlines and separators over decorative borders.

## Components

### Push setup card

An outlined Material card introduces delivery on the current device. Keep the bell icon, title/subtitle, current permission state, and one primary action together. Browser permission is requested only after the user activates `Ativar notificações`; initialization only reads the state. Authorized devices remain a quiet list below a divider.

### Trigger rows

Each row is a compact named trigger: notification icon, name, kind, schedule summary, target summary, textual `Ativo`/`Inativo` switch, and edit/delete icon buttons. Disabled rows use reduced emphasis and a `Pausado` badge. Keep action labels accessible even when the visual controls are icons or a switch.

### Inline trigger editor

The editor is an outlined `surface-container-low` panel with `20px` desktop padding and `16px` mobile padding. It contains an editable name/type pair, multi-select weekday buttons, one or more time windows, target search/results/chips, and a final save/cancel action row. Smart controls appear only for status/notices; arrival triggers expose a small horizon choice list while cadence stays internal.

### States and feedback

Authenticating, signed-out, loading, empty, unavailable-delivery, and error states use centered or inline Material icon-plus-copy compositions. Recoverable errors use the error container role and explain the next action. Refresh is a small icon action in the header.

## Do's and Don'ts

### Do:

- **Do** reuse Angular Material controls, Inter Variable, and semantic `--mat-sys-*` roles.
- **Do** keep all interface copy in Brazilian Portuguese and expose schedule/target facts in each row.
- **Do** preserve multiple weekdays, multiple windows, overnight windows, and the fixed `America/Sao_Paulo` timezone in the editor.
- **Do** keep permission setup explicit, mobile-first, and readable in both color schemes.

### Don't:

- **Don't** prompt for browser permission automatically or imply that cloud configuration is device-local.
- **Don't** expose notification cadence as a user-facing control; arrival setup stays with simple horizon choices.
- **Don't** turn this settings surface into a decorative card grid, marketing panel, or shadow-heavy dashboard.
- **Don't** make smart delivery controls appear for kinds that do not support them.
