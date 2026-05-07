const hebrewLocale = "he-IL";
const defaultTimeZone = "Asia/Jerusalem";

function toDate(value: Date | string | number): Date {
  const date = value instanceof Date ? value : new Date(value);

  if (Number.isNaN(date.getTime())) {
    throw new TypeError("Invalid date value");
  }

  return date;
}

export function formatIlsCurrency(value: number): string {
  return new Intl.NumberFormat(hebrewLocale, {
    style: "currency",
    currency: "ILS",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value);
}

export function formatHebrewDate(value: Date | string | number): string {
  return new Intl.DateTimeFormat(hebrewLocale, {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    timeZone: defaultTimeZone,
  }).format(toDate(value));
}

export function formatHebrewWeekday(value: Date | string | number): string {
  return new Intl.DateTimeFormat(hebrewLocale, {
    weekday: "long",
    timeZone: defaultTimeZone,
  }).format(toDate(value));
}
