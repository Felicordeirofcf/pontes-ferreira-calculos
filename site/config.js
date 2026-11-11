// Configuração compartilhada pelo site e pelo painel.
// Depois de criar o projeto no Supabase, cole aqui (Project Settings > API):
//   SUPABASE_URL      -> "Project URL"
//   SUPABASE_ANON_KEY -> chave "anon public" (pode ficar no site; a segurança é feita pelas regras do banco)
// Enquanto estiver vazio, o painel roda em MODO DEMONSTRAÇÃO e o site manda os pedidos pelo WhatsApp.
window.PF_CONFIG = {
  SUPABASE_URL: '',
  SUPABASE_ANON_KEY: '',
  WHATSAPP: '5521987708652',

  // WhatsApp dentro do painel (API oficial da Meta). Mude para true depois de seguir o passo 5 do COMO_ATIVAR.md
  WA_ATIVO: false,
  // Modelo aprovado na Meta para retomar conversa depois de 24h sem resposta do cliente
  WA_TEMPLATE: 'retomar_contato',
  WA_TEMPLATE_IDIOMA: 'pt_BR'
};
