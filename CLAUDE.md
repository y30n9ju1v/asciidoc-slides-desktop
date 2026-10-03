# AsciiDoc Slides

Development, refactoring, and review must follow [DESIGN_GUIDELINES.md](./DESIGN_GUIDELINES.md), adapted from the sibling AsciiDoc Pages project. Preserve the layout rules below when fixing behavior.

## UI layout is locked

The owner is very happy with the current UI and asked that it not be changed. Do not rearrange,
restyle, or remove these regions without an explicit request from the owner:

- **Header toolbar** (`src/components/Layout/AppHeader.tsx`): logo, file-tree toggle, New / Open /
  Save icon buttons, file name with unsaved dot and slide count, then on the right the style and
  theme selects, Export dropdown, Present button, light/dark toggle, editor text size (− / +), and editor settings.
- **Workspace** (`src/App.tsx`): collapsible file tree (the deck's folder), Monaco editor,
  draggable resizer, slide preview on the right.
- **Preview** (`src/components/Slides/SlidePreview.tsx`): large 16:9 slide stage, a small
  notes/warnings strip under it, and a horizontal thumbnail filmstrip at the bottom.

Bug fixes and controls the owner explicitly asks for are fine, but fit them into this structure
(for example, another select next to the existing ones) instead of reorganizing it.

## Architecture

- AsciiDoc → `parseSlideDeck` (`src/services/slideDeckService.ts`) → `SlideDeck`, whose slide bodies
  reuse the SafeDocument block model from the `packages/asciidoc-typst` git submodule.
- One `SlideDeck` feeds three renderers that must stay visually consistent: the React preview
  (`src/components/Slides`), PPTX (`src/services/pptxLayout.ts`, `pptxExporter.ts`), and native PDF
  (`src-tauri/src/slide_writer.rs` → Typst).
- The WebView sends Rust data only, never Typst source. Keep `src-tauri/src/slide_deck.rs` in sync
  with `src/services/slideDeck.ts`.
