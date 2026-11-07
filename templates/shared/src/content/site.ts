// All website text lives here, so it can be edited without touching the layout components.
// IBP fills the first values when the project is created.

export const site = {
  name: "__IBP_SITE_NAME__",
  client: "__IBP_CLIENT__",
  industry: "__IBP_INDUSTRY__",
  description: "__IBP_DESCRIPTION__",
  hero: {
    title: "Bem-vindo",
    subtitle: "Conheça o que fazemos e fale connosco.",
    cta: "Contactar",
  },
  about: {
    title: "Sobre nós",
    text: "Conte aqui a história do negócio, a equipa e o que o torna diferente.",
  },
  services: {
    title: "Serviços",
    items: [
      { title: "Serviço principal", text: "Descreva o serviço mais procurado pelos clientes." },
      {
        title: "Segundo serviço",
        text: "Explique o benefício para o cliente em uma ou duas frases.",
      },
      { title: "Terceiro serviço", text: "Mantenha o texto curto e concreto." },
    ],
  },
  contact: {
    title: "Contactos",
    address: "Rua de Exemplo, 123, 4000-000 Porto",
    phone: "+351 220 000 000",
    email: "geral@exemplo.pt",
    hours: "Segunda a sexta, 9h–18h",
  },
  nav: [
    { label: "Sobre", href: "#sobre" },
    { label: "Serviços", href: "#servicos" },
    { label: "Contactos", href: "#contactos" },
  ],
};
