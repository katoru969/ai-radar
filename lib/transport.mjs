export async function fetchText(url, {fetchImpl = fetch, timeoutMs = 8000, signal, accept = 'application/rss+xml, application/atom+xml, application/xml, text/html;q=0.8'} = {}) {
  const timeout = AbortSignal.timeout(timeoutMs);
  const response = await fetchImpl(url, {
    signal:signal ? AbortSignal.any([signal,timeout]) : timeout,
    headers:{'user-agent':'AI-Radar/1.1 (personal public feed reader)',accept}
  });
  if (!response.ok) throw new Error(`http_${response.status}`);
  const reader = response.body?.getReader();
  if (!reader) {
    const text = await response.text();
    if (Buffer.byteLength(text) > 2000000) throw new Error('response_too_large');
    return text;
  }
  let size = 0;
  const chunks = [];
  while (true) {
    const {done,value} = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > 2000000) {await reader.cancel(); throw new Error('response_too_large');}
    chunks.push(value);
  }
  return Buffer.concat(chunks).toString('utf8');
}

export async function fetchJson(url, options = {}) {
  return JSON.parse(await fetchText(url,{...options,accept:'application/json'}));
}
