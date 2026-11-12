#!/usr/bin/env python3
"""Gera as páginas para o Google (SEO): serviços, cidades e 'Atendemos todo o Brasil'.
Rode da raiz do repositório:  python3 scripts/gerar-paginas.py
Saída: site/<slug>/index.html, site/paginas.css e o sitemap.xml atualizado.
Para mudar um texto, edite os dados abaixo e rode de novo (as páginas são recriadas)."""
import html, json, os, re, datetime

RAIZ = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'site')
SITE = 'https://pontesferreiracalculos.com'
WA = '5521987708652'
HOJE = datetime.date.today().isoformat()
e = html.escape

TRT = {  # região: (sede, área)
    1: ('Rio de Janeiro', 'estado do Rio de Janeiro'), 2: ('São Paulo', 'capital, Grande São Paulo e Baixada Santista'),
    3: ('Belo Horizonte', 'Minas Gerais'), 4: ('Porto Alegre', 'Rio Grande do Sul'), 5: ('Salvador', 'Bahia'),
    6: ('Recife', 'Pernambuco'), 7: ('Fortaleza', 'Ceará'), 8: ('Belém', 'Pará e Amapá'), 9: ('Curitiba', 'Paraná'),
    10: ('Brasília', 'Distrito Federal e Tocantins'), 11: ('Manaus', 'Amazonas e Roraima'), 12: ('Florianópolis', 'Santa Catarina'),
    13: ('João Pessoa', 'Paraíba'), 14: ('Porto Velho', 'Rondônia e Acre'), 15: ('Campinas', 'interior e litoral norte de São Paulo'),
    16: ('São Luís', 'Maranhão'), 17: ('Vitória', 'Espírito Santo'), 18: ('Goiânia', 'Goiás'), 19: ('Maceió', 'Alagoas'),
    20: ('Aracaju', 'Sergipe'), 21: ('Natal', 'Rio Grande do Norte'), 22: ('Teresina', 'Piauí'), 23: ('Cuiabá', 'Mato Grosso'),
    24: ('Campo Grande', 'Mato Grosso do Sul'),
}

