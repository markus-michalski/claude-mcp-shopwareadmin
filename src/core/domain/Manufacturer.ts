/**
 * Manufacturer domain types
 */

/**
 * Full manufacturer entity
 */
export interface Manufacturer {
  id: string;
  name: string;
  link: string | null;
  description: string | null;
  media: ManufacturerMedia | null;
}

/**
 * Manufacturer media (logo)
 */
export interface ManufacturerMedia {
  id: string;
  url: string | null;
  alt: string | null;
}

/**
 * Lightweight manufacturer for list views
 */
export interface ManufacturerListItem {
  id: string;
  name: string;
  link: string | null;
  productCount: number;
}
