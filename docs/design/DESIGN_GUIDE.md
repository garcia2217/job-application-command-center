# Design Guide — Job Application Command Center

**Status:** Settled for MVP · **Reference implementation:** `docs/design/home.html`

This is the UI source of truth. `docs/PRD.md` says *what* the product does; this says *how it looks and behaves*. When building any screen, follow this document — do not re-derive spacing, color, or component decisions.

`home.html` is a static prototype of the home screen that encodes every rule below. When this document and `home.html` disagree, `home.html` wins and this document gets corrected.

---

## 1. Design principles for this app

Five rules, in priority order. They resolve most arguments without escalation.

1. **The screen answers one question.** Home answers "who do I chase today?". The application detail answers "where does this one stand?". If an element doesn't help answer the screen's question, it goes somewhere else or nowhere.
2. **Show what the app knows that a spreadsheet doesn't.** Days-silent, last activity, upcoming stages, match percentage. These get the strongest visual weight on any screen they appear on.
3. **Density over decoration.** This is a daily tool for one technical user. Compact rows, real data, no hero type, no vanity stat tiles, no illustrations.
4. **One accent, semantic color only for meaning.** Indigo is the only decorative color. Amber/red mean *silent*. Status dots are category markers, not badges.
5. **Every element justifies itself.** If removing it loses nothing, remove it.

### Explicit do-nots

- No stat tiles / KPI boxes. The PRD rules out analytics dashboards (§5).
- No cards nested inside cards. One `.panel` per section, list rows inside it.
- No gradients, glassmorphism, glows, or stacked shadows.
- No colored pill badges for status — dot + word only (§4).
- No icon on every label. Icons appear only in navigation.
- No modal for anything that has a page. Modals only for destructive confirmation.
- No hover-only affordances. Everything discoverable without a pointer.

---

## 2. Tokens

Tailwind 4 uses `@theme` in `globals.css`. Define these once; never hardcode a hex or a pixel value in a component.

```css
@theme {
  /* Surfaces */
  --color-bg:              #f7f7f8;
  --color-surface:         #ffffff;
  --color-surface-sunken:  #f1f1f3;  /* hover, inset areas */
  --color-border:          #e3e3e7;  /* dividers, panel edges */
  --color-border-strong:   #c9c9d1;  /* control outlines */

  /* Text */
  --color-text:            #1b1b1f;
  --color-text-muted:      #5f5f6b;  /* secondary info, role titles */
  --color-text-faint:      #86868f;  /* metadata, counts, column heads */

  /* Accent — the only decorative color */
  --color-accent:          #3b4ee0;
  --color-accent-hover:    #2f3fc4;
  --color-accent-soft:     #eceefc;  /* active nav, active filter chip */

  /* Semantic — meaning only, never decoration */
  --color-warn:            #a35a00;  /* quiet application */
  --color-warn-soft:       #fdf1e0;
  --color-danger:          #b3261e;  /* destructive, severely quiet */
  --color-ok:              #1a6b47;

  /* Status dots */
  --color-status-wishlist:     #9a9aa5;
  --color-status-applied:      #4f7fd6;
  --color-status-interviewing: #c98a1f;
  --color-status-offer:        #2f9e6a;
  --color-status-rejected:     #c4554d;
  --color-status-withdrawn:    #7d7d88;

  --radius-sm: 6px;   /* buttons, chips-as-rects, inputs */
  --radius-md: 10px;
  --radius-lg: 14px;  /* panels */
}
```

**Dark mode** (`prefers-color-scheme: dark`) overrides only the values, never the token names:

```
bg #131316 · surface #1b1b1f · surface-sunken #232328 · border #2e2e35 · border-strong #44444e
text #ececf0 · text-muted #a1a1ac · text-faint #7d7d88
accent #8a97ff · accent-hover #a3adff · accent-soft #23253d
warn #e5a75a · warn-soft #34291a · danger #f2837c · ok #6fc79b
```

Status dot colors are unchanged in dark mode — they are already mid-tone.

Primary button text is `#fff` in light mode and `#14142a` in dark mode (the accent lightens, so dark text keeps contrast).

### Spacing

4px base scale: **4, 8, 12, 16, 24, 32, 48**. Nothing outside it. In Tailwind: `1, 2, 3, 4, 6, 8, 12`.