SERVICOS = [
    dict(slug='calculo-de-liquidacao-trabalhista', curto='Liquidação de sentença',
         titulo='Cálculo de liquidação trabalhista no PJe-Calc',
         h1='Cálculo de <em>liquidação de sentença</em> trabalhista, pronto no PJe-Calc',
         desc='Cálculo de liquidação trabalhista no PJe-Calc (1º cálculo por R$ 200): leitura de sentença, acórdão e embargos, entrega do .PJC e relatório em até 48h.',
         intro='Intimado para apresentar os cálculos de liquidação? Lemos a sentença, o acórdão e os embargos, aplicamos exatamente o que foi deferido e entregamos a conta pronta no PJe-Calc, com o arquivo .PJC para você importar, conferir e juntar.',
         itens=['Leitura de todas as decisões: sentença, acórdão, embargos e decisões de execução',
                'Parâmetros do título: prescrição, termo inicial, base de cálculo, reflexos e divisor',
                'Correção e juros pelos critérios do STF (ADC 58) e da Lei 14.905/2024, conforme o título',
                'Contribuição previdenciária e imposto de renda calculados',
                'Arquivo .PJC, relatório em PDF e resumo do que foi deferido'],
         faq=[('Quanto tempo tenho para apresentar a liquidação?', 'O prazo é o que o juízo fixar na intimação. Por isso entregamos em até 48h (ou 24h no urgente), para sobrar tempo de você conferir antes de protocolar.'),
              ('Vocês fazem a conta do reclamante e da reclamada?', 'Sim. Fazemos a conta da parte que você representa, seguindo estritamente o título executivo.'),
              ('Preciso mandar fichas financeiras e cartões de ponto?', 'Se estiverem nos autos, já usamos. Se não estiverem, avisamos o que falta antes de começar.'),
              ('E se o juízo mandar retificar?', 'A primeira retificação decorrente do próprio cálculo é sem custo.')]),
    dict(slug='impugnacao-de-calculos-trabalhistas', curto='Impugnação aos cálculos',
         titulo='Impugnação aos cálculos trabalhistas',
         h1='<em>Impugnação aos cálculos</em> do reclamante, do perito ou do contador',
         desc='Revisamos a conta da parte contrária ou do perito no PJe-Calc e apontamos as divergências com o valor correto. 1º cálculo por R$ 200, entrega em até 48h.',
         intro='Recebeu a conta da outra parte ou do perito e precisa impugnar no prazo? Refazemos o cálculo pelo título executivo, comparamos item a item e mostramos onde está a diferença, com valores, para você fundamentar a impugnação.',
         itens=['Conferência item a item com o que foi deferido no título',
                'Quadro comparativo: valor apresentado × valor correto, por verba',
                'Erros mais comuns verificados: índices, juros, reflexos em cascata, prescrição e base de cálculo',
                'Cálculo correto no PJe-Calc (.PJC) para juntar com a impugnação',
                'Resumo dos pontos impugnados, em linguagem que vai direto para a peça'],
         faq=[('Qual o prazo para impugnar os cálculos?', 'Em regra, o juízo abre prazo comum de 8 dias para impugnação fundamentada (art. 879, §2º, da CLT). Confira sempre o prazo fixado no seu processo.'),
              ('Vocês redigem a impugnação?', 'Entregamos o cálculo correto e o resumo técnico das divergências, pronto para você usar na peça.'),
              ('Dá para impugnar a conta do perito judicial?', 'Sim. Revisamos laudos contábeis e apontamos os parâmetros aplicados em desacordo com o título.'),
              ('E se a diferença for pequena?', 'Avisamos antes. Se não compensar impugnar, você fica sabendo e decide.')]),
    dict(slug='calculo-para-peticao-inicial-trabalhista', curto='Cálculo da inicial',
         titulo='Cálculo para petição inicial trabalhista',
         h1='Cálculo dos pedidos da <em>petição inicial</em> trabalhista',
         desc='Liquidação dos pedidos da inicial trabalhista com valor de cada pedido e reflexos, para atender o art. 840, §1º, da CLT. 1º cálculo por R$ 200, em até 48h.',
         intro='Desde a Reforma Trabalhista, cada pedido precisa vir com a indicação do valor (art. 840, §1º, da CLT). Calculamos os pedidos com base nos documentos do cliente e entregamos a tabela pronta para a inicial.',
         itens=['Valor de cada pedido e dos reflexos, separadamente',
                'Uso dos documentos do cliente: TRCT, holerites, CTPS, extrato do FGTS e cartões de ponto',
                'Estimativas fundamentadas quando faltar documento, com a premissa indicada',
                'Valor da causa somado e conferido',
                'Planilha e memória de cálculo para juntar'],
         faq=[('Preciso de todos os documentos?', 'Não. Com o que houver (TRCT, holerites, CTPS), fazemos a estimativa e indicamos as premissas usadas em cada pedido.'),
              ('Os valores da inicial limitam a condenação?', 'O tema tem entendimentos diferentes nos tribunais. Por isso indicamos que os valores são estimativos e mostramos a memória de cálculo.'),
              ('Atendem pedidos de horas extras e adicionais?', 'Sim: horas extras, intervalos, adicionais de insalubridade, periculosidade e noturno, verbas rescisórias, FGTS e multas.'),
              ('Quanto tempo leva?', 'Até 48h na maioria dos casos. Para ação plúrima ou muitos pedidos, combinamos o prazo antes.')]),
    dict(slug='atualizacao-de-calculo-trabalhista', curto='Atualização de cálculo',
         titulo='Atualização de cálculo trabalhista',
         h1='<em>Atualização</em> de cálculo trabalhista até a data do pagamento',
         desc='Atualizamos cálculos trabalhistas com os índices e juros vigentes (ADC 58 e Lei 14.905/2024) até a data que você precisar. 1º cálculo por R$ 200.',
         intro='Conta homologada há meses e precisa do valor atualizado para acordo, depósito ou penhora? Atualizamos o cálculo no PJe-Calc até a data informada, com os critérios de correção e juros do título.',
         itens=['Correção e juros conforme o título e a legislação vigente em cada período',
                'Abatimento de depósitos e pagamentos já feitos',
                'Contribuição previdenciária e imposto de renda atualizados',
                'Valor líquido e bruto na data pedida',
                'Arquivo .PJC e relatório em PDF'],
         faq=[('Quais índices vocês usam?', 'Os definidos no título. Na ausência, os critérios fixados pelo STF na ADC 58 e, para o período a partir de 30/08/2024, os da Lei 14.905/2024.'),
              ('Dá para atualizar para uma data futura?', 'Sim, para simular um acordo ou depósito em data definida.'),
              ('Abatem os depósitos recursais?', 'Sim. Informe os depósitos e pagamentos, ou deixamos indicado o que consta nos autos.'),
              ('Quanto custa?', '1º cálculo por R$ 200; depois, a partir de R$ 250. Casos com muitos pagamentos parciais são orçados antes.')]),
    dict(slug='calculista-trabalhista-pje-calc', curto='Calculista PJe-Calc',
         titulo='Calculista trabalhista PJe-Calc para escritórios',
         h1='Seu <em>calculista trabalhista</em> no PJe-Calc, sem contratar ninguém',
         desc='Calculista trabalhista para escritórios de advocacia: cálculos no PJe-Calc sob demanda, 1º cálculo por R$ 200, com entrega em até 48h e atendimento pelo WhatsApp.',
         intro='Ter um calculista na equipe custa caro e fica ocioso entre um prazo e outro. Com a Pontes Ferreira, o escritório tem cálculos no PJe-Calc sob demanda: manda o processo quando precisa e paga só pelo que usa.',
         itens=['Liquidação, impugnação, cálculo da inicial e atualização',
                'Atendimento pelo WhatsApp, sem reunião',
                'Pacote mensal para escritórios com volume, com prioridade na fila',
                'Relação mensal dos cálculos entregues',
                'Processos de todos os TRTs do país'],
         faq=[('Vocês atendem escritórios de outros estados?', 'Sim. Todo o trabalho é online, para processos de qualquer TRT.'),
              ('Existe contrato mínimo?', 'Não. Você pode pedir cálculos avulsos. O pacote mensal é opcional.'),
              ('Como fica o sigilo?', 'Os arquivos são usados só para o cálculo e tratados conforme a LGPD. Podemos assinar termo de confidencialidade.'),
              ('Como pago?', 'Combinamos no orçamento. O valor é fechado antes de começar.')]),
]

