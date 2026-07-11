import type { AvailabilityStatus } from "../types/shop";

// Einheitliche, shop-übergreifende Beschriftung pro Status. Jeder Adapter
// übersetzt seine eigenen Rohdaten (siehe RECON.md) in einen dieser 4 Werte.
export const STATUS_LABELS: Record<AvailabilityStatus, string> = {
  in_stock: "Auf Lager",
  preorder: "Vorbestellung",
  processing: "Wird nachbestellt (Lieferzeit ungewiss)",
  last_copy: "Letztes Exemplar",
};

// Grün für "kann sofort kommen", Amber für "kann dauern".
export const STATUS_COLORS: Record<AvailabilityStatus, string> = {
  in_stock: "#7bc87b",
  last_copy: "#7bc87b",
  preorder: "#d9b25c",
  processing: "#d9b25c",
};
