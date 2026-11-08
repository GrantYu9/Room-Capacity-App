import buildingAliases from "../data/building-aliases.json" with { type: "json" };

// Treat accents, case and punctuation consistently in names, aliases and queries.
export function normalizeSearch(value) {
  return String(value ?? "")
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

const aliasesByBuilding = new Map(buildingAliases.map((entry) => [normalizeSearch(entry.building), entry]));
const aliasesByCode = new Map(buildingAliases.map((entry) => [entry.code.toLowerCase(), entry]));

function aliasesFor(room, building) {
  const code = normalizeSearch(room.name).split(" ")[0];
  const idCode = normalizeSearch(room.room_id).split(" ")[1];
  const entry = aliasesByBuilding.get(normalizeSearch(building)) ||
    aliasesByCode.get(code) || aliasesByCode.get(idCode);
  return entry ? [entry.code, entry.building, ...entry.aliases] : [];
}

// Bounded Damerau-Levenshtein distance also accepts adjacent swapped letters.
function withinEdits(left, right, limit) {
  if (Math.abs(left.length - right.length) > limit) return false;
  const rows = Array.from({ length: left.length + 1 }, () => []);
  for (let i = 0; i <= left.length; i++) rows[i][0] = i;
  for (let j = 0; j <= right.length; j++) rows[0][j] = j;
  for (let i = 1; i <= left.length; i++) {
    for (let j = 1; j <= right.length; j++) {
      rows[i][j] = Math.min(
        rows[i - 1][j] + 1,
        rows[i][j - 1] + 1,
        rows[i - 1][j - 1] + (left[i - 1] === right[j - 1] ? 0 : 1),
      );
      if (i > 1 && j > 1 && left[i - 1] === right[j - 2] && left[i - 2] === right[j - 1]) {
        rows[i][j] = Math.min(rows[i][j], rows[i - 2][j - 2] + 1);
      }
    }
  }
  return rows[left.length][right.length] <= limit;
}

export function matchesRoomSearch(room, query) {
  const terms = normalizeSearch(query).split(" ").filter(Boolean);
  if (!terms.length) return true;
  const location = room.location ?? room;
  const fields = [room.name, location.building, location.room_number, location.address, ...aliasesFor(room, location.building)];
  const words = normalizeSearch(fields.filter(Boolean).join(" ")).split(" ");
  return terms.every((term) => words.some((word) => {
    // Numbers and short codes stay precise; ordinary words support partial input.
    if (/\d/u.test(term)) return word === term;
    if (word.includes(term)) return true;
    if (term.length < 4 || word.length < 4 || /\d/u.test(word)) return false;
    const edits = term.length >= 8 ? 2 : 1;
    return withinEdits(term, word, edits);
  }));
}
