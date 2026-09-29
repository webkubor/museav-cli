# Design QA — Authentication market switch

## Evidence

- Source visual truth: `/var/folders/kx/c91frh69359__0mb5qcw9s0w0000gn/T/codex-clipboard-a5ea68ad-10b6-434d-8bcf-a134c06add43.png`
- Global step-one references:
  - `/var/folders/kx/c91frh69359__0mb5qcw9s0w0000gn/T/codex-clipboard-2dc4926f-6eb8-4d5b-9582-99ef98fad3a2.png`
  - `/var/folders/kx/c91frh69359__0mb5qcw9s0w0000gn/T/codex-clipboard-9d7572fc-15ad-4e37-a65b-b1326b2f6b30.png`
- Global step-two reference: `/var/folders/kx/c91frh69359__0mb5qcw9s0w0000gn/T/codex-clipboard-26bbb1cd-3ebe-411e-8adc-6000687b3aca.png`
- Normalized source: `design-qa-assets/source-china-phone-1512x823.png`
- Implementation screenshot: `design-qa-assets/implementation-china-phone-1512x823.png`
- Global implementation was re-verified live in the in-app browser at `http://127.0.0.1:5175/login?market=global` for both the provider/email entry and dedicated verification-code page.
- Combined comparison input: `design-qa-assets/comparison-china-phone.png` (source left, implementation right)
- Responsive post-fix evidence: `design-qa-assets/implementation-china-phone-800x823-fixed.png`
- Route/state: China site, phone authentication, security-verification row visible, first field focused.
- Viewport and density normalization:
  - Source: 3024 × 1646 physical pixels, inferred 1512 × 823 CSS viewport at 2× density.
  - Implementation: 1512 × 823 physical/CSS pixels at device scale factor 1.
  - The source was downsampled to 1512 × 823 before the side-by-side comparison. No crop was applied.

## Full-view comparison

The implementation preserves the source composition: centered 400 px auth card, logo/header hierarchy, two-field phone flow, verification row, full-width primary action, legal copy, social divider/buttons, and the bottom email entry. The approved changes are intentionally visible: the title/subtitle and CTA copy are clearer, and the market selector is added to the page top-right.

The source screenshot contains a transient invalid-phone error while the implementation capture contains the autofocus ring. That state-only line is excluded from spacing judgment; the surrounding field and form geometry remain aligned.

For Global, the reference's two-step interaction model is preserved while its unrelated brand treatment is intentionally excluded. The first page presents Google and GitHub as full-width primary choices above the email path; the second page is dedicated to the six-digit code, resend state, and changing the email. Both steps remain inside ModelGo's existing dark/green auth shell.

## Required fidelity surfaces

- Fonts and typography: existing ModelGo font stack, weights, sizes, and hierarchy are preserved. New selector labels use the existing caption/button typography.
- Spacing and layout rhythm: original card width, padding, control heights, divider rhythm, and centered composition are preserved. The selector has its own floating chrome and does not displace desktop content.
- Colors and visual tokens: all new UI uses existing `--mg-*` and `--brand-*` tokens. China remains light/indigo; Global remains dark/green.
- Image quality and asset fidelity: the existing ModelGo logo and icon library assets are reused; no replacement raster, custom SVG, or placeholder art was introduced.
- Copy and content: approved China phone copy is `手机号登录` / `未注册的手机号将自动创建账号` / `验证并继续`. China email remains the bottom alternate method. Global uses a two-page passwordless flow: provider-or-email selection first, then a dedicated email-code page. It has no password field, separate signup link, or phone option.

## Focused-region comparison

No additional crop was required: controls, labels, logo, divider, and selector are readable at the normalized 1:1 viewport. The separate 800 × 823 screenshot is used for the only responsive finding.

## Findings

- No remaining P0, P1, or P2 issues.
- [P3] The top-right selector is visually independent of the card at wide desktop sizes. This is intentional so it communicates site context rather than an authentication method tab.

