/**
 * GS1Parser — serviço único de interpretação de códigos GS1 (DataMatrix / GS1-128).
 *
 * Toda leitura GS1 do Vytelis Supply deve passar por aqui.
 * Novas Application Identifiers (AIs) podem ser adicionadas na tabela
 * `AI_TABLE` sem qualquer refatoração dos consumidores.
 */

export type GS1Format = "date" | "text" | "number";

export interface AIDefinition {
  ai: string;
  /** Nome interno legível. */
  key: string;
  label: string;
  /** Tamanho fixo do dado (sem contar o AI); ausente = tamanho variável. */
  fixedLength?: number;
  /** Tamanho máximo para AIs variáveis. */
  maxLength?: number;
  format: GS1Format;
  /** Casas decimais indicadas pelo último dígito do AI (ex.: 310n). */
  decimalIndicator?: boolean;
}

/** Tabela extensível de Application Identifiers. */
export const AI_TABLE: AIDefinition[] = [
  { ai: "00", key: "sscc", label: "SSCC", fixedLength: 18, format: "text" },
  { ai: "01", key: "gtin", label: "GTIN", fixedLength: 14, format: "text" },
  { ai: "02", key: "content_gtin", label: "GTIN do conteúdo", fixedLength: 14, format: "text" },
  { ai: "10", key: "batch", label: "Lote", maxLength: 20, format: "text" },
  { ai: "11", key: "manufacture_date", label: "Data de fabricação", fixedLength: 6, format: "date" },
  { ai: "13", key: "packaging_date", label: "Data de embalagem", fixedLength: 6, format: "date" },
  { ai: "15", key: "best_before", label: "Consumir antes de", fixedLength: 6, format: "date" },
  { ai: "17", key: "expiration_date", label: "Data de validade", fixedLength: 6, format: "date" },
  { ai: "20", key: "variant", label: "Variante", fixedLength: 2, format: "text" },
  { ai: "21", key: "serial", label: "Número de série", maxLength: 20, format: "text" },
  { ai: "22", key: "consumer_lot", label: "Lote de consumo", maxLength: 29, format: "text" },
  { ai: "30", key: "quantity", label: "Quantidade", maxLength: 8, format: "number" },
  { ai: "37", key: "content_quantity", label: "Quantidade no contêiner", maxLength: 8, format: "number" },
  { ai: "240", key: "additional_id", label: "Identificação adicional", maxLength: 30, format: "text" },
  { ai: "241", key: "customer_part", label: "Código do cliente", maxLength: 30, format: "text" },
  { ai: "7003", key: "expiration_datetime", label: "Validade com hora", fixedLength: 10, format: "text" },
  { ai: "710", key: "anvisa", label: "Registro ANVISA", maxLength: 20, format: "text" },
  { ai: "3103", key: "net_weight_kg", label: "Peso líquido (kg)", fixedLength: 6, format: "number", decimalIndicator: true },
];

const AI_BY_CODE = new Map(AI_TABLE.map((d) => [d.ai, d]));
const AI_LENGTHS = Array.from(new Set(AI_TABLE.map((d) => d.ai.length))).sort();

/** Separador de campo variável (FNC1). */
const FNC1 = "\u001d";

export interface GS1Element {
  ai: string;
  key: string;
  label: string;
  raw: string;
  value: string;
}

export interface GS1Result {
  /** true quando o conteúdo foi reconhecido como GS1 estruturado. */
  isGs1: boolean;
  /** Código original, sem prefixos de simbologia. */
  raw: string;
  elements: GS1Element[];
  gtin: string | null;
  batch: string | null;
  /** ISO yyyy-mm-dd. */
  expirationDate: string | null;
  manufactureDate: string | null;
  serial: string | null;
  quantity: number | null;
  /** AIs lidas mas ainda não usadas pelo sistema. */
  extras: Record<string, string>;
}

const EMPTY = (raw: string): GS1Result => ({
  isGs1: false,
  raw,
  elements: [],
  gtin: null,
  batch: null,
  expirationDate: null,
  manufactureDate: null,
  serial: null,
  quantity: null,
  extras: {},
});

