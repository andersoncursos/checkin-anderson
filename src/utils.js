export function formatPhone(val) {
  const d = val.replace(/\D/g, "").slice(0, 11);
  if (d.length <= 2) return `(${d}`;
  if (d.length <= 7) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
}

export function cleanPhone(val) {
  return val.replace(/\D/g, "");
}

export function fmtDate(d) {
  if (!d) return "";
  const [y, m, dd] = d.split("-");
  return `${dd}/${m}`;
}

export function fmtDateFull(d) {
  if (!d) return "";
  const [y, m, dd] = d.split("-");
  return `${dd}/${m}/${y}`;
}

export function weekday(d) {
  const days = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
  return days[new Date(d + "T12:00:00").getDay()];
}

export function todayStr() {
  const d = new Date();
  return (
    d.getFullYear() +
    "-" +
    String(d.getMonth() + 1).padStart(2, "0") +
    "-" +
    String(d.getDate()).padStart(2, "0")
  );
}
