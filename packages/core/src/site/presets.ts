import {
  siteContentSchema,
  SITE_CONTENT_VERSION,
  type Industry,
  type ProjectDetails,
  type SiteContent,
  type SitePage,
  type SiteSection,
  type ThemeId,
} from "@ibp/shared";

/**
 * Starting content per industry, in Portuguese (Portugal). Texts are honest placeholders the
 * owner replaces (or the AI rewrites from the description); contacts are clearly examples and
 * there are never invented prices, reviews or awards.
 */

export const INDUSTRY_THEMES: Record<Industry, ThemeId> = {
  restaurant: "terracotta",
  cafe: "espresso",
  "professional-services": "graphite",
  automotive: "workshop",
  construction: "concrete",
  healthcare: "clinic",
  retail: "boutique",
  corporate: "slate",
  other: "slate",
};

type Profile = {
  hero: { eyebrow: string; title: string; text: string; cta: string };
  about: string;
  servicesTitle: string;
  services: [string, string][];
  extra: (SiteSection | "menu-page")[];
  hours: { days: string; time: string }[];
};

const WEEKDAYS = [{ days: "Segunda a sexta", time: "9h00–18h00" }];

const PROFILES: Record<Industry, Profile> = {
  restaurant: {
    hero: {
      eyebrow: "Restaurante",
      title: "Cozinha feita com tempo",
      text: "Pratos da casa, produtos da época e uma mesa onde apetece ficar.",
      cta: "Reservar mesa",
    },
    about:
      "Conte aqui a história da casa: quem cozinha, de onde vêm os produtos e o que torna a vossa cozinha diferente.",
    servicesTitle: "O que oferecemos",
    services: [
      ["Almoço e jantar", "Indique os dias e o tipo de serviço."],
      ["Grupos e eventos", "Explique se recebem grupos, aniversários ou jantares de empresa."],
      ["Take-away", "Diga como os clientes podem encomendar para levar."],
    ],
    extra: ["menu-page"],
    hours: [
      { days: "Terça a sábado", time: "12h00–15h00 · 19h00–23h00" },
      { days: "Domingo", time: "12h00–15h30" },
    ],
  },
  cafe: {
    hero: {
      eyebrow: "Café e pastelaria",
      title: "O café do bairro",
      text: "Pequenos-almoços, pastelaria da casa e uma pausa a qualquer hora.",
      cta: "Como chegar",
    },
    about:
      "Conte quem está ao balcão, o que é feito na casa e o ambiente que os clientes vão encontrar.",
    servicesTitle: "No balcão",
    services: [
      ["Pequenos-almoços", "Descreva as opções da manhã."],
      ["Pastelaria da casa", "Fale do que é feito diariamente."],
      ["Encomendas", "Bolos de aniversário, salgados para festas ou outros pedidos."],
    ],
    extra: ["menu-page"],
    hours: [
      { days: "Segunda a sábado", time: "7h30–19h30" },
      { days: "Domingo", time: "8h00–13h00" },
    ],
  },
  "professional-services": {
    hero: {
      eyebrow: "Serviços profissionais",
      title: "Aconselhamento claro, do primeiro contacto ao resultado",
      text: "Explique numa frase como ajuda os seus clientes.",
      cta: "Pedir contacto",
    },
    about: "Apresente a equipa, a experiência e a forma de trabalhar com os clientes.",
    servicesTitle: "Áreas de trabalho",
    services: [
      ["Primeira área", "Descreva o serviço e para quem é."],
      ["Segunda área", "Explique o problema que resolve."],
      ["Acompanhamento", "Como acompanham o cliente depois do serviço."],
    ],
    extra: [],
    hours: WEEKDAYS,
  },
  automotive: {
    hero: {
      eyebrow: "Oficina",
      title: "Manutenção e reparação com orçamento antes de começar",
      text: "Revisões, diagnóstico e reparação para todas as marcas.",
      cta: "Marcar revisão",
    },
    about:
      "Conte há quanto tempo trabalham, que equipamento têm e como explicam cada reparação ao cliente.",
    servicesTitle: "Serviços",
    services: [
      ["Revisões", "Manutenção periódica segundo o plano do fabricante."],
      ["Diagnóstico", "Leitura de avarias e explicação clara do que é preciso."],
      ["Pneus e travões", "Substituição, alinhamento e verificação de segurança."],
      ["Preparação para inspeção", "Verificação antes da inspeção periódica."],
    ],
    extra: [],
    hours: [
      { days: "Segunda a sexta", time: "8h30–18h30" },
      { days: "Sábado", time: "9h00–13h00" },
    ],
  },
  construction: {
    hero: {
      eyebrow: "Construção e remodelação",
      title: "Obras bem planeadas, entregues como combinado",
      text: "Remodelações, construção e reabilitação com orçamento detalhado.",
      cta: "Pedir orçamento",
    },
    about: "Apresente a empresa, a equipa e o tipo de obras em que trabalham.",
    servicesTitle: "O que fazemos",
    services: [
      ["Remodelações", "Cozinhas, casas de banho e interiores completos."],
      ["Construção", "Moradias e ampliações, do projeto à entrega."],
      ["Reabilitação", "Recuperação de edifícios e fachadas."],
    ],
    extra: [
      { id: "obras", type: "gallery", title: "Obras recentes", images: [], navLabel: "Obras" },
    ],
    hours: WEEKDAYS,
  },
  healthcare: {
    hero: {
      eyebrow: "Clínica",
      title: "Cuidados de saúde perto de si",
      text: "Consultas e exames com marcação simples e atendimento atento.",
      cta: "Marcar consulta",
    },
    about: "Apresente a clínica, a equipa clínica e a forma como acompanham cada paciente.",
    servicesTitle: "Especialidades",
    services: [
      ["Medicina geral", "Consultas de rotina e acompanhamento."],
      ["Especialidade", "Indique as especialidades disponíveis."],
      ["Exames", "Que exames podem ser feitos na clínica."],
    ],
    extra: [],
    hours: [
      { days: "Segunda a sexta", time: "8h00–20h00" },
      { days: "Sábado", time: "9h00–13h00" },
    ],
  },
  retail: {
    hero: {
      eyebrow: "Loja",
      title: "Produtos escolhidos com cuidado",
      text: "Venha conhecer a loja ou fale connosco para encomendas.",
      cta: "Visitar a loja",
    },
    about: "Conte a história da loja, o que vendem e como escolhem os produtos.",
    servicesTitle: "Na loja",
    services: [
      ["Coleção", "Que produtos encontram os clientes."],
      ["Encomendas", "Como funcionam as encomendas e reservas."],
      ["Aconselhamento", "Ajuda personalizada na escolha."],
    ],
    extra: [],
    hours: [{ days: "Segunda a sábado", time: "10h00–19h00" }],
  },
  corporate: {
    hero: {
      eyebrow: "Empresa",
      title: "Soluções sérias para empresas exigentes",
      text: "Explique numa frase o que a empresa faz e para quem.",
      cta: "Falar connosco",
    },
    about: "Apresente a empresa, a história e os valores que orientam o trabalho.",
    servicesTitle: "O que fazemos",
    services: [
      ["Primeira área", "Descreva a área de negócio."],
      ["Segunda área", "Explique o valor para o cliente."],
      ["Terceira área", "Mantenha o texto curto e concreto."],
    ],
    extra: [],
    hours: WEEKDAYS,
  },
  other: {
    hero: {
      eyebrow: "",
      title: "Bem-vindo",
      text: "Conheça o que fazemos e fale connosco.",
      cta: "Contactar",
    },
    about: "Conte aqui a história do negócio, a equipa e o que o torna diferente.",
    servicesTitle: "Serviços",
    services: [
      ["Serviço principal", "Descreva o serviço mais procurado pelos clientes."],
      ["Segundo serviço", "Explique o benefício para o cliente em uma ou duas frases."],
      ["Terceiro serviço", "Mantenha o texto curto e concreto."],
    ],
    extra: [],
    hours: WEEKDAYS,
  },
};