CIDADES = [  # cidade, UF, região do TRT, slug, municípios próximos atendidos
    ('São Paulo', 'SP', 2, 'sao-paulo', 'Guarulhos, Osasco, Santo André, São Bernardo do Campo e Santos'),
    ('Rio de Janeiro', 'RJ', 1, 'rio-de-janeiro', 'Niterói, Duque de Caxias, Nova Iguaçu, São Gonçalo e Petrópolis'),
    ('Belo Horizonte', 'MG', 3, 'belo-horizonte', 'Contagem, Betim, Nova Lima e toda a Grande BH'),
    ('Porto Alegre', 'RS', 4, 'porto-alegre', 'Canoas, Novo Hamburgo, Caxias do Sul e Pelotas'),
    ('Curitiba', 'PR', 9, 'curitiba', 'São José dos Pinhais, Londrina, Maringá e Ponta Grossa'),
    ('Salvador', 'BA', 5, 'salvador', 'Lauro de Freitas, Camaçari, Feira de Santana e Vitória da Conquista'),
    ('Recife', 'PE', 6, 'recife', 'Olinda, Jaboatão dos Guararapes, Caruaru e Petrolina'),
    ('Brasília', 'DF', 10, 'brasilia', 'Taguatinga, Ceilândia, Gama e Palmas (TO)'),
    ('Florianópolis', 'SC', 12, 'florianopolis', 'São José, Joinville, Blumenau e Itajaí'),
    ('Goiânia', 'GO', 18, 'goiania', 'Aparecida de Goiânia, Anápolis e Rio Verde'),
    ('Fortaleza', 'CE', 7, 'fortaleza', 'Caucaia, Maracanaú, Juazeiro do Norte e Sobral'),
    ('Campinas', 'SP', 15, 'campinas', 'Jundiaí, Sorocaba, Ribeirão Preto, São José dos Campos e Piracicaba'),
    ('Niterói', 'RJ', 1, 'niteroi', 'São Gonçalo, Maricá, Itaboraí e Região dos Lagos'),
    ('Vitória', 'ES', 17, 'vitoria', 'Vila Velha, Serra, Cariacica e Cachoeiro de Itapemirim'),
    ('Belém', 'PA', 8, 'belem', 'Ananindeua, Marabá, Santarém e Macapá (AP)'),
]

