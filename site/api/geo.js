// Vercel Function: devolve estado e cidade aproximados do visitante (pelo provedor), sem guardar o IP.
module.exports = (req, res) => {
  const h = req.headers, dec = v => { try { return decodeURIComponent(v || ''); } catch { return v || ''; } };
  res.setHeader('Cache-Control', 'no-store');
  res.status(200).json({ pais: h['x-vercel-ip-country'] || '', uf: h['x-vercel-ip-country-region'] || '', cidade: dec(h['x-vercel-ip-city']) });
};
