// ponytail: QR byte-mode mínimo (versiones 1-4, ECC-M, máscara 0 fija) sin dependencias.
// La LAN puede no tener internet: nada de APIs externas ni librerías.

// total, ec por bloque, nº bloques, centros de alineación, bits de resto
const VERSIONS = [
  { total: 26, ec: 10, blocks: 1, align: [] as number[], rest: 0 },
  { total: 44, ec: 16, blocks: 1, align: [6, 18], rest: 7 },
  { total: 70, ec: 26, blocks: 1, align: [6, 22], rest: 7 },
  { total: 100, ec: 18, blocks: 2, align: [6, 26], rest: 7 },
];
const BYTE_CAP = [14, 26, 42, 62];

const EXP = new Array(512).fill(0);
const LOG = new Array(256).fill(0);
(function initGf() {
  let x = 1;
  for (let i = 0; i < 255; i++) {
    EXP[i] = x;
    LOG[x] = i;
    x = (x << 1) ^ (x & 0x80 ? 0x11d : 0);
    x &= 0xff;
  }
  for (let i = 255; i < 512; i++) EXP[i] = EXP[i - 255];
})();

function gfMul(a: number, b: number): number {
  return a === 0 || b === 0 ? 0 : EXP[LOG[a] + LOG[b]];
}

function genPoly(degree: number): number[] {
  // g(x) = ∏(x + α^i): x·poly va a next[j], α^i·poly a next[j+1].
  let poly = [1];
  for (let i = 0; i < degree; i++) {
    const next = new Array(poly.length + 1).fill(0);
    for (let j = 0; j < poly.length; j++) {
      next[j] ^= poly[j];
      next[j + 1] ^= gfMul(poly[j], EXP[i]);
    }
    poly = next;
  }
  return poly;
}

function rsRemainder(data: number[], degree: number): number[] {
  const gen = genPoly(degree);
  const res = [...data, ...new Array(degree).fill(0)];
  for (let i = 0; i < data.length; i++) {
    const coef = res[i];
    if (coef !== 0) for (let j = 1; j <= degree; j++) res[i + j] ^= gfMul(gen[j], coef);
  }
  return res.slice(data.length);
}

function formatBits(): number {
  // EC level M (00) + mask 0 (000), con BCH y máscara de formato.
  const data = 0;
  let d = data << 10;
  const g = 0b10100110111;
  for (let i = 14; i >= 10; i--) if (d & (1 << i)) d ^= g << (i - 10);
  return (((data << 10) | d) ^ 0b101010000010010) & 0x7fff;
}

export function wifiQrString(ssid: string, password: string | null): string {
  const esc = (s: string) => s.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/:/g, "\\:");
  return password ? `WIFI:T:WPA;S:${esc(ssid)};P:${esc(password)};;` : `WIFI:T:nopass;S:${esc(ssid)};;`;
}

export function encodeQrText(text: string): boolean[][] {
  const bytes = new TextEncoder().encode(text);
  const vi = BYTE_CAP.findIndex(cap => bytes.length <= cap);
  if (vi < 0) throw new Error("QR text too long (max 62 bytes)");
  const v = VERSIONS[vi];
  const size = 21 + vi * 4;

  // 1. Datos: modo (0100) + longitud (8 bits) + bytes + terminador + relleno.
  const dataCapBits = (v.total - v.blocks * v.ec) * 8;
  const bits: number[] = [];
  const push = (val: number, n: number) => { for (let i = n - 1; i >= 0; i--) bits.push((val >>> i) & 1); };
  push(0b0100, 4);
  push(bytes.length, 8);
  for (const b of bytes) push(b, 8);
  const term = Math.min(4, dataCapBits - bits.length);
  for (let i = 0; i < term; i++) bits.push(0);
  while (bits.length % 8 !== 0) bits.push(0);
  const dataBytes: number[] = [];
  for (let i = 0; i < bits.length; i += 8) {
    let b = 0;
    for (let j = 0; j < 8; j++) b = (b << 1) | bits[i + j];
    dataBytes.push(b);
  }
  for (let pad = 0xEC; dataBytes.length < dataCapBits / 8; pad ^= 0xEC ^ 0x11) dataBytes.push(pad);

  // 2. Bloques + ECC + intercalado.
  const per = Math.floor(dataBytes.length / v.blocks);
  const blocks: number[][] = [];
  for (let i = 0; i < v.blocks; i++) blocks.push(dataBytes.slice(i * per, (i + 1) * per));
  const ecs = blocks.map(b => rsRemainder(b, v.ec));
  const codewords: number[] = [];
  for (let i = 0; i < per; i++) for (const b of blocks) if (i < b.length) codewords.push(b[i]);
  for (let i = 0; i < v.ec; i++) for (const e of ecs) if (i < e.length) codewords.push(e[i]);

  // 3. Matriz + patrones de función.
  const modules: boolean[][] = Array.from({ length: size }, () => new Array(size).fill(false));
  const func: boolean[][] = Array.from({ length: size }, () => new Array(size).fill(false));
  const set = (x: number, y: number, dark: boolean, isFunc = true) => {
    if (x < 0 || y < 0 || x >= size || y >= size) return;
    modules[y][x] = dark;
    if (isFunc) func[y][x] = true;
  };
  for (let i = 0; i < size; i++) { set(6, i, i % 2 === 0); set(i, 6, i % 2 === 0); }
  const finder = (fx: number, fy: number) => {
    for (let dy = -1; dy <= 7; dy++) for (let dx = -1; dx <= 7; dx++) {
      const on = dx >= 0 && dx <= 6 && dy >= 0 && dy <= 6 &&
        (dx === 0 || dx === 6 || dy === 0 || dy === 6 || (dx >= 2 && dx <= 4 && dy >= 2 && dy <= 4));
      set(fx + dx, fy + dy, on);
    }
  };
  finder(0, 0); finder(size - 7, 0); finder(0, size - 7);
  for (const cy of v.align) for (const cx of v.align) {
    if (cx <= 8 && cy <= 8) continue;
    if (cx <= 8 && cy >= size - 8) continue;
    if (cx >= size - 8 && cy <= 8) continue;
    for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) {
      set(cx + dx, cy + dy, Math.max(Math.abs(dx), Math.abs(dy)) !== 1);
    }
  }
  const fmt = formatBits();
  const bit = (i: number) => ((fmt >>> i) & 1) === 1;
  for (let i = 0; i <= 5; i++) set(8, i, bit(i));
  set(8, 7, bit(6)); set(8, 8, bit(7)); set(7, 8, bit(8));
  for (let i = 9; i < 15; i++) set(14 - i, 8, bit(i));
  for (let i = 0; i < 8; i++) set(size - 1 - i, 8, bit(i));
  for (let i = 8; i < 15; i++) set(8, size - 15 + i, bit(i));
  set(8, size - 8, true);

  // 4. Datos en zigzag con máscara 0.
  const allBits: number[] = [];
  for (const w of codewords) for (let i = 7; i >= 0; i--) allBits.push((w >>> i) & 1);
  let k = 0;
  for (let right = size - 1; right >= 1; right -= 2) {
    if (right === 6) right = 5;
    for (let vert = 0; vert < size; vert++) {
      for (let j = 0; j < 2; j++) {
        const x = right - j;
        const y = ((right + 1) & 2) === 0 ? size - 1 - vert : vert;
        if (!func[y][x] && k < allBits.length) {
          modules[y][x] = allBits[k] === 1 !== ((x + y) % 2 === 0);
          k++;
        }
      }
    }
  }
  return modules;
}