CSS = """:root{--ink:#0f1b2d;--ink-2:#3a4a60;--paper:#f6f4ef;--white:#fff;--brand:#0d3b66;--accent:#e0a526;--ok:#1f8a5b;--line:#dcd7cc;--radius:14px}
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;color:var(--ink);background:var(--paper);line-height:1.65}
a{color:inherit}
.wrap{max-width:1040px;margin:0 auto;padding:0 22px}
.eyebrow{font-size:.8rem;letter-spacing:.14em;text-transform:uppercase;color:var(--accent);font-weight:700}
h1,h2,h3{font-family:Georgia,serif;line-height:1.2}
h2{font-size:clamp(1.4rem,3vw,2rem);margin:8px 0 16px}
.btn{display:inline-flex;align-items:center;gap:10px;background:var(--accent);color:var(--ink);font-weight:700;padding:14px 22px;border-radius:12px;text-decoration:none;box-shadow:0 6px 18px rgba(224,165,38,.35)}
.btn.ghost{background:transparent;color:#fff;border:2px solid rgba(255,255,255,.5);box-shadow:none}
.btn.wa{background:#1f8a5b;color:#fff;box-shadow:0 6px 18px rgba(31,138,91,.3)}
header{background:var(--ink);color:#fff;position:sticky;top:0;z-index:20}
header .wrap{display:flex;justify-content:space-between;align-items:center;height:64px;gap:14px}
.logo{font-family:Georgia,serif;font-size:1.15rem;font-weight:700;text-decoration:none}.logo span{color:var(--accent)}
header nav{display:flex;gap:18px;font-size:.92rem}header nav a{text-decoration:none;opacity:.85}header nav a:hover{opacity:1}
.migalha{font-size:.85rem;opacity:.75;margin-bottom:10px}.migalha a{text-decoration:none}
.hero{background:linear-gradient(160deg,#0f1b2d 0%,#0d3b66 100%);color:#fff;padding:60px 0 54px}
.hero h1{font-size:clamp(1.8rem,4vw,2.8rem);margin:8px 0 14px;max-width:820px}.hero h1 em{color:var(--accent);font-style:normal}
.hero p{font-size:1.1rem;opacity:.92;max-width:700px;margin-bottom:24px}
.ctas{display:flex;gap:14px;flex-wrap:wrap}
.fatos{display:flex;gap:30px;margin-top:30px;flex-wrap:wrap}.fatos b{display:block;font-size:1.45rem;color:var(--accent);font-family:Georgia,serif}
section{padding:56px 0}
.duas{display:grid;grid-template-columns:1.2fr 1fr;gap:34px;align-items:start}
.lista{list-style:none;display:grid;gap:10px}.lista li{padding-left:28px;position:relative}.lista li::before{content:"✔";position:absolute;left:0;color:var(--ok);font-weight:700}
.box{background:#fff;border:1px solid var(--line);border-radius:var(--radius);padding:22px}
.box h3{font-size:1.1rem;margin-bottom:8px}
.passos{display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:16px;counter-reset:p}
.passo{background:#fff;border:1px solid var(--line);border-radius:var(--radius);padding:18px}
.passo::before{counter-increment:p;content:counter(p);display:grid;place-items:center;width:32px;height:32px;border-radius:50%;background:var(--accent);font-weight:800;margin-bottom:8px}
details{background:#fff;border:1px solid var(--line);border-radius:12px;padding:14px 18px;margin-bottom:10px}
summary{cursor:pointer;font-weight:600}details p{margin-top:8px;color:var(--ink-2)}
.links{display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:8px 18px}
.links a{color:var(--brand);text-decoration:none;padding:4px 0;border-bottom:1px dashed var(--line)}.links a:hover{color:var(--ink)}
.trts{width:100%;border-collapse:collapse;background:#fff;border-radius:12px;overflow:hidden;font-size:.95rem}
.trts th,.trts td{padding:10px 12px;border-bottom:1px solid #eee;text-align:left}.trts th{background:#f1eee6}
.final{background:var(--ink);color:#fff;text-align:center}.final p{opacity:.9;margin:0 auto 22px;max-width:620px}
footer{padding:34px 0;font-size:.88rem;color:var(--ink-2)}
footer .cols{display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:20px;margin-bottom:20px}
footer h4{font-size:.8rem;letter-spacing:.1em;text-transform:uppercase;margin-bottom:8px;color:var(--ink)}
footer a{display:block;text-decoration:none;padding:2px 0}footer a:hover{text-decoration:underline}
.wa-float{position:fixed;right:18px;bottom:18px;width:56px;height:56px;border-radius:50%;background:#25d366;display:grid;place-items:center;box-shadow:0 8px 24px rgba(0,0,0,.25);z-index:30}
.wa-float svg{width:30px;height:30px;fill:#fff}
@media (max-width:780px){.duas{grid-template-columns:1fr}header nav{display:none}.hero{padding:44px 0 40px}section{padding:42px 0}}
"""

