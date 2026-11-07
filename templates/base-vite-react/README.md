# Website

Created with IBP (Intent Based Programming). React + TypeScript + Vite + Tailwind CSS.

```bash
npm install
npm run dev
```

- Text and contacts: `src/content/site.ts`
- Colours and fonts: `src/index.css` (`@theme` block)
- Sections: `src/components/` — each root element has a `data-editor-id` used by the IBP visual editor.
- Production build: `npm run build` (output in `dist/`).
