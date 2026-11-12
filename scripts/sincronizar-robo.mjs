// Copia o código compartilhado do painel para as funções do Supabase:
//   site/painel/robo.js         (bloco <robo>)         -> supabase/functions/whatsapp-webhook/index.ts
//   site/painel/monitor-ads.js  (bloco <monitor-ads>)  -> supabase/functions/alertas/index.ts
// Rode depois de mudar robo.js ou monitor-ads.js:  node scripts/sincronizar-robo.mjs
import { readFileSync, writeFileSync } from 'node:fs';
const raiz = new URL('..', import.meta.url);
function copiar(origem, destino, tag) {
  const ini = `// <${tag}>`, fim = `// </${tag}>`;
  const fonte = readFileSync(new URL(origem, raiz), 'utf8');
  const a = fonte.indexOf(ini), b = fonte.indexOf(fim);
  if (a < 0 || b < 0) throw new Error(`marcadores <${tag}> não encontrados em ${origem}`);
  const bloco = fonte.slice(a, b + fim.length);
  const alvoUrl = new URL(destino, raiz), alvo = readFileSync(alvoUrl, 'utf8');
  const i = alvo.indexOf(ini), j = alvo.indexOf(fim);
  if (i < 0 || j < 0) throw new Error(`marcadores <${tag}> não encontrados em ${destino}`);
  writeFileSync(alvoUrl, alvo.slice(0, i) + bloco + alvo.slice(j + fim.length));
  console.log(`${tag}: ${origem} -> ${destino}`);
}
copiar('site/painel/robo.js', 'supabase/functions/whatsapp-webhook/index.ts', 'robo');
copiar('site/painel/monitor-ads.js', 'supabase/functions/alertas/index.ts', 'monitor-ads');