WA_SVG = '<svg viewBox="0 0 32 32"><path d="M16 3C9 3 3.3 8.6 3.3 15.6c0 2.2.6 4.4 1.7 6.3L3 29l7.3-1.9c1.8 1 3.8 1.5 5.8 1.5 7 0 12.7-5.6 12.7-12.6S23 3 16 3zm0 23.1c-1.9 0-3.7-.5-5.3-1.4l-.4-.2-4.3 1.1 1.2-4.2-.3-.4a10.4 10.4 0 0 1-1.6-5.4C5.3 9.8 10.1 5.1 16 5.1s10.7 4.7 10.7 10.5S21.9 26.1 16 26.1zm5.9-7.8c-.3-.2-1.9-.9-2.2-1-.3-.1-.5-.2-.7.2-.2.3-.8 1-1 1.2-.2.2-.4.2-.7.1-.3-.2-1.4-.5-2.6-1.6-1-.9-1.6-1.9-1.8-2.2-.2-.3 0-.5.1-.7l.5-.6c.2-.2.2-.4.3-.6.1-.2 0-.4 0-.6l-1-2.4c-.3-.6-.5-.5-.7-.5h-.6c-.2 0-.6.1-.9.4-.3.3-1.2 1.1-1.2 2.7s1.2 3.2 1.4 3.4c.2.2 2.4 3.6 5.7 5 .8.3 1.4.5 1.9.7.8.2 1.5.2 2.1.1.6-.1 1.9-.8 2.2-1.5.3-.7.3-1.4.2-1.5-.1-.1-.3-.2-.6-.4z"/></svg>'


def wa_link(txt):
    from urllib.parse import quote
    return f'https://wa.me/{WA}?text={quote(txt)}'


def form_link(slug):
    return f'/?utm_source=organico&utm_medium=seo&utm_campaign={slug}#form'


def rodape():
    serv = ''.join(f'<a href="/{s["slug"]}/">{e(s["curto"])}</a>' for s in SERVICOS)
    cid = ''.join(f'<a href="/calculo-trabalhista/{c[3]}/">Cálculo trabalhista em {e(c[0])}</a>' for c in CIDADES[:8])
    cid2 = ''.join(f'<a href="/calculo-trabalhista/{c[3]}/">Cálculo trabalhista em {e(c[0])}</a>' for c in CIDADES[8:])
    return f'''<footer><div class="wrap"><div class="cols">
<div><h4>Serviços</h4>{serv}</div><div><h4>Cidades</h4>{cid}</div><div><h4>&nbsp;</h4>{cid2}<a href="/atendimento-todo-brasil/">Todos os TRTs do Brasil</a></div>
<div><h4>Pontes Ferreira</h4><a href="/">Página inicial</a><a href="/portfolio.html">Apresentação para escritórios</a><a href="/privacidade.html">Política de Privacidade</a><a href="{wa_link('Olá! Quero um orçamento de cálculo trabalhista.')}">WhatsApp (21) 98770-8652</a></div></div>
Pontes Ferreira Cálculos Judiciais · CNPJ 51.362.258/0001-79 · Cálculos trabalhistas para advogados de todo o Brasil</div></footer>'''


def pagina(slug, titulo, desc, migalhas, corpo, faq, wa_txt, extra_ld=None):
    url = f'{SITE}/{slug}/'
    ld = [{
        '@context': 'https://schema.org', '@type': 'ProfessionalService', 'name': 'Pontes Ferreira Cálculos Judiciais',
        'url': SITE + '/', 'telephone': '+55-21-98770-8652', 'priceRange': '1º cálculo R$ 200; a partir de R$ 250', 'areaServed': {'@type': 'Country', 'name': 'Brasil'},
        'description': 'Cálculos trabalhistas no PJe-Calc para advogados e escritórios: liquidação, impugnação, cálculo da inicial e atualização.'
    }, {
        '@context': 'https://schema.org', '@type': 'BreadcrumbList',
        'itemListElement': [{'@type': 'ListItem', 'position': i + 1, 'name': n, 'item': SITE + u} for i, (n, u) in enumerate(migalhas)]
    }]
    if faq:
        ld.append({'@context': 'https://schema.org', '@type': 'FAQPage', 'mainEntity': [
            {'@type': 'Question', 'name': q, 'acceptedAnswer': {'@type': 'Answer', 'text': a}} for q, a in faq]})
    if extra_ld:
        ld.append(extra_ld)
    mig = ' › '.join(f'<a href="{u}">{e(n)}</a>' for n, u in migalhas[:-1]) + f' › {e(migalhas[-1][0])}'
    faq_html = ''.join(f'<details><summary>{e(q)}</summary><p>{e(a)}</p></details>' for q, a in faq)
    return f'''<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>{e(titulo)} | Pontes Ferreira</title>
<meta name="description" content="{e(desc)}">
<link rel="canonical" href="{url}">
<meta property="og:type" content="website"><meta property="og:url" content="{url}">
<meta property="og:title" content="{e(titulo)}"><meta property="og:description" content="{e(desc)}"><meta property="og:locale" content="pt_BR">
<link rel="stylesheet" href="/paginas.css">
<link rel="icon" href="/img/marca.svg" type="image/svg+xml">
<link rel="apple-touch-icon" href="/img/marca.svg">
<meta name="theme-color" content="#060f26">
<meta property="og:image" content="https://pontesferreiracalculos.com/img/og.png">
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Cinzel:wght@600;700&family=Cormorant+Garamond:wght@600;700&display=swap" rel="stylesheet" media="print" onload="this.media='all'"><noscript><link href="https://fonts.googleapis.com/css2?family=Cinzel:wght@600;700&family=Cormorant+Garamond:wght@600;700&display=swap" rel="stylesheet"></noscript>
<link rel="stylesheet" href="/marca.css">
<script type="application/ld+json">{json.dumps(ld, ensure_ascii=False)}</script>
</head>
<body>
<header><div class="wrap"><a class="logo" href="/" aria-label="Pontes Ferreira Cálculos · início"><img src="/img/marca.svg" alt="" width="42" height="42"><span class="lw"><b>Pontes Ferreira</b><i>Cálculos</i></span></a>
<nav><a href="/#servicos">Serviços</a><a href="/atendimento-todo-brasil/">Atendemos todo o Brasil</a><a href="/#precos">Preços</a></nav>
<a class="btn" style="padding:9px 16px;font-size:.9rem" href="{form_link(slug.replace('/', '_'))}">Pedir orçamento</a></div></header>
<div class="hero"><div class="wrap"><div class="migalha">{mig}</div>
{corpo}
</div></div>
{faq and f'<section><div class="wrap"><div class="eyebrow">Dúvidas</div><h2>Perguntas frequentes</h2>{faq_html}</div></section>' or ''}
<section class="final"><div class="wrap"><h2>Envie o processo e receba o orçamento hoje</h2>
<p>Informe o número do processo. Valor fechado antes de começar: 1º cálculo por R$ 200, depois a partir de R$ 250.</p>
<div class="ctas" style="justify-content:center"><a class="btn" href="{form_link(slug.replace('/', '_'))}">Enviar processo</a><a class="btn wa" href="{wa_link(wa_txt)}" target="_blank" rel="noopener">WhatsApp (21) 98770-8652</a></div></div></section>
{rodape()}
<a class="wa-float" href="{wa_link(wa_txt)}" target="_blank" rel="noopener" aria-label="WhatsApp">{WA_SVG}</a>
<script src="/config.js"></script>
<script src="/rastro.js"></script>
</body>
</html>
'''


