// Copia a lógica do robô (site/painel/robo.js) para o webhook do WhatsApp.
// Rode depois de mudar o robo.js:  node scripts/sincronizar-robo.mjs
import { readFileSync, writeFileSync } from 'node:fs';
const raiz = new URL('..', import.meta.url);
const fonte = readFileSync(new URL('site/painel/robo.js', raiz), 'utf8');
const bloco = fonte.slice(fonte.indexOf('// <robo>'), fonte.indexOf('// </robo>') + '// </robo>'.length);
const alvoUrl = new URL('supabase/functions/whatsapp-webhook/index.ts', raiz);
const alvo = readFileSync(alvoUrl, 'utf8');
const i = alvo.indexOf('// <robo>'), j = alvo.indexOf('// </robo>');
if (i < 0 || j < 0) throw new Error('marcadores <robo> não encontrados no webhook');
writeFileSync(alvoUrl, alvo.slice(0, i) + bloco + alvo.slice(j + '// </robo>'.length));
console.log('robô sincronizado no webhook');
