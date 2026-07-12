/** Resolve image asset IDs from the stored jsonb array. */
export function resolveImageAssetIds(
  many: string[] | null | undefined,
): string[] {
  if (many && many.length > 0) return many;
  return [];
}
