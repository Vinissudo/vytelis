/**
 * NFeParser — leitura de XML de Nota Fiscal Eletrônica (NF-e) de medicamentos.
 *
 * Parser puro (sem DOM), funciona no navegador e no servidor, e é a única
 * porta de entrada de XML do Motor de Recebimento.
 * Não realiza integração externa — apenas interpreta o arquivo enviado.
 */

export interface NFeSupplier {
  cnpj: string | null;
  name: string | null;
  fantasyName: string | null;
}

export interface NFeItem {
  /** Número do item na nota. */
  number: number;
  supplierCode: string | null;
  gtin: string | null;
  description: string;
  purchaseUnit: string | null;
  purchaseQuantity: number;
  unitCost: number | null;
  totalValue: number | null;
  batch: string | null;
  expirationDate: string | null;
  manufactureDate: string | null;
  /** Quantidade do lote informada no grupo <rastro>, quando existir. */
  batchQuantity: number | null;
  anvisaCode: string | null;
}

export interface NFeDocument {
  key: string | null;
  number: string | null;
  series: string | null;
  issueDate: string | null;
  totalValue: number | null;
  supplier: NFeSupplier;
  items: NFeItem[];
}

function stripComments(xml: string): string {
  return xml.replace(/<!--[\s\S]*?-->/g, "");
}

function tagValue(scope: string, tag: string): string | null {
  const m = new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)</${tag}>`, "i").exec(scope);
  if (!m) return null;
  const value = m[1]
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .trim();
  return value === "" ? null : value;
}

function blocks(scope: string, tag: string): string[] {
  const re = new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)</${tag}>`, "gi");
  const out: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(scope)) !== null) out.push(m[1]);
  return out;
}

function num(value: string | null): number | null {
  if (value == null) return null;
  const n = Number(value.replace(",", "."));
  return Number.isFinite(n) ? n : null;
}

function isoDate(value: string | null): string | null {
  if (!value) return null;
  const iso = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  const br = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(value);
  if (br) return `${br[3]}-${br[2]}-${br[1]}`;
  return null;
}

function cleanGtin(value: string | null): string | null {
  if (!value) return null;
  const v = value.trim().toUpperCase();
  if (!/^\d{8,14}$/.test(v)) return null; // ignora "SEM GTIN"
  return v;
}

export const NFeParser = {
  /** Interpreta o XML de uma NF-e. Lança erro em conteúdo inválido. */
  parse(xmlRaw: string): NFeDocument {
    const xml = stripComments(xmlRaw ?? "");
    if (!/<(infNFe|NFe|nfeProc)/i.test(xml)) {
      throw new Error("Arquivo XML inválido: não parece uma NF-e.");
    }

    const infBlock = blocks(xml, "infNFe")[0] ?? xml;
    const keyAttr = /<infNFe[^>]*\bId="?NFe(\d{44})"?/i.exec(xml)?.[1] ?? null;

    const ideBlock = blocks(infBlock, "ide")[0] ?? "";
    const emitBlock = blocks(infBlock, "emit")[0] ?? "";
    const totalBlock = blocks(infBlock, "ICMSTot")[0] ?? "";

    const items: NFeItem[] = [];
    const detRe = /<det\b[^>]*\bnItem="?(\d+)"?[^>]*>([\s\S]*?)<\/det>/gi;
    let det: RegExpExecArray | null;
    while ((det = detRe.exec(infBlock)) !== null) {
      const number = Number(det[1]);
      const scope = det[2];
      const prod = blocks(scope, "prod")[0] ?? scope;
      const med = blocks(prod, "med")[0] ?? "";
      const rastro = blocks(prod, "rastro")[0] ?? "";

      const quantity = num(tagValue(prod, "qCom")) ?? 0;
      if (quantity <= 0) continue;

      items.push({
        number,
        supplierCode: tagValue(prod, "cProd"),
        gtin: cleanGtin(tagValue(prod, "cEAN")) ?? cleanGtin(tagValue(prod, "cEANTrib")),
        description: tagValue(prod, "xProd") ?? "Item sem descrição",
        purchaseUnit: tagValue(prod, "uCom"),
        purchaseQuantity: quantity,
        unitCost: num(tagValue(prod, "vUnCom")),
        totalValue: num(tagValue(prod, "vProd")),
        batch: tagValue(rastro, "nLote"),
        expirationDate: isoDate(tagValue(rastro, "dVal")),
        manufactureDate: isoDate(tagValue(rastro, "dFab")),
        batchQuantity: num(tagValue(rastro, "qLote")),
        anvisaCode: tagValue(med, "cProdANVISA"),
      });
    }

    return {
      key: keyAttr ?? tagValue(xml, "chNFe"),
      number: tagValue(ideBlock, "nNF"),
      series: tagValue(ideBlock, "serie"),
      issueDate: isoDate(tagValue(ideBlock, "dhEmi") ?? tagValue(ideBlock, "dEmi")),
      totalValue: num(tagValue(totalBlock, "vNF")),
      supplier: {
        cnpj: tagValue(emitBlock, "CNPJ"),
        name: tagValue(emitBlock, "xNome"),
        fantasyName: tagValue(emitBlock, "xFant"),
      },
      items,
    };
  },
};
