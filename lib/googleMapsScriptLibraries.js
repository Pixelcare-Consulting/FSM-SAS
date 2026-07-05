/**
 * Stable `libraries` array for @react-google-maps/api useLoadScript / LoadScript.
 * The loader warns when this prop changes identity between renders; HMR or duplicated
 * module instances can recreate module-level arrays. A tab-global singleton fixes that.
 */
const GLOBAL_KEY = "__PXC_SAS_GOOGLE_MAPS_SCRIPT_LIBRARIES__";

export function getGoogleMapsScriptLibraries() {
  const g = typeof globalThis !== "undefined" ? globalThis : global;
  if (!g[GLOBAL_KEY]) {
    g[GLOBAL_KEY] = ["places", "marker"];
  }
  return g[GLOBAL_KEY];
}
