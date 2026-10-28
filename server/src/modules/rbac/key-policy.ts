// Historical metadata namespaces remain reserved after their modules were
// removed. This denylist prevents reactivation through permissions or restored
// settings; custom keys outside these namespaces keep their original behavior.
// The current contracts feature uses its own namespace, "agreements", so the
// retired system's leftover rows stay inactive.
const RETIRED_METADATA_NAMESPACES = new Set([
  "contracts",
  "contract_templates",
  "legal_content",
  "legal_formulations",
  "formulations",
  "studio",
]);

function isActiveMetadataKey(key: string) {
  return !RETIRED_METADATA_NAMESPACES.has(
    key.trim().toLowerCase().split(".", 1)[0],
  );
}

export function isActivePermissionKey(key: string) {
  return isActiveMetadataKey(key);
}

export function isActiveSettingKey(key: string) {
  return isActiveMetadataKey(key);
}
