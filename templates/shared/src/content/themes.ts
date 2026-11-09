import type { ThemeId } from "./types";

// Curated palettes and type pairings. site.json picks one by id; edit the values here to fine-tune.
export interface Theme {
  label: string;
  colors: {
    brand: string;
    brandContrast: string;
    ink: string;
    soft: string;
    paper: string;
    surface: string;
    line: string;
  };
  fonts: { display: string; sans: string };
  /** Google Fonts stylesheet for the two families. */
  fontsHref: string;
}

const google = (...families: string[]) =>
  `https://fonts.googleapis.com/css2?${families.map((f) => `family=${f}`).join("&")}&display=swap`;

export const THEMES: Record<ThemeId, Theme> = {
  terracotta: {
    label: "Terracota",
    colors: {
      brand: "#a4482a",
      brandContrast: "#ffffff",
      ink: "#2a201b",
      soft: "#6b5d55",
      paper: "#fbf7f2",
      surface: "#f3ebe1",
      line: "#e6dbcf",
    },
    fonts: {
      display: '"Fraunces", Georgia, serif',
      sans: '"Source Sans 3", system-ui, sans-serif',
    },
    fontsHref: google("Fraunces:opsz,wght@9..144,400;9..144,600", "Source+Sans+3:wght@400;600"),
  },
  espresso: {
    label: "Espresso",
    colors: {
      brand: "#5b3a24",
      brandContrast: "#fffaf3",
      ink: "#2b211b",
      soft: "#6e6157",
      paper: "#faf6f0",
      surface: "#f1e8dc",
      line: "#e5d9ca",
    },
    fonts: {
      display: '"DM Serif Display", Georgia, serif',
      sans: '"DM Sans", system-ui, sans-serif',
    },
    fontsHref: google("DM+Serif+Display", "DM+Sans:wght@400;600"),
  },
  graphite: {
    label: "Grafite",
    colors: {
      brand: "#1f3a5f",
      brandContrast: "#ffffff",
      ink: "#1b2129",
      soft: "#56606c",
      paper: "#f8f9fa",
      surface: "#eef1f4",
      line: "#dfe3e8",
    },
    fonts: {
      display: '"Libre Baskerville", Georgia, serif',
      sans: '"IBM Plex Sans", system-ui, sans-serif',
    },
    fontsHref: google("Libre+Baskerville:wght@400;700", "IBM+Plex+Sans:wght@400;600"),
  },
  workshop: {
    label: "Oficina",
    colors: {
      brand: "#c2410c",
      brandContrast: "#ffffff",
      ink: "#1c1d1f",
      soft: "#5a5d61",
      paper: "#f5f5f3",
      surface: "#e9e9e6",
      line: "#d9d9d5",
    },
    fonts: {
      display: '"Barlow Condensed", system-ui, sans-serif',
      sans: '"Barlow", system-ui, sans-serif',
    },
    fontsHref: google("Barlow+Condensed:wght@600;700", "Barlow:wght@400;600"),
  },
  concrete: {
    label: "Betão",
    colors: {
      brand: "#9a6b12",
      brandContrast: "#ffffff",
      ink: "#1f2326",
      soft: "#5c6266",
      paper: "#f6f5f2",
      surface: "#eceae4",
      line: "#dcd9d1",
    },
    fonts: {
      display: '"Archivo Narrow", system-ui, sans-serif',
      sans: '"Archivo", system-ui, sans-serif',
    },
    fontsHref: google("Archivo+Narrow:wght@600;700", "Archivo:wght@400;600"),
  },
  clinic: {
    label: "Clínica",
    colors: {
      brand: "#0f6b63",
      brandContrast: "#ffffff",
      ink: "#16302d",
      soft: "#52645f",
      paper: "#f6faf9",
      surface: "#e9f2f0",
      line: "#d6e4e1",
    },
    fonts: {
      display: '"Source Serif 4", Georgia, serif',
      sans: '"Nunito Sans", system-ui, sans-serif',
    },
    fontsHref: google("Source+Serif+4:opsz,wght@8..60,500;8..60,600", "Nunito+Sans:wght@400;600"),
  },
  boutique: {
    label: "Boutique",
    colors: {
      brand: "#6d2a46",
      brandContrast: "#ffffff",
      ink: "#261c20",
      soft: "#6a5c62",
      paper: "#fbf8f6",
      surface: "#f2eaec",
      line: "#e5dade",
    },
    fonts: {
      display: '"Playfair Display", Georgia, serif',
      sans: '"Work Sans", system-ui, sans-serif',
    },
    fontsHref: google("Playfair+Display:wght@500;700", "Work+Sans:wght@400;600"),
  },
  slate: {
    label: "Ardósia",
    colors: {
      brand: "#2d4a6b",
      brandContrast: "#ffffff",
      ink: "#1d2228",
      soft: "#5a636d",
      paper: "#fafafa",
      surface: "#eff1f3",
      line: "#e0e3e7",
    },
    fonts: {
      display: '"Manrope", system-ui, sans-serif',
      sans: '"Manrope", system-ui, sans-serif',
    },
    fontsHref: google("Manrope:wght@400;600;700"),
  },
};

/** CSS custom properties consumed by the @theme tokens in index.css. */
export function themeVars(id: ThemeId): Record<string, string> {
  const { colors, fonts } = THEMES[id] ?? THEMES.slate;
  return {
    "--ibp-brand": colors.brand,
    "--ibp-brand-contrast": colors.brandContrast,
    "--ibp-ink": colors.ink,
    "--ibp-soft": colors.soft,
    "--ibp-paper": colors.paper,
    "--ibp-surface": colors.surface,
    "--ibp-line": colors.line,
    "--ibp-font-display": fonts.display,
    "--ibp-font-sans": fonts.sans,
  };
}
