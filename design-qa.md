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

For Global, the reference's two-step interaction model is preserved while its unrelated brand treatment and live-price side panel are intentionally excluded. The first page presents Google and GitHub as full-width primary choices above the email path; the second page is dedicated to the six-digit code, resend state, and changing the email. Both steps remain inside ModelGo's existing dark/green auth shell.

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

## Interaction and runtime checks

- China phone → bottom `使用邮箱登录` → China email works and preserves the route with `method=email`.
- China email → `使用手机号登录` returns to the phone form.
- China email signup remains available through `/signup?method=email`.
- Global login starts with Google/GitHub plus an email-only field; submitting a valid email opens a dedicated code page. `/signup?market=global` redirects to the same unified entry.
- The code page shows the submitted email, a six-digit field, resend countdown, and `Use a different email`; returning preserves the entered email.
- Global prototype APIs are local mocks: sending reveals demo code `123456`; submitting that code renders the success state without a real network request or session. Google/GitHub clicks use the same local success-state pattern and do not leave the page.
- Global phone, password, forgot-password, and separate signup controls are absent.
- The market switch preserves auth path/query context in dev/test and uses configured console domains in production.
- Browser interaction check covered China/Global switching, Global step-one email submission, step-two rendering, resend countdown, return-to-edit with preserved email, the `123456` submit flow, and the final success state. Automated coverage also exercises Google/GitHub Mock login. No application runtime error was observed.

final result: passed
