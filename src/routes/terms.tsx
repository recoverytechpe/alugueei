import { createFileRoute, Link } from "@tanstack/react-router";

export const TERMS_VERSION = "2026-06-27";

export const Route = createFileRoute("/terms")({
  head: () => ({
    meta: [
      { title: "Termos de Uso | Alugueei" },
      { name: "description", content: "Termos de Uso da plataforma Alugueei." },
    ],
  }),
  component: TermsPage,
});

function TermsPage() {
  return (
    <div className="max-w-3xl mx-auto p-6 prose prose-sm sm:prose-base dark:prose-invert">
      <h1>Termos de Uso</h1>
      <p className="text-sm text-muted-foreground">Versão {TERMS_VERSION}</p>

      <h2>1. Objeto</h2>
      <p>
        A Alugueei é um marketplace que conecta proprietários, locatários e agentes de localização
        para facilitar a negociação e celebração de contratos de locação de imóveis.
      </p>

      <h2>2. Cadastro</h2>
      <p>
        O usuário declara que as informações fornecidas são verdadeiras e se responsabiliza por
        mantê-las atualizadas. É vedado o cadastro por menores de 18 anos.
      </p>

      <h2>3. Condutas proibidas</h2>
      <ul>
        <li>Compartilhar contatos diretos no chat para burlar a plataforma;</li>
        <li>Anunciar imóveis sem autorização do proprietário;</li>
        <li>Praticar discriminação de qualquer natureza;</li>
        <li>Utilizar a plataforma para fins ilícitos.</li>
      </ul>

      <h2>4. Pagamentos e comissões</h2>
      <p>
        Taxas de desbloqueio e comissões de agentes (5% sobre o aluguel) são informadas previamente
        em cada operação. Reembolsos seguem a política específica de cada transação.
      </p>

      <h2>5. Limitação de responsabilidade</h2>
      <p>
        A Alugueei atua como intermediadora. A relação locatícia é estabelecida diretamente entre
        as partes, que respondem por suas obrigações contratuais.
      </p>

      <h2>6. Alterações</h2>
      <p>
        Estes Termos podem ser atualizados. A continuidade do uso após a publicação de nova versão
        implica em concordância.
      </p>

      <p className="text-sm text-muted-foreground mt-8">
        Veja também a <Link to="/privacy" className="underline">Política de Privacidade</Link>.
      </p>
    </div>
  );
}
