// السن محسوب في 1/10 من السنة الدراسية الحالية
export function schoolYearReferenceDate(now: Date = new Date()): Date {
  const year = now.getMonth() + 1 >= 9 ? now.getFullYear() : now.getFullYear() - 1;
  return new Date(year, 9, 1); // October = month index 9, day 1
}

export function schoolYearLabel(now: Date = new Date()): string {
  const y = now.getMonth() + 1 >= 9 ? now.getFullYear() : now.getFullYear() - 1;
  return `${y}/${y + 1}`;
}

export function calcAge(birthDate: string | null | undefined): { years: number; months: number; days: number } | null {
  if (!birthDate) return null;
  const b = new Date(birthDate);
  if (Number.isNaN(b.getTime())) return null;
  const ref = schoolYearReferenceDate();
  let years = ref.getFullYear() - b.getFullYear();
  let months = ref.getMonth() - b.getMonth();
  let days = ref.getDate() - b.getDate();
  if (days < 0) { months -= 1; days += new Date(ref.getFullYear(), ref.getMonth(), 0).getDate(); }
  if (months < 0) { years -= 1; months += 12; }
  return { years, months, days };
}

export function formatAge(birthDate: string | null | undefined): string {
  const a = calcAge(birthDate);
  if (!a) return "—";
  return `${a.years} سنة و ${a.months} شهر`;
}
