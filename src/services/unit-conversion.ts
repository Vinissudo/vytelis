/**
 * UnitConversionService — converte unidade de compra em unidade mínima de consumo.
 *
 * Regra hospitalar: o estoque é SEMPRE controlado pela menor unidade física
 * (comprimido, ampola, frasco, bolsa, unidade). Caixa/pacote/fardo existem
 * apenas como unidade de compra.
 */

export interface ConversionInput {
  /** Quantidade na unidade de compra (ex.: 2 caixas). */
  purchaseQuantity: number;
  /** Quantidade de unidades de consumo por embalagem de compra. */
  packageQuantity: number;
  purchaseUnit?: string | null;
  consumptionUnit?: string | null;
  allowsFractioning?: boolean;
}

export interface ConversionResult {
  consumptionQuantity: number;
  purchaseUnit: string;
  consumptionUnit: string;
  /** Texto pronto para exibição: "2 CX × 100 = 200 COMPRIMIDO". */
  describe: string;
}

/** Unidades que nunca podem ser unidade de consumo. */
export const PACKAGE_UNITS = ["CX", "CAIXA", "PC", "PACOTE", "FD", "FARDO", "DP", "DISPLAY"];

export function isPackageUnit(unit: string | null | undefined): boolean {
  if (!unit) return false;
  return PACKAGE_UNITS.includes(unit.trim().toUpperCase());
}

export const UnitConversionService = {
  convert(input: ConversionInput): ConversionResult {
    const pkg = Number(input.packageQuantity);
    const qty = Number(input.purchaseQuantity);
    if (!Number.isFinite(qty) || qty <= 0) {
      throw new Error("Quantidade de compra inválida.");
    }
    if (!Number.isFinite(pkg) || pkg <= 0) {
      throw new Error("Quantidade por embalagem inválida.");
    }
    let consumption = qty * pkg;
    if (!input.allowsFractioning) consumption = Math.round(consumption * 1000) / 1000;

    const purchaseUnit = (input.purchaseUnit ?? "UN").trim().toUpperCase() || "UN";
    const consumptionUnit = (input.consumptionUnit ?? "UN").trim().toUpperCase() || "UN";
    const describe =
      pkg === 1
        ? `${qty} ${consumptionUnit}`
        : `${qty} ${purchaseUnit} × ${pkg} = ${consumption} ${consumptionUnit}`;

    return { consumptionQuantity: consumption, purchaseUnit, consumptionUnit, describe };
  },

  /** Caminho inverso — usado em relatórios de compra. */
  toPurchaseUnits(consumptionQuantity: number, packageQuantity: number): number {
    if (!packageQuantity || packageQuantity <= 0) return consumptionQuantity;
    return consumptionQuantity / packageQuantity;
  },
};
