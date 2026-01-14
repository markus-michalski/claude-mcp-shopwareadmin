/**
 * Property group domain types
 *
 * Property groups are used for product attributes like:
 * - Size, Color, Material (for variants)
 * - Technical specs (for filters)
 */

/**
 * Full property group entity with options
 */
export interface PropertyGroup {
  id: string;
  name: string;
  description: string | null;
  displayType: PropertyDisplayType;
  sortingType: PropertySortingType;
  filterable: boolean;
  visibleOnProductDetailPage: boolean;
  position: number;
  options: PropertyOption[];
}

/**
 * Property option (value within a group)
 */
export interface PropertyOption {
  id: string;
  name: string;
  position: number;
  colorHexCode: string | null;
  mediaId: string | null;
}

/**
 * How properties are displayed in the storefront
 */
export type PropertyDisplayType = 'text' | 'image' | 'color' | 'media';

/**
 * How property options are sorted
 */
export type PropertySortingType = 'alphanumeric' | 'numeric' | 'position';

/**
 * Lightweight property group for list views
 */
export interface PropertyGroupListItem {
  id: string;
  name: string;
  optionCount: number;
  filterable: boolean;
}