Standard uses: row padding `12px 16px` · panel inner padding `16px` · gap between sections `32px` · desktop page padding `32px` · mobile page padding `16px` · section-head margin-bottom `12px`.

### Typography

System stack: `-apple-system, BlinkMacSystemFont, "Segoe UI", Inter, Roboto, sans-serif`. No web fonts.

| Role | Size | Weight | Color |
|---|---|---|---|
| Page title | 26px desktop / 22px mobile | 600 | text |
| Page subtitle (situation line) | 14px | 400 | text-muted |
| Section heading (`h2`) | 15px | 600 | text |
| Row primary (company, stage name) | 15px | 500 | text |
| Row secondary (role title) | 14px | 400 | text-muted |
| Body / table cell | 14px | 400 | text |
| Metadata, counts, chips | 13px | 400 | text-muted / text-faint |
| Table column header | 12px, uppercase, `0.03em` | 500 | text-faint |

Headings use `letter-spacing: -0.01em`. All numbers that align in columns or compare across rows use `font-variant-numeric: tabular-nums` — dates, day counts, times, match percentages.

---

## 3. Components

Named components implied by the design. Build them once in `frontend/src/components/`.

### `Panel`
White surface, 1px border, `radius-lg`, subtle shadow (`0 1px 2px rgba(20,20,30,.06), 0 1px 3px rgba(20,20,30,.04)`; in dark mode a single `0 1px 2px rgba(0,0,0,.4)`), `overflow: hidden`. Contains list rows or a table. **Never a bare box around a single value.**

### `SectionHead`
`h2` + optional count + spacer + optional right-side link or hint. 13px for count and link. The link is accent-colored, no underline until hover.

### `Row` (list item inside a Panel)
Min height 60px, padding `12px 16px`, full-row `<a>` link, `surface-sunken` on hover, 1px `border` between siblings (not after the last). Two-line layout: primary line, then a metadata line at 13px/text-muted with `·` separators.

### `StatusIndicator`
7px round dot + 13px word in `text-muted`. Dot color from the status token. Used everywhere status appears — list, table, detail header. Never a filled badge.

### `SilentBadge`
Pill, `999px` radius, `2px 8px`, 13px/500, tabular numerals. Default: `warn` on `warn-soft`. Past roughly 3× the quiet threshold: `danger` on a 12% danger tint. Text reads `24d silent` in the follow-up queue, shortened to `24d` where space is tight (mobile cards).

### `Button`
Min height 40px (32px for `sm`), padding `0 16px`, `radius-sm`, 14px/500.
- **Primary:** accent fill. **Exactly one per screen.**
- **Secondary:** surface fill, `border-strong` outline.
- **Ghost:** transparent, `text-muted`, `surface-sunken` on hover.
- **Destructive:** danger text on surface with a danger outline; filled danger only inside a confirmation dialog.

### `FilterChip`
Min height 36px, `999px` radius, 13px, `border-strong` outline. Carries a count in `text-faint`. Active state uses `aria-pressed="true"`: `accent-soft` background, accent border and text, weight 500. On mobile the chip row scrolls horizontally with hidden scrollbars.

### `EmptyState`
Centered, `32px 16px` padding. One line of 15px/500 `text` stating the situation, one line of 14px `text-muted` explaining or offering the action. An action button only where the PRD specifies one.

### `InlineAlert`
Used for the duplicate-application warning and the "resume or job description changed since this comparison" notice. Left-aligned text on a soft semantic tint, `radius-sm`, 14px. Not a toast, not a modal.

### `FieldError`
13px `danger` text directly below the input, with the input's border switched to `danger`. Required by NFR-07: errors always sit next to their field, never as a banner, never a stack trace.

---

## 4. Layout & responsive rules

The breakpoint is **900px**. There is only one.

### Below 900px (mobile)
- Single column, page padding `16px`, bottom padding `96px` to clear the nav bar.
- **Bottom nav**, fixed, 5 destinations (Home, Applications, Companies, Contacts, Settings), 56px tall, icon over 11px label, `env(safe-area-inset-bottom)` respected. Active item is accent-colored and weight 500.
- Tables become **cards**: company + silent badge on line one, role on line two, status + last activity on line three.
- The right rail stacks below the main column.
- Everything works at **375px with no horizontal page scroll** (NFR-03). Only the filter chip row scrolls sideways, deliberately.

