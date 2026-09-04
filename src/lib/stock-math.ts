export const PEG_ML = 30;
export const DEFAULT_BOTTLE_ML = 750;

export const ADD_REASONS = ["Refill", "New stock", "Manual correction", "Other"] as const;
export const REMOVE_REASONS = ["Broken", "Missing", "Manual correction", "Other"] as const;
export const VOID_REASONS = [
  "Entered on wrong product",
  "Wrong quantity",
  "Duplicate order",
  "Cancelled by guest",
  "Other",
] as const;

export type StockLevel = "HEALTHY" | "LOW" | "VERY_LOW" | "OUT" | "EXCEEDED";

export function liquorVolumeFromBottles(bottles: number, bottleSizeMl: number) {
  return bottles * bottleSizeMl;
}

export function liquorVolumeFromPegs(pegs: number, pegSizeMl = PEG_ML) {
  return pegs * pegSizeMl;
}

export function bottlesFromVolume(volumeMl: number, bottleSizeMl: number) {
  if (!bottleSizeMl) return 0;
  return volumeMl / bottleSizeMl;
}

export function pegsFromVolume(volumeMl: number, pegSizeMl = PEG_ML) {
  if (!pegSizeMl) return 0;
  return volumeMl / pegSizeMl;
}

export function theoreticalPegsPerBottle(bottleSizeMl: number, pegSizeMl = PEG_ML) {
  if (!pegSizeMl) return 0;
  return bottleSizeMl / pegSizeMl;
}

export function stockLevel(remaining: number, lowThreshold: number, veryLowThreshold: number): StockLevel {
  if (remaining < 0) return "EXCEEDED";
  if (remaining <= 0) return "OUT";
  if (remaining <= veryLowThreshold) return "VERY_LOW";
  if (remaining <= lowThreshold) return "LOW";
  return "HEALTHY";
}

export function remainingDisplay(args: {
  trackingType: "LIQUOR" | "BEER";
  estimatedVolumeMl: number | null;
  estimatedUnits: number | null;
  bottleSizeMl: number | null;
  pegSizeMl: number | null;
}) {
  if (args.trackingType === "LIQUOR") {
    const volume = args.estimatedVolumeMl ?? 0;
    const bottleSize = args.bottleSizeMl || DEFAULT_BOTTLE_ML;
    const pegSize = args.pegSizeMl || PEG_ML;
    return {
      remaining: bottlesFromVolume(volume, bottleSize),
      remainingLabel: `${bottlesFromVolume(volume, bottleSize).toFixed(2)} bottles`,
      secondaryLabel: `${Math.round(pegsFromVolume(volume, pegSize))} pegs`,
      unit: "bottles" as const,
      volumeMl: volume,
      pegs: pegsFromVolume(volume, pegSize),
    };
  }

  const units = args.estimatedUnits ?? 0;
  return {
    remaining: units,
    remainingLabel: `${Number.isInteger(units) ? units : units.toFixed(1)} units`,
    secondaryLabel: null as string | null,
    unit: "units" as const,
    volumeMl: null as number | null,
    pegs: null as number | null,
  };
}
