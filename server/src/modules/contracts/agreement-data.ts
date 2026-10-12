export function residentialDetails(p: Record<string, any>) {
  return {
    governorate: p.governorate ?? "",
    district: p.district ?? "",
    neighborhood: p.neighborhood ?? "",
    alley: p.alley ?? "",
    house_number: p.houseNumber ?? "",
  };
}
export function residentialAddress(p: Record<string, any>) {
  return [
    ...new Set(
      [
        p.governorate,
        p.district,
        p.neighborhood,
        p.address,
        p.alley ? `زقاق ${p.alley}` : "",
        p.houseNumber ? `دار ${p.houseNumber}` : "",
      ].filter(Boolean),
    ),
  ].join("، ");
}
export function partyDocumentNumbers(
  person: Record<string, any>,
  docs: Record<string, any>[],
  types: Record<string, any>[],
) {
  const key = (d: Record<string, any>) =>
    types.find((t) => t.id === d.documentTypeId)?.key;
  return {
    identity:
      person.nationalId ||
      docs.find(
        (d) => ["national_id", "civil_id"].includes(key(d)) && d.documentNumber,
      )?.documentNumber ||
      "",
    residence:
      person.residenceCardNumber ||
      docs.find((d) => key(d) === "residence_card" && d.documentNumber)
        ?.documentNumber ||
      "",
  };
}

export function identitySidesComplete(
  docs: Record<string, any>[],
  identityNumber: string,
) {
  const sides = new Map<string, Set<string>>();
  for (const doc of docs) {
    if (doc.documentSide === "both") return true;
    const key = `${doc.documentTypeId}:${doc.documentNumber || identityNumber}`;
    const group = sides.get(key) ?? new Set<string>();
    group.add(doc.documentSide);
    sides.set(key, group);
  }
  return [...sides.values()].some(
    (group) => group.has("front") && group.has("back"),
  );
}
