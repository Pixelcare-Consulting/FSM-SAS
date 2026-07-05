/**
 * Merge or remove a single row in a cached paginated list payload.
 * Mirrors follow-ups patchOrRemoveRow behavior (page-1 inserts, in-place updates).
 */
export function patchListData(oldData, row, { idField = 'id', itemsKey, eventType = 'UPDATE' } = {}) {
  if (!oldData || !itemsKey) return oldData;

  const items = oldData[itemsKey] || [];
  const page = oldData.page ?? 1;
  const limit = oldData.limit ?? (items.length || 25);
  const rowId = row?.[idField];

  if (eventType === 'DELETE' || row?.deleted_at) {
    if (rowId == null) return oldData;
    const hadRow = items.some((item) => item[idField] === rowId);
    return {
      ...oldData,
      [itemsKey]: items.filter((item) => item[idField] !== rowId),
      totalCount: Math.max(0, (oldData.totalCount ?? 0) - (hadRow ? 1 : 1)),
    };
  }

  if (!row || rowId == null) return oldData;

  if (eventType === 'INSERT') {
    const exists = items.some((item) => item[idField] === rowId);
    if (exists) {
      return {
        ...oldData,
        [itemsKey]: items.map((item) => (item[idField] === rowId ? row : item)),
      };
    }
    if (page === 1) {
      return {
        ...oldData,
        [itemsKey]: [row, ...items].slice(0, limit),
        totalCount: (oldData.totalCount ?? 0) + 1,
      };
    }
    return {
      ...oldData,
      totalCount: (oldData.totalCount ?? 0) + 1,
    };
  }

  const idx = items.findIndex((item) => item[idField] === rowId);
  if (idx >= 0) {
    const next = [...items];
    next[idx] = row;
    return { ...oldData, [itemsKey]: next };
  }
  return oldData;
}

/** Patch a row across all cached queries matching keyPrefix. */
export function patchListPage(queryClient, keyPrefix, row, options = {}) {
  const { idField = 'id', itemsKey, eventType = 'UPDATE' } = options;
  queryClient.setQueriesData(keyPrefix, (oldData) =>
    patchListData(oldData, row, { idField, itemsKey, eventType })
  );
}

/** Remove a row by id across all cached queries matching keyPrefix. */
export function removeListRow(queryClient, keyPrefix, rowId, options = {}) {
  const idField = options.idField || 'id';
  patchListPage(
    queryClient,
    keyPrefix,
    { [idField]: rowId },
    { ...options, eventType: 'DELETE' }
  );
}
