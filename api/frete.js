export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Metodo nao permitido' });

  const { to } = req.body || {};
  const cepDestino = (to?.postal_code || '').replace(/\D/g,'');
  const cepOrigem = '18200000';

  if (!cepDestino || cepDestino.length < 8) {
    return res.status(400).json({ error: 'CEP invalido' });
  }

  // Tentar Melhor Envio
  const ME_TOKEN = process.env.ME_TOKEN;
  if (ME_TOKEN && ME_TOKEN.startsWith('eyJ')) {
    try {
      const meResp = await fetch('https://melhorenvio.com.br/api/v2/me/shipment/calculate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer ' + ME_TOKEN,
          'Accept': 'application/json',
          'User-Agent': 'NunesVieira/1.0 (ecommerce@nunesvieira.com.br)'
        },
        body: JSON.stringify(req.body)
      });
      if (meResp.ok) {
        const meData = await meResp.json();
        const ativos = (Array.isArray(meData) ? meData : []).filter(s => !s.error && s.price);
        if (ativos.length > 0) return res.status(200).json(meData);
      }
    } catch (e) {
      console.log('ME falhou:', e.message);
    }
  }

  // Fallback Correios API publica
  const resultados = [];
  try {
    for (const servico of ['04014','04510']) {
      try {
        const url = `https://ws.correios.com.br/calculador/CalcPrecoPrazo.aspx?nCdEmpresa=&sDsSenha=&sCepOrigem=${cepOrigem}&sCepDestino=${cepDestino}&nVlPeso=1&nCdFormato=1&nVlComprimento=20&nVlAltura=20&nVlLargura=20&nVlDiametro=0&sCdMaoPropria=N&nVlValorDeclarado=50&sCdAvisoRecebimento=N&nCdServico=${servico}&nVlDiametro=0&StrRetorno=xml&nIndicaCalculo=3`;
        const resp = await fetch(url, { signal: AbortSignal.timeout(5000) });
        const text = await resp.text();
        const valor = text.match(/<Valor>([\d,]+)<\/Valor>/)?.[1]?.replace(',','.');
        const prazo = text.match(/<PrazoEntrega>(\d+)<\/PrazoEntrega>/)?.[1];
        if (valor && parseFloat(valor) > 0) {
          resultados.push({ id:servico, name:servico==='04014'?'SEDEX':'PAC', company:{name:'Correios'}, price:valor, delivery_time:prazo||'5', error:null });
        }
      } catch(e) {}
    }
  } catch(e) {}

  // Jadlog estimado
  const n = parseInt(cepDestino.slice(0,2));
  const r = n>=13&&n<=19 ? 0 : n>=1&&n<=9 ? 1 : 2;
  const jP = ['18.00','22.00','28.00'][r];
  const jD = ['4','3','7'][r];
  resultados.push({ id:'jadlog', name:'Jadlog Package', company:{name:'Jadlog'}, price:jP, delivery_time:jD, error:null });

  if (resultados.length > 0) return res.status(200).json(resultados);

  // Tabela final
  const pP = ['20.00','24.00','30.00'][r];
  const sP = ['28.00','35.00','48.00'][r];
  return res.status(200).json([
    { id:'jadlog', name:'Jadlog Package', company:{name:'Jadlog'}, price:jP, delivery_time:jD, error:null },
    { id:'04510', name:'PAC', company:{name:'Correios'}, price:pP, delivery_time:['6','5','10'][r], error:null },
    { id:'04014', name:'SEDEX', company:{name:'Correios'}, price:sP, delivery_time:['2','1','4'][r], error:null },
  ]);
}
