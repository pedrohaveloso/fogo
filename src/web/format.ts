const integer = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 0 });
const decimal = new Intl.NumberFormat("pt-BR", {
  maximumFractionDigits: 1,
  minimumFractionDigits: 1,
});
const time = new Intl.DateTimeFormat("pt-BR", {
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "America/Sao_Paulo",
});
const dateTime = new Intl.DateTimeFormat("pt-BR", {
  day: "2-digit",
  month: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "America/Sao_Paulo",
});
const shortDate = new Intl.DateTimeFormat("pt-BR", {
  day: "2-digit",
  month: "2-digit",
  timeZone: "UTC",
});

export function formatInteger(value: number): string {
  return integer.format(value);
}

const compact = new Intl.NumberFormat("pt-BR", { notation: "compact", maximumFractionDigits: 1 });

export function formatCompact(value: number): string {
  return compact.format(value);
}

export function formatDecimal(value: number): string {
  return decimal.format(value);
}

export function formatPercent(value: number, digits = 0): string {
  return `${value.toFixed(digits).replace(".", ",")}%`;
}

const clock = new Intl.DateTimeFormat("pt-BR", {
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  timeZone: "America/Sao_Paulo",
});

export function formatClock(iso: string): string {
  return clock.format(new Date(iso));
}

export function formatTime(iso: string): string {
  return time.format(new Date(iso));
}

export function formatDateTime(iso: string): string {
  return dateTime.format(new Date(iso));
}

export function formatDate(date: string | null): string {
  if (!date) {
    return "—";
  }
  const [year, month, day] = date.split("-");
  return `${day}/${month}/${year}`;
}

export function formatShortDate(date: string): string {
  return shortDate.format(new Date(`${date}T12:00:00Z`));
}

export function formatRelative(iso: string | null, now: number): string {
  if (!iso) {
    return "sem registro";
  }
  const seconds = Math.max(0, Math.round((now - Date.parse(iso)) / 1000));
  if (seconds < 60) {
    return "agora há pouco";
  }
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) {
    return `há ${minutes} min`;
  }
  const hours = Math.floor(minutes / 60);
  if (hours < 48) {
    return `há ${hours} h`;
  }
  return `há ${Math.floor(hours / 24)} dias`;
}

export function formatHour(hour: number): string {
  return `${String(hour).padStart(2, "0")}h`;
}

export function formatSigned(value: number): string {
  if (value > 0) {
    return `+${integer.format(value)}`;
  }
  if (value < 0) {
    return `−${integer.format(-value)}`;
  }
  return "0";
}

export function formatMaintenanceDue(days: number): string {
  if (days < 0) {
    return `vencida há ${-days} ${days === -1 ? "dia" : "dias"}`;
  }
  if (days === 0) {
    return "hoje";
  }
  return days === 1 ? "amanhã" : `em ${days} dias`;
}
