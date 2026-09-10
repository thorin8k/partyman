// IDs en URL: enteros decimales positivos estrictos (spec HTTP conventions).
// parseInt("12abc") → 12 cuela; aquí solo ^[1-9][0-9]*$ pasa.
export function parsePositiveId(value: string | null | undefined): number | null {
  if (!value || !/^[1-9][0-9]*$/.test(value)) return null;
  const id = Number(value);
  return Number.isSafeInteger(id) ? id : null;
}

// Segmento de path tras un prefijo, ej. extractId(url, "/api/parties/").
export function pathId(url: string, prefix: string): number | null {
  const seg = new URL(url).pathname.slice(prefix.length).split("/")[0];
  return parsePositiveId(seg);
}