COMO = '''<section style="background:#fff"><div class="wrap"><div class="eyebrow">Como funciona</div><h2>Quatro passos, sem reunião</h2><div class="passos">
<div class="passo"><b>Envie o processo</b><br>Informe o número do processo pelo site ou WhatsApp.</div>
<div class="passo"><b>Receba o orçamento</b><br>Em até 1 hora útil, com valor fechado e prazo.</div>
<div class="passo"><b>Aprovou, começamos</b><br>Leitura completa das decisões e cálculo no PJe-Calc.</div>
<div class="passo"><b>Entrega em até 48h</b><br>.PJC, relatório em PDF e resumo do deferido.</div></div></div></section>'''


def gerar_servico(s):
    corpo = f'''<div class="eyebrow">Cálculos trabalhistas para advogados</div>
<h1>{s["h1"]}</h1><p>{e(s["intro"])}</p>
<div class="ctas"><a class="btn" href="{form_link(s["slug"])}">Enviar processo para orçamento</a><a class="btn ghost" href="{wa_link(f'Olá! Preciso de {s["curto"].lower()}. Pode me passar um orçamento?')}" target="_blank" rel="noopener">Falar no WhatsApp</a></div>
<div class="fatos"><div><b>48h</b>prazo padrão</div><div><b>R$ 200</b>seu 1º cálculo</div><div><b>.PJC</b>+ relatório em PDF</div></div>
</div></div>
<section><div class="wrap duas"><div><div class="eyebrow">O que está incluído</div><h2>Tudo pronto para juntar ao processo</h2><ul class="lista">{''.join(f'<li>{e(i)}</li>' for i in s["itens"])}</ul></div>
<div class="box"><h3>Outros serviços</h3><div class="links" style="grid-template-columns:1fr">{''.join(f'<a href="/{o["slug"]}/">{e(o["curto"])}</a>' for o in SERVICOS if o is not s)}</div>
<h3 style="margin-top:16px">Atendemos todo o Brasil</h3><p style="color:var(--ink-2);font-size:.95rem">Processos de todos os 24 TRTs, 100% online. <a href="/atendimento-todo-brasil/">Ver regiões</a></p></div></div></section>
{COMO}
<div style="display:none"><div><div>'''  # fecha as divs do hero (o template abre .hero > .wrap)
    corpo = corpo.replace('</div></div>\n<section>', '</div></div>\n<section>', 1)
    html_ = pagina(s['slug'], s['titulo'], s['desc'], [('Início', '/'), (s['curto'], f'/{s["slug"]}/')], corpo, s['faq'], f'Olá! Preciso de {s["curto"].lower()}.')
    return html_.replace('<div style="display:none"><div><div>\n</div></div>', '')