### 900px and up (desktop)
- `220px` sidebar + fluid main, main capped at `1200px`.
- **Sidebar nav**, sticky below the top bar, full height. Active item: `accent-soft` background, accent text. The Applications item carries a count badge.
- Main content splits `minmax(0,1fr)` + `320px` right rail with a `32px` gap. At `1280px` the rail grows to `360px`.
- Cards become a **table**. Sortable column headers carry `aria-sort`.

### Top bar (both)
Sticky, `surface` background, bottom border, 57px tall. Brand on the left with the account name in `text-faint`; ghost Search and primary **Add application** on the right.

### Page header
Title is the situational fact, not the screen name — home reads `Monday, 16 March`, not "Home". Below it, one 14px `text-muted` line summarizing the state (`3 applications have gone quiet · 2 interviews this week`). This line replaces stat tiles; keep it factual and derived from real counts.

---

## 5. States

Every list and async view needs all of these. Copy is specified by the PRD where quoted.

| State | Treatment |
|---|---|
| **Loading** | Skeleton rows matching the real row height (60px), `surface-sunken` blocks, no spinner for list content. Spinners only for in-button actions. |
| **Empty — first use** | `EmptyState` with the PRD's action, e.g. "Add your first application". |
| **Empty — nothing to do** | Positive framing: "Nothing needs follow-up." No action button. |
| **Empty — no results after filtering** | "No applications with this status." Offer "Clear filter". |
| **Never run** | "First check pending." (F-04) |
| **Error** | `InlineAlert` in place of the content, plain language plus a Retry button. Never a raw error or stack trace. |
| **Partial failure** | Show what loaded; alert only the part that failed. |
| **Disabled action** | Dimmed control plus the PRD's reason next to it, e.g. "Add your resume in Settings first." Never a disabled control with no explanation. |
| **Success** | Inline and immediate — the row updates in place. Toast only when the change isn't visible on screen. |
| **Long text** | Role titles and company names truncate with ellipsis at one line in rows; full text in the detail view. |
| **Large N** | The list must stay usable at 500 applications (NFR-02). Paginate or virtualize; never render 500 rows into the home screen. |

---

## 6. Interaction rules

- **Undo over confirmation** for anything reversible. Confirmation dialogs only where the PRD requires them: deleting an application (cascades to stages and comparison) and deleting a company. The confirm button names the action — "Delete application", never "OK".
- **Feedback under 100ms** for every action; a progress indicator for anything over ~1s. The API sleeps on Render's free tier, so first-load skeletons matter more here than in a normal app.
- **Validate on blur or on submit**, never on every keystroke.
- **Preserve input** through validation errors and navigation. A half-filled application form must survive a failed save.
- **Motion:** 150–300ms, only to explain a change (a row leaving the follow-up list, a sheet opening). Always gated behind `prefers-reduced-motion`.
- **Quiet applications leave the follow-up list immediately** on new activity — this is an optimistic UI update, not a wait for the next daily run (F-04).

---

## 7. Accessibility floor

Non-negotiable, checked per screen:

- Contrast 4.5:1 body / 3:1 large text and control boundaries, in **both** color schemes.
- Touch targets ≥ 44×44px on mobile. Row links meet this via the 60px row height.
- Full keyboard operation with a visible focus ring: `2px solid accent`, `2px` offset. Never removed.
- Semantic structure: one `h1` per page, `nav` landmarks labeled, lists as `ul`/`li`, tables with `th scope="col"` and `aria-sort`.
- Status is **never color alone** — the dot always sits beside its word. Silent badges always carry the day count as text.
- Forms have persistent visible labels. Placeholders are not labels.
- Async results and toasts announce via a live region.

---

## 8. Screens still to be designed

These follow the rules above but have no settled layout yet. Design them with the `product-design` skill before implementing:

- Add / edit application form (incl. inline company creation, duplicate warning)
- Application detail (header, contacts, ordered interview stages, comparison result)
- Companies list and company detail
- Contacts list
- Settings (quiet threshold, time zone, resume paste, digest preview, run records)
- Sign-in
- Digest email template (HTML email — different constraints; tokens still apply)
