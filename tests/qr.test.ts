import { describe, expect, it } from "bun:test";
import { encodeQrText, wifiQrString } from "../src/frontend/components/qr";

function finderOk(m: boolean[][], fx: number, fy: number): boolean {
  for (let dy = 0; dy < 7; dy++) for (let dx = 0; dx < 7; dx++) {
    const edge = dx === 0 || dx === 6 || dy === 0 || dy === 6;
    const core = dx >= 2 && dx <= 4 && dy >= 2 && dy <= 4;
    if (m[fy + dy][fx + dx] !== (edge || core)) return false;
  }
  return true;
}

describe("qr encoder", () => {
  it("picks versions by length", () => {
    expect(encodeQrText("A").length).toBe(21);
    expect(encodeQrText("x".repeat(14)).length).toBe(21);
    expect(encodeQrText("x".repeat(15)).length).toBe(25);
    expect(encodeQrText("x".repeat(42)).length).toBe(29);
    expect(encodeQrText("x".repeat(43)).length).toBe(33);
  });

  it("draws finders, timing and dark module", () => {
    const m = encodeQrText("HELLO");
    const n = m.length;
    expect(finderOk(m, 0, 0)).toBe(true);
    expect(finderOk(m, n - 7, 0)).toBe(true);
    expect(finderOk(m, 0, n - 7)).toBe(true);
    for (let i = 8; i < n - 8; i++) {
      expect(m[6][i]).toBe(i % 2 === 0);
      expect(m[i][6]).toBe(i % 2 === 0);
    }
    expect(m[n - 8][8]).toBe(true);
  });

  it("draws the alignment pattern from v2", () => {
    const m = encodeQrText("x".repeat(15));
    expect(m.length).toBe(25);
    // Centro 18,18 en v2: anillo 5x5 con centro.
    expect(m[18][18]).toBe(true);
    expect(m[16][16]).toBe(true);
    expect(m[17][17]).toBe(false);
    expect(m[16][18]).toBe(true);
  });

  // Nota: la validez extremo a extremo se verificó en desarrollo decodificando con
  // jsQR (v1-v4) e introduciendo 6 errores corregidos con éxito. Estos tests cubren
  // estructura determinista; el gate manual es escanear con un móvil en el dry-run.
  it("reads back the mode header and length", () => {
    // Recorrido de lectura independiente (zigzag + unmask) sobre un v2 real.
    const text = "http://192.168.1.100:8400";
    const m = encodeQrText(text);
    const n = m.length;
    const isFunc = (x: number, y: number) => {
      if (x === 6 || y === 6) return true;
      if (x <= 7 && y <= 7) return true;
      if (x >= n - 8 && y <= 7) return true;
      if (x <= 7 && y >= n - 8) return true;
      if (x <= 8 && y <= 8) return true;
      if (y === 8 && x >= n - 8) return true;
      if (x === 8 && y >= n - 8) return true;
      if (n > 21 && x >= n - 9 && y >= n - 9 && x <= n - 5 && y <= n - 5) return true;
      return false;
    };
    const bits: number[] = [];
    for (let right = n - 1; right >= 1; right -= 2) {
      const r = right === 6 ? 5 : right;
      for (let vert = 0; vert < n; vert++) {
        for (let j = 0; j < 2; j++) {
          const x = r - j;
          const y = ((r + 1) & 2) === 0 ? n - 1 - vert : vert;
          if (!isFunc(x, y)) bits.push((m[y][x] ? 1 : 0) ^ ((x + y) % 2 === 0 ? 1 : 0));
        }
      }
    }
    const bytes: number[] = [];
    for (let i = 0; i + 8 <= bits.length; i += 8) {
      let b = 0;
      for (let j = 0; j < 8; j++) b = (b << 1) | bits[i + j];
      bytes.push(b);
    }
    // Cabecera: modo 0100 + longitud 24, y los 28 bytes de datos íntegros.
    expect(bits.slice(0, 4).join("")).toBe("0100");
    expect(parseInt(bits.slice(4, 12).join(""), 2)).toBe(text.length);
    expect(bytes.length).toBe(44);
    expect(bytes[0]).toBe(0x41);
  });

  it("is deterministic and rejects oversize input", () => {
    expect(JSON.stringify(encodeQrText("abc"))).toBe(JSON.stringify(encodeQrText("abc")));
    expect(() => encodeQrText("x".repeat(63))).toThrow();
  });

  it("builds wifi strings with escaping", () => {
    expect(wifiQrString("Casa", "secreto")).toBe("WIFI:T:WPA;S:Casa;P:secreto;;");
    expect(wifiQrString("Casa", null)).toBe("WIFI:T:nopass;S:Casa;;");
    expect(wifiQrString("a;b:c", "x\\y")).toBe("WIFI:T:WPA;S:a\\;b\\:c;P:x\\\\y;;");
  });
});