## Comparison history

1. Initial browser pass found a P2 at narrow desktop/tablet width: the top-right market selector could touch the auth card corner.
2. Fix: added narrow-width top spacing and centered the selector at widths up to 820 px.
3. Post-fix evidence: `design-qa-assets/implementation-china-phone-800x823-fixed.png` shows clear vertical separation and no overlap. The 1512 × 823 desktop capture remains unchanged in composition.
4. Global entry feedback identified excessive vertical whitespace around the `OR` divider. The global-only selector now removes the shared divider's 24 px block margin, leaving only the form's 16 px rhythm without changing China or the verification-code page.
5. Global account-notice feedback removed the decorative shield and reduced the copy from caption to micro typography, keeping the notice centered while leaving the human-verification control unchanged.
6. Global verification-order feedback moved the account notice and human-verification gate above the email CTA, so the required step now precedes the action it unlocks.

## Global discount showcase

### Evidence

- Live reference: `https://platform.cheaperinference.com/signup`
- User-provided reference screenshot: `/var/folders/kx/c91frh69359__0mb5qcw9s0w0000gn/T/codex-clipboard-23289242-7c51-4fad-b619-881dde4b9d00.png`
- Auto-scroll and divider reference screenshot: `/var/folders/kx/c91frh69359__0mb5qcw9s0w0000gn/T/codex-clipboard-5175cb5c-3b8b-4062-a696-4fa8f45294e5.png`
- Browser reference capture: `design-qa-assets/reference-discount-1512x767.png`
- Latest implementation capture: `design-qa-assets/implementation-discount-surface-parity-1920x902.png`
- Earlier focused side-by-side comparison: `design-qa-assets/comparison-discount-divider-polish.png`
- Route/state: Global site, initial provider/email page, dark theme.
- Desktop implementation viewport: 1920 × 902 CSS pixels. The auth card is 400 × 675.78 px and the showcase is 520 × 675.78 px; the document has no horizontal overflow.

### Full-view comparison

The implementation follows the reference's useful information hierarchy—a live-savings heading, compact model rows, provider and preview-price metadata, prominent percentage savings, and a catalog footer—without copying its brand styling. It is adapted to ModelGo's dark/green shell, existing 400 px authentication card, typography, spacing, and token system. The panel is deliberately narrower than the reference so the two-column composition remains balanced.

The showcase uses local mock data and existing `ModelIcon` assets. Its catalog link resolves to the public `/models` route. The header and footer remain fixed while the center model list continuously auto-scrolls as a seamless duplicated loop. Manual wheel scrolling is disabled; hovering pauses the animation and leaving resumes it. At 1040 px and below the secondary panel and divider are hidden, preserving the focused single-card mobile/tablet flow.

### Required fidelity surfaces

- Typography and hierarchy: heading, summary, row title, metadata, discount, and footer retain the reference's relative emphasis while using ModelGo type tokens.
- Layout rhythm: twelve equal-height mock rows, aligned metadata, right-anchored discount values, and equal-height auth/showcase cards at desktop width. The center separation is now a 2 px brand-tinted rail with 64 px clearance on each side; its ends fade softly and a restrained glow keeps it legible against the dark grid without becoming a competing focal point.
- Color and surfaces: the login card and showcase now consume the same opaque, token-derived dark gradient, border color, and shadow. Both use the same green `liquid-border` highlight treatment; internal rows retain low-contrast token dividers and brand-green discount values.
- Assets: all model marks use the existing `ModelIcon` component; no hand-drawn SVGs or placeholder graphics were introduced.
- Content behavior: all displayed prices and discounts are explicit local mock values; no production pricing endpoint is called.

### Findings and comparison history