/** Converte YYMMDD do GS1 em ISO (dia 00 = último dia do mês). */
export function gs1DateToISO(value: string): string | null {
  if (!/^\d{6}$/.test(value)) return null;
  const yy = Number(value.slice(0, 2));
  const mm = Number(value.slice(2, 4));
  let dd = Number(value.slice(4, 6));
  if (mm < 1 || mm > 12) return null;
  // Regra GS1: 51-99 => 19xx, 00-50 => 20xx
  const year = yy >= 51 ? 1900 + yy : 2000 + yy;
  if (dd === 0) dd = new Date(year, mm, 0).getDate();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${year}-${pad(mm)}-${pad(dd)}`;
}

/** Remove prefixos de simbologia e normaliza separadores. */
export function normalizeGs1(input: string): string {
  return input
    .replace(/^\]d2|^\]C1|^\]e0/i, "")
    .replace(/\u001d|\u241d|<GS>|\{GS\}/g, FNC1)
    .trim();
}

export const GS1Parser = {
  AI_TABLE,

  /** Interpreta um código lido. Nunca lança — retorna isGs1=false quando não é GS1. */
  parse(input: string): GS1Result {
    const raw = normalizeGs1(input ?? "");
    if (!raw) return EMPTY(raw);

    const elements: GS1Element[] = [];
    let i = 0;
    let recognized = 0;

    while (i < raw.length) {
      if (raw[i] === FNC1) {
        i += 1;
        continue;
      }
      let def: AIDefinition | undefined;
      let ai = "";
      for (const len of AI_LENGTHS) {
        const candidate = raw.slice(i, i + len);
        const found = AI_BY_CODE.get(candidate);
        if (found) {
          def = found;
          ai = candidate;
          break;
        }
      }
      if (!def) break; // conteúdo não estruturado a partir daqui
      i += ai.length;

      let value: string;
      if (def.fixedLength) {
        value = raw.slice(i, i + def.fixedLength);
        i += def.fixedLength;
      } else {
        const stop = raw.indexOf(FNC1, i);
        const end = stop === -1 ? Math.min(raw.length, i + (def.maxLength ?? 48)) : stop;
        value = raw.slice(i, end);
        i = end;
      }
      if (!value) break;
      recognized += 1;
      elements.push({ ai, key: def.key, label: def.label, raw: value, value });
    }

    if (recognized === 0) return EMPTY(raw);

    const byKey = new Map(elements.map((e) => [e.key, e.value]));
    const usedKeys = new Set([
      "gtin",
      "batch",
      "expiration_date",
      "manufacture_date",
      "serial",
      "quantity",
    ]);
    const extras: Record<string, string> = {};
    for (const el of elements) if (!usedKeys.has(el.key)) extras[el.key] = el.value;

    const qty = byKey.get("quantity");
    return {
      isGs1: true,
      raw,
      elements,
      gtin: byKey.get("gtin") ?? null,
      batch: byKey.get("batch") ?? null,
      expirationDate: gs1DateToISO(byKey.get("expiration_date") ?? ""),
      manufactureDate: gs1DateToISO(byKey.get("manufacture_date") ?? ""),
      serial: byKey.get("serial") ?? null,
      quantity: qty && /^\d+$/.test(qty) ? Number(qty) : null,
      extras,
    };
  },

  /**
   * Chaves de busca de produto a partir de qualquer leitura.
   * Um GTIN-14 com zeros à esquerda também deve casar com o EAN-13 cadastrado.
   */
  searchKeys(input: string): string[] {
    const result = GS1Parser.parse(input);
    const keys = new Set<string>();
    const base = result.isGs1 ? result.gtin : normalizeGs1(input);
    if (base) {
      keys.add(base);
      const trimmed = base.replace(/^0+/, "");
      if (trimmed) keys.add(trimmed);
      if (trimmed.length === 13) keys.add(trimmed.padStart(14, "0"));
      if (trimmed.length === 12) keys.add(trimmed.padStart(13, "0"));
    }
    return Array.from(keys).filter(Boolean);
  },
};
