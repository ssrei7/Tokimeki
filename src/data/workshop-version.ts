function versionParts(version: string): [bigint, bigint, bigint] {
  const parts = version.split('.');
  if (parts.length !== 3 || parts.some((part) => !/^\d+$/.test(part))) throw new Error(`无效的工坊包版本：${version}`);
  return [BigInt(parts[0]), BigInt(parts[1]), BigInt(parts[2])];
}

export function compareWorkshopVersions(left: string, right: string): number {
  const leftParts = versionParts(left);
  const rightParts = versionParts(right);
  for (let index = 0; index < leftParts.length; index += 1) {
    if (leftParts[index] < rightParts[index]) return -1;
    if (leftParts[index] > rightParts[index]) return 1;
  }
  return 0;
}