1. Initial implementation used translucent `--mg-bg-0`; the page grid reduced row readability, recorded as P2.
2. Fix: changed the panel to solid `--mg-bg-0-solid` while retaining the existing border, radius, and shadow tokens.
3. Post-fix browser probe confirmed `rgb(35, 35, 41)`, equal card heights, and no horizontal overflow at 1920 × 902.
4. Focused comparison confirmed no remaining P0, P1, or P2 visual issues.
5. Earlier manual-scroll implementation was replaced after feedback with a continuous automatic loop. The list duplicates the twelve-row set for a seamless reset and uses `overflow: hidden`, so wheel/drag scrolling is unavailable.
6. Desktop browser verification at 1920 × 902 measured the center list at 552 px client height and 1536 px scroll height. `scrollTop` advanced from 13.5 to 44 automatically, stayed exactly 436 for 1.2 seconds while hovered, then advanced from 437 to 467.5 after the pointer left.
7. The desktop grid measured 1001 px wide. The auth card ended at x=859.5 and the showcase began at x=940.5, leaving an 81 px separation zone composed of 40 px gap + 1 px divider + 40 px gap.
8. Follow-up visual review found the original `--mg-border` divider too low-contrast and the 40 px side clearance too tight. The post-fix desktop grid measures 1050 px wide; the two panels now have a 130 px separation zone composed of 64 px gap + 2 px divider + 64 px gap. Browser-computed styles confirm the token-driven vertical gradient, 999 px radius, 0.86 opacity, and subtle brand drop shadow.
9. Responsive re-check at 632 × 778 confirmed the secondary panel and divider are both hidden, the 400 px auth card stays centered, and horizontal overflow remains 0 px.
10. Follow-up inspection found the duplicated auto-scroll tracks omitted the row divider at their joining seam. Removing the last-row border exception gives every row the same tokenized bottom divider; browser verification confirms both tracks remain exactly 768 px high, the combined scroll height remains 1536 px, and the seam no longer opens into a blank horizontal band.
11. The highlighted center rail initially sat 12 px away from the nearest background-grid line because the 1050 px content group was viewport-centered while the grid repeated independently every 48 px. On desktop widths, the vertical grid layer now receives a content-aware phase offset so its leading edge lands exactly at the rail center (`x=900` at 1920 px), without shifting either card or making the 64 px side clearances asymmetric.
12. Surface comparison found the showcase's former `--mg-bg-0-solid` purple-gray cast visually disconnected from the login card. Both cards now inherit the exact same dark gradient and shadow variables, and share one reusable `auth-flow-surface` border implementation. Browser-computed styles match for background image, border color, shadow, conic highlight, and 4-second animation duration; reduced-motion disables the rotation while retaining the static border treatment.

## Interaction and runtime checks

- China phone → bottom `使用邮箱登录` → China email works and preserves the route with `method=email`.
- China email → `使用手机号登录` returns to the phone form.
- China email signup remains available through `/signup?method=email`.
- Global login starts with Google/GitHub plus an email-only field; submitting a valid email opens a dedicated code page. `/signup?market=global` redirects to the same unified entry.
- The Global entry includes a local Mock human-verification gate in the annotated slot between the account notice and legal copy. It gates only the email login/register path; Google and GitHub remain directly available.
- The code page shows the submitted email, a six-digit field, resend countdown, and `Use a different email`; returning preserves the entered email.
- Global prototype APIs are local mocks: sending reveals demo code `123456`; submitting that code renders the success state without a real network request or session. Google/GitHub clicks use the same local success-state pattern and do not leave the page.
- Global phone, password, forgot-password, and separate signup controls are absent.
- The market switch preserves auth path/query context in dev/test and uses configured console domains in production.
- Browser interaction check covered China/Global switching, the new human-verification idle/verifying/verified states, the email-only lock/unlock behavior, directly available Google/GitHub choices, Global step-one email submission, step-two rendering, resend countdown, return-to-edit with preserved email, the `123456` submit flow, and the final success state. No application runtime error was observed.

final result: passed
