import { z } from 'zod';

// =============================================================================
// Shopware ID Validators
// =============================================================================

/**
 * Regex for Shopware hex ID (32 hex characters, no dashes)
 * Example: 019b83b4ae0c7f0b85d336b173f42694
 */
const SHOPWARE_HEX_ID_REGEX = /^[0-9a-f]{32}$/i;

/**
 * Regex for standard UUID with dashes (36 characters)
 * Example: 019b83b4-ae0c-7f0b-85d3-36b173f42694
 */
const STANDARD_UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Validates a Shopware ID (accepts both hex format and standard UUID format)
 * Converts standard UUID to hex format for Shopware API compatibility
 */
export function shopwareId(errorMessage = 'Invalid Shopware ID format') {
  return z
    .string()
    .refine(
      (val) => SHOPWARE_HEX_ID_REGEX.test(val) || STANDARD_UUID_REGEX.test(val),
      { message: errorMessage }
    )
    .transform((val) => {
      // Convert standard UUID to hex format (remove dashes)
      if (STANDARD_UUID_REGEX.test(val)) {
        return val.replace(/-/g, '');
      }
      return val;
    });
}

/**
 * Same as shopwareId but optional
 */
export function shopwareIdOptional(errorMessage = 'Invalid Shopware ID format') {
  return z
    .string()
    .refine(
      (val) => SHOPWARE_HEX_ID_REGEX.test(val) || STANDARD_UUID_REGEX.test(val),
      { message: errorMessage }
    )
    .transform((val) => {
      if (STANDARD_UUID_REGEX.test(val)) {
        return val.replace(/-/g, '');
      }
      return val;
    })
    .optional();
}
