export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Metodo nao permitido' });

  const { to } = req.body || {};
  const cep = (to?.postal_code || '').replace(/\D/g,'');

  if (!cep || cep.length < 8) {
    return res.status(400).json({ error: 'CEP invalido' });
  }

  // Tentar Melhor Envio
  const ME_TOKEN = process.env.ME_TOKEN;
  if (ME_TOKEN && ME_TOKEN.startsWith('eyJ')) {
    try {
      const r = await fetch('https://melhorenvio.com.br/api/v2/me/shipment/calculate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer ' + ME_TOKEN,
          'Accept': 'application/json',
          'User-Agent': 'NunesVieira/1.0 (ecommerce@nudesvieira.com.br)'
        },
        body: JSON.stringify(req.body),
        signal: AbortSignal.timeout(6000)
      });
      if (r.ok) {
        const d = await r.json();
        const ok = (Array.isArray(d) ? d : []).filter(s => !s.error && s.price);
        if (ok.length > 0) return res.status(200).json(d);
      }
    } catch(e) { console.log('ME:', e.message); }
  }

  // Tabela por região — instantâneo, sem API externa
  const n = parseInt(cep.slice(0,2));
  const r = n>=13&&n<=19 ? 0 : n>=1&&n<=9 ? 1 : 2;

  const tabela = [
    // SP Interior
    [
      { id:'jadlog', name:'Jadlog Package', company:{name:'Jadlog'}, price:'17.90', delivery_time:'4', error:null },
      { id:'04510', name:'PAC', company:{name:'Correios'}, price:'19.80', delivery_time:'6', error:null },
      { id:'04014', name:'SEDEX', company:{name:'Correios'}, price:'27.50', delivery_time:'2', error:null },
    ],
    // SP Capital
    [
      { id:'jadlog-com', name:'Jadlog .COM', company:{name:'Jadlog'}, price:'21.90', delivery_time:'3', error:null },
      { id:'04510', name:'PAC', company:{name:'Correios'}, price:'23.80', delivery_time:'5', error:null },
      { id:'04014', name:'SEDEX', company:{name:'Correios'}, price:'34.50', delivery_time:'1', error:null },
    ],
    // Outros estados
    [
      { id:'jadlog', name:'Jadlog Package', company:{name:'Jadlog'}, price:'27.90', delivery_time:'7', error:null },
      { id:'04510', name:'PAC', company:{name:'Correios'}, price:'29.80', delivery_time:'10', error:null },
      { id:'04014', name:'SEDEX', company:{name:'Correios'}, price:'47.50', delivery_time:'4', error:null },
    ]
  ];

  return res.status(200).json(tabela[r]);
}
