import { createFileRoute, Link } from "@tanstack/react-router";

export const PRIVACY_VERSION = "2026-06-27";

export const Route = createFileRoute("/privacy")({
  head: () => ({
    meta: [
      { title: "Política de Privacidade | Alugueei" },
      { name: "description", content: "Como tratamos seus dados pessoais (LGPD)." },
    ],
  }),
  component: PrivacyPage,
});

function PrivacyPage() {
  return (
    <div className="max-w-3xl mx-auto p-6 prose prose-sm sm:prose-base dark:prose-invert">
      <h1>Política de Privacidade</h1>
      <p className="text-sm text-muted-foreground">Versão {PRIVACY_VERSION} — conformidade com a LGPD (Lei 13.709/2018)</p>

      <h2>1. Dados que coletamos</h2>
      <ul>
        <li><strong>Cadastrais:</strong> nome, e-mail, telefone, CPF/CNPJ;</li>
        <li><strong>De uso:</strong> imóveis visualizados, mensagens, propostas e contratos;</li>
        <li><strong>Técnicos:</strong> IP, dispositivo, cookies essenciais.</li>
      </ul>

      <h2>2. Finalidade do tratamento</h2>
      <ul>
        <li>Operar a plataforma (autenticação, busca, chat, contratos);</li>
        <li>Cumprir obrigações legais e regulatórias;</li>
        <li>Prevenção a fraudes e segurança;</li>
        <li>Comunicações transacionais e notificações.</li>
      </ul>

      <h2>3. Compartilhamento</h2>
      <p>
        Compartilhamos dados estritamente necessários com: contraparte da negociação (proprietário,
        locatário, agente), processadores de pagamento (Mercado Pago) e provedores de infraestrutura.
      </p>

      <h2>4. Seus direitos (LGPD)</h2>
      <p>
        Você pode solicitar a qualquer momento: confirmação de tratamento, acesso, correção,
        anonimização, portabilidade, eliminação dos dados e revogação do consentimento.
        Solicite pelo e-mail <strong>privacidade@alugueei.com.br</strong>.
      </p>

      <h2>5. Retenção</h2>
      <p>
        Dados de cadastro são mantidos enquanto a conta estiver ativa. Dados contratuais ficam
        retidos pelo prazo legal mínimo (5 anos) após o término do contrato.
      </p>

      <h2>6. Segurança</h2>
      <p>
        Adotamos criptografia em trânsito (HTTPS/TLS), controle de acesso por linha (RLS) e
        autenticação segura.
      </p>

      <p className="text-sm text-muted-foreground mt-8">
        Veja também os <Link to="/terms" className="underline">Termos de Uso</Link>.
      </p>
    </div>
  );
}
