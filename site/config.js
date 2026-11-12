// Configuração compartilhada pelo site e pelo painel.
// Depois de criar o projeto no Supabase, cole aqui (Project Settings > API):
//   SUPABASE_URL      -> "Project URL"
//   SUPABASE_ANON_KEY -> chave "anon public" (pode ficar no site; a segurança é feita pelas regras do banco)
// Enquanto estiver vazio, o painel roda em MODO DEMONSTRAÇÃO e o site manda os pedidos pelo WhatsApp.
window.PF_CONFIG = {
  SUPABASE_URL: 'https://ywlnsaypcghizwyhaual.supabase.co',
  SUPABASE_ANON_KEY: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inl3bG5zYXlwY2doaXp3eWhhdWFsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTQ0MjIwNzgsImV4cCI6MjEwOTk5ODA3OH0.rD8ZAHchKudQjxTAOohOv1g84rCE83l0MRoutzEFBJE',
  WHATSAPP: '5521987708652',

  // WhatsApp dentro do painel. WA_PROVEDOR: 'evolution' (WhatsApp Web no servidor, conecta por QR code) ou 'meta' (API oficial)
  WA_ATIVO: true,
  WA_PROVEDOR: 'evolution',
  // Modelo aprovado na Meta para retomar conversa depois de 24h sem resposta do cliente
  WA_TEMPLATE: 'retomar_contato',
  WA_TEMPLATE_IDIOMA: 'pt_BR',

  // Rastreamento de anúncios. Com o Supabase ligado, isto é configurado no painel (Tráfego pago > Ativação)
  // e o que estiver aqui é ignorado. Sem Supabase, preencha aqui e mude ativo para true.
  RASTREAMENTO: {
    // reserva: usado só se o site não conseguir ler os códigos do painel
    ativo: true,
    ga4_id: '',          // G-XXXXXXXXXX
    gads_id: 'AW-18571249053',
    gads_label: 'nKNJCPbyiLcdEJ2Lu5dF', // conversão "Lead do site"
    meta_pixel_id: '',   // 15 a 16 dígitos
    valor_lead: 250      // valor estimado de cada lead, em R$
  }
};