const MENU_PAGE: SitePage = {
  slug: "menu",
  title: "Menu",
  navLabel: "Menu",
  description: "O menu da casa.",
  sections: [
    {
      id: "menu",
      type: "menu",
      title: "Menu",
      intro: "Substitua pelos pratos e preços reais. Os preços só aparecem quando os preencher.",
      groups: [
        {
          title: "Entradas",
          items: [{ name: "Entrada da casa", description: "Descreva o prato." }],
        },
        {
          title: "Pratos principais",
          items: [{ name: "Prato do dia", description: "Descreva o prato." }],
        },
        {
          title: "Sobremesas",
          items: [{ name: "Sobremesa caseira", description: "Descreva a sobremesa." }],
        },
      ],
    },
  ],
};

/** Content for a new project from its details. Always valid against the schema. */
export function presetContent(details: ProjectDetails): SiteContent {
  const profile = PROFILES[details.industry];
  const extraPages = profile.extra.includes("menu-page") ? [MENU_PAGE] : [];
  const extraSections = profile.extra.filter((s): s is SiteSection => s !== "menu-page");

  const content: SiteContent = {
    version: SITE_CONTENT_VERSION,
    theme: INDUSTRY_THEMES[details.industry],
    business: {
      name: details.name,
      client: details.client,
      tagline: profile.hero.text,
      description: details.description,
      phone: "+351 220 000 000",
      email: "geral@exemplo.pt",
      address: "Rua de Exemplo, 123, 4000-000 Porto",
      hours: profile.hours,
    },
    pages: [
      {
        slug: "",
        title: details.name,
        description: details.description || profile.hero.text,
        sections: [
          {
            id: "inicio",
            type: "hero",
            ...(profile.hero.eyebrow ? { eyebrow: profile.hero.eyebrow } : {}),
            title: profile.hero.title,
            text: details.description || profile.hero.text,
            cta: { label: profile.hero.cta, href: "#contactos" },
          },
          {
            id: "sobre",
            type: "about",
            title: "Sobre nós",
            text: profile.about,
            navLabel: "Sobre",
          },
          {
            id: "servicos",
            type: "services",
            title: profile.servicesTitle,
            items: profile.services.map(([title, text]) => ({ title, text })),
            navLabel: profile.servicesTitle,
          },
          ...extraSections,
          { id: "horario", type: "hours", title: "Horário" },
          { id: "contactos", type: "contact", title: "Contactos", navLabel: "Contactos" },
        ],
      },
      ...extraPages,
    ],
  };
  return siteContentSchema.parse(content);
}
