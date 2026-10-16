# scrapeTx brand and interface

The app identity follows the two reference images supplied on 17 October 2026: **scrapeTx**, with the tagline **Research, distilled.** The wordmark combines a charcoal `scrape`, a sage `Tx`, and an extraction-corner motif. The compact app mark and favicon are SVG assets in `public/`.

## Palette and typography

| Token | Color | Use |
| --- | --- | --- |
| Charcoal | `#17191D` | Text, wordmark, workspace button |
| Ivory | `#F1F0EC` | Canvas foundation |
| Sage | `#718779` | Brand accents and decorative marks |
| Blue | `#355DAB` | Keyboard focus and secondary accents |

Sage controls use darker shades (`#526D5E` and `#3E584A`) so white labels remain readable. The home canvas is a lighter ivory tint, with white input and research panels.

Satoshi is loaded directly through the [official Fontshare API](https://www.fontshare.com/fonts/satoshi). It is not redistributed in this public repository. It is governed by [ITF's Free Font License](https://www.fontshare.com/licenses/itf-ffl), independently of this application's MIT license. The Satoshi variable family provides regular body text, medium navigation and controls, bold headings, and a heavy wordmark. Geist is bundled through `@fontsource-variable/geist` as an offline fallback, under the [SIL Open Font License](https://github.com/vercel/geist-font/blob/main/OFL.txt). The italic accents use the system Georgia serif family.

## Structure and behavior

- `src/Brand.jsx`: wordmark, tagline, and extraction-corner components.
- `src/brand-theme.css`: brand tokens, responsive shell, home layout, common controls, focus, and motion.
- The sidebar scrolls independently; the library and secondary tools remain accessible through **More tools** and the top navigation.
- The home contains the research composer, thirteen horizontally arranged sources, task shortcuts, research watches, actual saved sources, and four research-tool shortcuts.
- Research-source icons retain their colors. Navigation and general workspace icons are restrained outline icons.
- Hover transitions take 200–220 ms, with a small lift and soft border/shadow change. The source rail, sidebar, and document use native smooth scrolling. Native touch and trackpad scrolling remain intact.
- Reduced Motion disables animated scrolling, transitions, and decorative hover movement. Source-rail arrow actions also check the preference before scrolling.

The reference's sample saved papers and paid-plan card are not fabricated in the app. Library panels use actual saved records; the sidebar card opens the existing tools and connections. Research watches run when requested and do not promise background notifications.

Existing workspace tokens, settings keys, stored records, and database identifiers retain their original internal names for compatibility with saved research. User-facing names and export metadata use scrapeTx.

## Validation

The production build, 159 existing tests, and server rendering across 15 routes passed after the rebrand. Browser-control access was disabled in Work settings during this change, so live visual and pointer-interaction testing could not be completed. Responsive styles and Reduced Motion handling were reviewed in source; the local preview remains available for visual review.
