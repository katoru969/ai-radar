const delay = (ms,signal) => new Promise((resolve,reject) => {
  if (signal.aborted) return reject(signal.reason);
  const aborted = () => {clearTimeout(timer); reject(signal.reason);};
  const timer = setTimeout(() => {signal.removeEventListener('abort',aborted); resolve();},ms);
  signal.addEventListener('abort',aborted,{once:true});
});
export const safeFetchError = error => /^http_\d{3}$|^(anthropic_page_changed|youtube_page_changed|youtube_metadata_missing|not_a_feed|invalid_xml|response_too_large)$/.test(error?.message) ? error.message : error?.name === 'TimeoutError' || error?.name === 'AbortError' ? 'timeout' : 'fetch_failed';

export async function fetchText(url, {fetchImpl = fetch, timeoutMs = 8000, signal, retries = 1, retryStatuses = [429,500,502,503,504], maxBytes = 2000000, validateUrl, accept = 'application/rss+xml, application/atom+xml, application/xml, text/html;q=0.8'} = {}) {
  const timeout = AbortSignal.timeout(timeoutMs);
  const combined = signal ? AbortSignal.any([signal,timeout]) : timeout;
  let response;
  for (let attempt = 0; attempt <= Math.min(2,retries); attempt++) {
    let target = String(url);
    for (let redirects = 0; ; redirects++) {
      if (validateUrl && !validateUrl(target)) throw new Error('unsafe_article_url');
      response = await fetchImpl(target, {signal:combined, ...(validateUrl ? {redirect:'manual'} : {}),headers:{'user-agent':'AI-Radar/1.2 (personal public feed reader)',accept}});
      if (!validateUrl || ![301,302,303,307,308].includes(response.status)) break;
      const location = response.headers.get('location');
      await response.body?.cancel();
      if (!location || redirects >= 3) throw new Error('unsafe_article_redirect');
      target = new URL(location,target).href;
    }
    if (response.ok || !retryStatuses.includes(response.status) || attempt === Math.min(2,retries)) break;
    const retryAfter = Number(response.headers.get('retry-after')) * 1000;
    if (retryAfter > 1000) break;
    await response.body?.cancel();
    await delay(retryAfter || 200 * (attempt + 1),combined);
  }
  if (!response.ok) throw new Error(`http_${response.status}`);
  const reader = response.body?.getReader();
  if (!reader) {
    const text = await response.text();
    if (Buffer.byteLength(text) > maxBytes) throw new Error('response_too_large');
    return text;
  }
  let size = 0;
  const chunks = [];
  while (true) {
    const {done,value} = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > maxBytes) {await reader.cancel(); throw new Error('response_too_large');}
    chunks.push(value);
  }
  return Buffer.concat(chunks).toString('utf8');
}

export async function fetchJson(url, options = {}) {
  return JSON.parse(await fetchText(url,{...options,accept:'application/json'}));
}