def gerar_cidade(c):
    nome, uf, reg, slug, prox = c
    sede, area = TRT[reg]
    faq = [
        (f'Vocês fazem cálculos para processos do TRT da {reg}ª Região?', f'Sim. Atendemos processos do TRT da {reg}ª Região ({area}) e de todos os outros regionais. O trabalho é 100% online, pelo PJe.'),
        (f'Preciso ir ao escritório em {nome}?', 'Não. Você informa o número do processo pelo site ou WhatsApp e recebe tudo por e-mail e WhatsApp, sem reunião presencial.'),
        ('Quanto custa um cálculo trabalhista?', 'O 1º cálculo sai por R$ 200; depois, a partir de R$ 250 por cálculo de um autor. Mais de um autor ou casos complexos são orçados antes, com valor fechado.'),
        ('Em quanto tempo recebo?', 'Até 48h na maioria dos casos. Com prazo vencendo, consulte o atendimento urgente em 24h.'),
    ]
    corpo = f'''<div class="eyebrow">{e(nome)} · {uf} · TRT da {reg}ª Região</div>
<h1>Cálculo trabalhista em <em>{e(nome)}</em> no PJe-Calc, entregue em até 48h</h1>
<p>Advogados e escritórios de {e(nome)} enviam o processo online e recebem o cálculo pronto no PJe-Calc: liquidação, impugnação, cálculo da inicial e atualização, com o arquivo .PJC, o relatório em PDF e o resumo do que foi deferido.</p>
<div class="ctas"><a class="btn" href="{form_link('cidade_' + slug)}">Enviar processo para orçamento</a><a class="btn ghost" href="{wa_link(f'Olá! Sou de {nome} e quero um orçamento de cálculo trabalhista.')}" target="_blank" rel="noopener">Falar no WhatsApp</a></div>
<div class="fatos"><div><b>TRT-{reg}</b>{e(area)}</div><div><b>R$ 200</b>seu 1º cálculo</div><div><b>48h</b>prazo padrão</div></div>
</div></div>
<section><div class="wrap duas"><div><div class="eyebrow">Para escritórios de {e(nome)}</div><h2>Cálculos para processos do TRT da {reg}ª Região</h2>
<p style="margin-bottom:14px;color:var(--ink-2)">O TRT da {reg}ª Região tem sede em {e(sede)} e abrange {e(area)}. Fazemos cálculos para processos das Varas do Trabalho de {e(nome)} e região, incluindo {e(prox)}.</p>
<ul class="lista">{''.join(f'<li><a href="/{s["slug"]}/">{e(s["curto"])}</a></li>' for s in SERVICOS[:4])}<li>Processos em qualquer fase: conhecimento, liquidação e execução</li></ul></div>
<div class="box"><h3>Outras cidades atendidas</h3><div class="links" style="grid-template-columns:1fr 1fr">{''.join(f'<a href="/calculo-trabalhista/{o[3]}/">{e(o[0])}</a>' for o in CIDADES if o[3] != slug)}</div>
<p style="margin-top:12px;font-size:.95rem"><a href="/atendimento-todo-brasil/">Ver todos os TRTs →</a></p></div></div></section>
{COMO}
<div style="display:none"><div><div>'''
    html_ = pagina(f'calculo-trabalhista/{slug}', f'Cálculo trabalhista em {nome}/{uf} · TRT-{reg}',
                   f'Cálculo trabalhista em {nome} no PJe-Calc para advogados: liquidação, impugnação e inicial. TRT da {reg}ª Região. 1º cálculo por R$ 200, entrega em até 48h.',
                   [('Início', '/'), ('Atendemos todo o Brasil', '/atendimento-todo-brasil/'), (f'{nome} ({uf})', f'/calculo-trabalhista/{slug}/')],
                   corpo, faq, f'Olá! Sou de {nome} e quero um orçamento de cálculo trabalhista.')
    return html_.replace('<div style="display:none"><div><div>\n</div></div>', '')


