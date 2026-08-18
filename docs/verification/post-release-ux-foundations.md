# Post-release UX foundations

Date: 2026-08-10

## Scope

This pass focuses on the player-facing experience and browser-owned presentation
logic. It does not change Python simulation, physics, evolution, persistence, or
versioned IPC contracts. The locked offline, observer-only, explicit-Start, and
deterministic product boundaries remain unchanged.

## Primary-source research

The implementation decisions use the following current guidance:

- [Xbox Accessibility Guidelines](https://learn.microsoft.com/en-us/xbox/accessibility/guidelines): game UI should provide consistent navigation, visible focus, readable text, recoverable errors, and controllable motion.
- [XAG 101: Text display](https://learn.microsoft.com/en-us/xbox/accessibility/xbox-accessibility-guidelines/101): menu, HUD, prompt, and error text must remain readable across the complete experience.
- [XAG 102: Contrast](https://learn.microsoft.com/en-us/xbox/accessibility/xbox-accessibility-guidelines/102): standard text and meaningful visual elements should maintain strong contrast; important state must not rely on color alone.
- [XAG 112: UI navigation](https://learn.microsoft.com/en-us/xbox/accessibility/xbox-accessibility-guidelines/112) and [XAG 113: UI focus handling](https://learn.microsoft.com/en-us/xbox/accessibility/xbox-accessibility-guidelines/113): navigation order and interaction patterns should stay predictable, with a clearly visible focus indicator.
- [XAG 117: Visual distractions and motion settings](https://learn.microsoft.com/en-us/gaming/accessibility/xbox-accessibility-guidelines/117): continuously moving or auto-updating presentation should be pausable or removable.
- [WCAG 2.2](https://www.w3.org/TR/WCAG22/) and [WCAG 2.2 additions](https://www.w3.org/WAI/standards-guidelines/wcag/new-in-22/): keep focus visible, avoid obscured focus, and provide at least 24 by 24 CSS pixel targets or adequate spacing.
- [WAI-ARIA tabs pattern](https://www.w3.org/WAI/ARIA/apg/patterns/tabs/): linked tabs and panels need predictable arrow-key, Home, and End navigation.
- [ARIA live regions](https://developer.mozilla.org/en-US/docs/Web/Accessibility/ARIA/Guides/Live_regions): routine updates should be polite while actionable failures should be assertive.
- [Windows progress controls](https://learn.microsoft.com/en-us/windows/apps/develop/ui/controls/progress-controls): use determinate progress for known work and text for useful background status.
- [`prefers-reduced-motion`](https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/At-rules/%40media/prefers-reduced-motion): honor the operating-system preference and remove non-essential motion.

## Baseline audit

The current v1.1.1 flow already had strong safety and recovery behavior:

- Training never starts without Review, successful Python validation, and an
  explicit Start action.
- Async requests have route and request ownership, preserving valid state after
  late or failed responses.
- Keyboard focus and disclosure state survive same-route renders.
- Track Builder implements linked tabs with roving focus and arrow-key support.
- Dynamic status and error surfaces use polite status or assertive alert
  semantics.
- System reduced-motion preference stops champion replay animation.

The live `1280 x 720` browser audit exposed the primary usability gap. Important
navigation, button, explanatory, telemetry, and table text commonly rendered at
approximately `8.6` to `11.5 px`. The structure was understandable, but the
small type, restrained state contrast, and dense technical presentation made the
product feel like a diagnostic dashboard instead of an approachable AI racing
experience.

## Design decisions

1. **Make the product promise immediate.** Welcome explains the three-part loop:
   choose a track, watch evolution, and compare the champion.
2. **Make readable the default.** Primary UI copy targets `13` to `16 px`, inputs
   stay at `16 px`, and labels remain at least `12 px` except for decorative
   metadata.
3. **Use comfortably sized actions.** Primary, secondary, navigation, and compact
   editor controls target a minimum height of `44 px` where layout permits.
4. **Communicate state through more than color.** Selection uses border, surface,
   and a check mark; focus uses a high-contrast outline; progress retains text
   labels and numeric values.
5. **Keep the race primary.** The authoritative track and moving car remain the
   main Training surface. Dense sensors and telemetry stay inspectable through
   progressive disclosure.
6. **Give motion an in-product off switch.** The system preference remains
   authoritative, and a visible local control can additionally reduce replay and
   interpolation motion without changing simulation state or outcomes.
7. **Preserve expert depth.** Track Builder, exact training controls, local run
   recovery, telemetry, and deterministic details remain available without
   competing with the recommended first-run path.

## Acceptance checks

- Existing TypeScript and Python checks remain green.
- No remote URL or runtime asset is introduced.
- Welcome, Track, Settings, Review, Training, and Results retain their existing
  contracts and keyboard behavior.
- The motion control changes browser presentation only.
- Desktop and narrow layouts have no page-level horizontal overflow.
- The first-run path remains `Welcome -> Review -> explicit Start` and never
  starts automatically.
