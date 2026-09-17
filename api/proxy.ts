// Proxy de Vercel para la versión web: el navegador llama a /api/icloud/...
// y aquí se agrega la API key, que solo existe en el servidor (API_KEY).
// vercel.json reescribe /api/icloud/<ruta> a /api/proxy?ruta=icloud/<ruta>.
export async function GET(request: Request) {
  const apiUrl = process.env.API_URL;
  const apiKey = process.env.API_KEY;
  if (!apiUrl || !apiKey) {
    return new Response('Faltan API_URL o API_KEY en Vercel', { status: 500 });
  }

  const entrada = new URL(request.url);
  const ruta = entrada.searchParams.get('ruta') ?? '';
  // Solo se reenvía lo que usa la app, para que el proxy no abra toda la API con la key
  if (!/^icloud\/[\w\-/]*$/.test(ruta)) {
    return new Response('Ruta no permitida', { status: 404 });
  }
  entrada.searchParams.delete('ruta');

  const destino = `${apiUrl}/${ruta}${entrada.search}`;
  try {
    const r = await fetch(destino, { headers: { 'X-API-Key': apiKey } });
    const cabeceras = new Headers();
    const tipo = r.headers.get('content-type');
    if (tipo) cabeceras.set('content-type', tipo);
    cabeceras.set('cache-control', 'no-store');
    return new Response(r.body, { status: r.status, headers: cabeceras });
  } catch {
    return new Response('No se pudo conectar con la API', { status: 502 });
  }
}
