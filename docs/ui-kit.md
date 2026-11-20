# CollegeStat UI kit

This is the guide for anyone building or reworking a page. Before writing a new bespoke component, use the pieces below. Pages are inconsistent today because the 64-part shadcn kit in `components/ui/` is installed but mostly unused, while `components/college/` holds 167 bespoke components with 57 global stylesheets.

## Look and feel

The new landing page (`components/college/landing-v4.tsx` and `landing-v4.css`) is the visual reference for the whole product: public pages, the dashboard and the landing should feel like one app.

- **Overall:** calm and near-monochrome, with brand blue as the single accent.
- **Type:** Poppins for headings (`var(--l4-display)`, with Montserrat as the Cyrillic fallback) and Inter for body text.
- **Surfaces:** rounded panels, generous and consistent spacing, no clutter.
- **Empty data:** hide fields and sections that have no data rather than showing placeholders.
- **Sources:** show a small source link beside a figure. Do not add evidence or methodology blocks to student-facing pages.

## Building blocks, in order of preference

1. **`components/ui/*`** (shadcn, "new-york" style, Tailwind v4, Radix). Use these for all generic controls:
   - **Actions:** `button` (variants and sizes, including the `icon-*` sizes) and `button-group`.
   - **Forms:** `input`, `input-group`, `textarea`, `select`, `native-select` (best on mobile), `checkbox`, `radio-group`, `switch`, `slider`, `field`, `form`, `label`, `combobox` and `command` (cmdk) for searchable pickers.
   - **Overlays:** `dialog`, `alert-dialog`, `sheet` (side panels and mobile filter sheets), `drawer` (vaul bottom sheets), `popover`, `hover-card`, `tooltip`, `dropdown-menu` and `context-menu`.
   - **Layout:** `card`, `separator`, `tabs`, `accordion`, `collapsible`, `scroll-area`, `resizable`, `sidebar` (dashboard shells), `breadcrumb` and `pagination`.
   - **Data:** `table`, `badge`, `avatar`, `progress`, `chart` (a Recharts wrapper; read the `dataviz` skill first), `skeleton`, `empty` and `kbd`.
   - **Feedback:** `sonner` (toasts), `spinner` and `alert`.
   - **AI chat:** `message`, `message-scroller`, `bubble`, `attachment` and `shining-text`, for the assistant.

   Theme tokens are the shadcn CSS variables (`--background`, `--foreground`, `--primary`, `--muted`, `--border`, `--radius` and the rest) in `app/globals.css` and `vendor/shadcn-tailwind-4.13.0.css`. Use the tokens, not hard-coded colours, so light and dark mode both work. Dark mode is the `html.dark` class from next-themes.
2. **`components/college/primitives.tsx`**, for domain pieces:
   - `UniversityLogo`: the official logo, with a monogram fallback.
   - `RankingBadge`, `UniversityStat`, `SourceBadge`, `VerifiedBadge`, `DataSourcePopover`, `EmptyState`, `SectionHeading`, `Choice`, `Brand` and `GlassSurface`.
3. **Other domain components:**
   - `components/college/ranking-badges.tsx` holds the publisher marks.
   - `components/college/i18n.tsx` provides `useT`, `Rich` and `LanguageSwitcher`. Every visible string goes through `useT` and appears in all six locales in `lib/i18n/locales/`.
4. **Libraries already installed (add no new UI dependencies without a reason):**
   - `lucide-react` for icons (one icon set only).
   - `motion` for animation. Keep it subtle and respect `prefers-reduced-motion`.
   - `recharts` through `ui/chart`.
   - `cmdk`, `vaul` and `sonner`.
5. **Backgrounds and effects:** `components/react-bits/` (Aurora is used on auth). You can add more React Bits components (for example a dot grid, a grid or particles) through the shadcn CLI from the React Bits registry. Put them in `components/react-bits/`, pause them off-screen, and render them static under reduced motion.

## Rules

- Do not add a new global stylesheet to `app/globals.css`. Scope CSS to your component, or use Tailwind utilities on top of the kit.
- When you replace a bespoke component with a kit component, delete the old component and its CSS.
- Do not restyle the public navbar (`app/navigation.css`, `app/liquid-material.css`).
