import type { AvailabilityStatus } from "../types/shop";

// Uniform, shop-independent label per status. Every adapter translates its
// own raw data (see RECON.md) into one of these 4 values.
export const STATUS_LABELS: Record<AvailabilityStatus, string> = {
  in_stock: "Auf Lager",
  preorder: "Vorbestellung",
  processing: "Wird nachbestellt (Lieferzeit ungewiss)",
  last_copy: "Letztes Exemplar",
};

// Green for "can ship right away", amber for "may take a while".
export const STATUS_COLORS: Record<AvailabilityStatus, string> = {
  in_stock: "#7bc87b",
  last_copy: "#7bc87b",
  preorder: "#d9b25c",
  processing: "#d9b25c",
};
