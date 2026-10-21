/** يحوّل معرّف المسار إلى عدد صحيح موجب، أو null إن كان غير صالح. */
export function parseId(value: string) {
  const id = Number(value);
  return Number.isInteger(id) && id > 0 ? id : null;
}
