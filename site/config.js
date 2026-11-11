// Configuração compartilhada pelo site e pelo painel.
// Depois de criar o projeto no Supabase, cole aqui (Project Settings > API):
//   SUPABASE_URL      -> "Project URL"
//   SUPABASE_ANON_KEY -> chave "anon public" (pode ficar no site; a segurança é feita pelas regras do banco)
// Enquanto estiver vazio, o painel roda em MODO DEMONSTRAÇÃO e o site manda os pedidos pelo WhatsApp.
window.PF_CONFIG = {
  SUPABASE_URL: 'https://ywlnsaypcghizwyhaual.supabase.co',
  SUPABASE_ANON_KEY: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inl3bG5zYXlwY2doaXp3eWhhdWFsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTQ0MjIwNzgsImV4cCI6MjEwOTk5ODA3OH0.rD8ZAHchKudQjxTAOohOv1g84rCE83l0MRoutzEFBJE',
  WHATSAPP: '5521987708652',

  // WhatsApp dentro do painel (API oficial da Meta). Mude para true depois de seguir o passo 5 do COMO_ATIVAR.md
  WA_ATIVO: false,
  // Modelo aprovado na Meta para retomar conversa depois de 24h sem resposta do cliente
  WA_TEMPLATE: 'retomar_contato',
  WA_TEMPLATE_IDIOMA: 'pt_BR',

  // Rastreamento de anúncios. Com o Supabase ligado, isto é configurado no painel (Tráfego pago > Ativação)
  // e o que estiver aqui é ignorado. Sem Supabase, preencha aqui e mude ativo para true.
  RASTREAMENTO: {
    ativo: false,
    ga4_id: '',          // G-XXXXXXXXXX
    gads_id: '',         // AW-1234567890
    gads_label: '',      // rótulo da conversão "Lead", ex.: AbCdEfGhIjKlMnOp
    meta_pixel_id: '',   // 15 a 16 dígitos
    valor_lead: 150      // valor estimado de cada lead, em R$
  }
};
