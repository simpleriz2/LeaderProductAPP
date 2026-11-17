/** Bounded streaming reads shared by Web JSON/API and private artifact transports. */
export async function readResponseBytes(response: Response, signal: AbortSignal, limit: number): Promise<Uint8Array> {
  const reader = response.body?.getReader(); const chunks: Uint8Array[] = []; let size = 0;
  try {
    const declared = response.headers.get('content-length');
    if (declared !== null && (!/^\d+$/.test(declared) || Number(declared) > limit)) throw Error('Response too large');
    if (reader) for (;;) {
      if (signal.aborted) throw Error('Request aborted');
      const next = await reader.read(); if (next.done) break;
      size += next.value.length; if (size > limit) throw Error('Response too large'); chunks.push(next.value);
    }
    if (signal.aborted) throw Error('Request aborted');
    const bytes = new Uint8Array(size); let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
    return bytes;
  } catch (error) { await reader?.cancel().catch(() => undefined); throw error; }
  finally { reader?.releaseLock(); }
}
