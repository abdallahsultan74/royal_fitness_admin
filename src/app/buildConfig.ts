/**
 * Build-time feature flags for production handover builds.
 *
 * Enable by setting: `VITE_ADMIN_DELIVERY=true`
 */
export const adminDelivery = import.meta.env.VITE_ADMIN_DELIVERY === "true";

/**
 * Local/demo auth is useful for UI work, but should not be enabled in delivery builds.
 */
export const localAuthEnabled =
  !adminDelivery && import.meta.env.VITE_LOCAL_AUTH === "true";