def gerar_brasil():
    ufs_por_reg = {}
    mapa_uf = {'RJ': 1, 'SP': 2, 'MG': 3, 'RS': 4, 'BA': 5, 'PE': 6, 'CE': 7, 'PA': 8, 'AP': 8, 'PR': 9, 'DF': 10, 'TO': 10, 'AM': 11, 'RR': 11, 'SC': 12, 'PB': 13, 'RO': 14, 'AC': 14, 'MA': 16, 'ES': 17, 'GO': 18, 'AL': 19, 'SE': 20, 'RN': 21, 'PI': 22, 'MT': 23, 'MS': 24}
    for uf, r in mapa_uf.items():
        ufs_por_reg.setdefault(r, []).append(uf)
    ufs_por_reg.setdefault(15, []).append('SP (interior)')
    pag = {c[2]: c for c in CIDADES}
    linhas = ''.join(f'<tr><td><b>{r}ª Região</b></td><td>{e(TRT[r][0])}</td><td>{e(TRT[r][1])}</td><td>{" ".join(e(u) for u in ufs_por_reg.get(r, []))}</td>'
                     f'<td>{f"<a href='/calculo-trabalhista/{pag[r][3]}/'>{e(pag[r][0])}</a>" if r in pag else "✔ atendemos"}</td></tr>' for r in range(1, 25))
    faq = [('Vocês atendem processos de qualquer estado?', 'Sim. Todos os 24 Tribunais Regionais do Trabalho usam o PJe, e o PJe-Calc é o mesmo em todo o país. Ajustamos as particularidades de cada regional.'),
           ('Como é o atendimento a distância?', 'Você envia o processo pelo site ou WhatsApp, recebe o orçamento em até 1 hora útil e o cálculo em até 48h, por e-mail e WhatsApp.'),
           ('Quanto custa?', 'O 1º cálculo sai por R$ 200; depois, a partir de R$ 250 por cálculo de um autor, com valor fechado antes de começar.')]
    corpo = f'''<div class="eyebrow">Atendimento 100% online</div>
<h1>Cálculos trabalhistas para advogados de <em>todo o Brasil</em></h1>
<p>Atendemos processos dos 24 Tribunais Regionais do Trabalho. Você informa o número do processo e recebe o cálculo pronto no PJe-Calc em até 48h, esteja onde estiver.</p>
<div class="ctas"><a class="btn" href="{form_link('brasil')}">Enviar processo para orçamento</a><a class="btn ghost" href="{wa_link('Olá! Quero um orçamento de cálculo trabalhista.')}" target="_blank" rel="noopener">Falar no WhatsApp</a></div>
</div></div>
<section><div class="wrap"><div class="eyebrow">Regiões atendidas</div><h2>Os 24 TRTs</h2>
<div style="overflow-x:auto"><table class="trts"><tr><th>TRT</th><th>Sede</th><th>Abrangência</th><th>UF</th><th>Página</th></tr>{linhas}</table></div></div></section>
<section style="padding-top:0"><div class="wrap"><div class="eyebrow">Serviços</div><h2>O que fazemos</h2><div class="links">{''.join(f'<a href="/{s["slug"]}/">{e(s["titulo"])}</a>' for s in SERVICOS)}</div></div></section>
{COMO}
<div style="display:none"><div><div>'''
    html_ = pagina('atendimento-todo-brasil', 'Cálculos trabalhistas em todo o Brasil · 24 TRTs',
                   'Cálculos trabalhistas no PJe-Calc para advogados de todos os estados e dos 24 TRTs. 1º cálculo por R$ 200, entrega em até 48h, atendimento online.',
                   [('Início', '/'), ('Atendemos todo o Brasil', '/atendimento-todo-brasil/')], corpo, faq, 'Olá! Quero um orçamento de cálculo trabalhista.')
    return html_.replace('<div style="display:none"><div><div>\n</div></div>', '')


def salvar(rel, conteudo):
    p = os.path.join(RAIZ, rel)
    os.makedirs(os.path.dirname(p), exist_ok=True)
    with open(p, 'w', encoding='utf-8') as f:
        f.write(conteudo)


def main():
    salvar('paginas.css', CSS)
    urls = []
    for s in SERVICOS:
        salvar(f'{s["slug"]}/index.html', gerar_servico(s)); urls.append((f'/{s["slug"]}/', '0.9'))
    for c in CIDADES:
        salvar(f'calculo-trabalhista/{c[3]}/index.html', gerar_cidade(c)); urls.append((f'/calculo-trabalhista/{c[3]}/', '0.8'))
    salvar('atendimento-todo-brasil/index.html', gerar_brasil()); urls.append(('/atendimento-todo-brasil/', '0.8'))
    fixas = [('/', '1.0'), ('/portfolio.html', '0.8'), ('/privacidade.html', '0.3')]
    xml = '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' + ''.join(
        f'  <url><loc>{SITE}{u}</loc><lastmod>{HOJE}</lastmod><priority>{p}</priority></url>\n' for u, p in fixas + urls) + '</urlset>\n'
    salvar('sitemap.xml', xml)
    print(f'{len(urls)} páginas geradas')


if __name__ == '__main__':
    main()
