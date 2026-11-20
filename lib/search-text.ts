export function normalizeSearch(value: string) {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9\p{L}]+/gu, " ")
    .trim();
}
export function matchesSearch(
  query: string,
  fields: (string | null | undefined)[],
) {
  const tokens = normalizeSearch(query).split(/\s+/).filter(Boolean);
  const text = normalizeSearch(fields.filter(Boolean).join(" "));
  return tokens.every((token) => text.includes(token));
}

/** Exact names, aliases and prefixes precede broad token matches. No paid placements. */
export function searchRelevance(
  query: string,
  name: string,
  aliases: string[] = [],
) {
  const q = normalizeSearch(query);
  if (!q) return 0;
  const names = [name, ...aliases].map(normalizeSearch);
  return Math.max(
    ...names.map((n) =>
      n === q
        ? 100
        : n.startsWith(q)
          ? 70
          : n.split(" ").some((w) => w === q)
            ? 40
            : n.includes(q)
              ? 20
              : 0,
    ),
  );
}

/** Conservative typo suggestions; never silently relax an applicant’s constraints. */
function typoDistance(a: string, b: string): number {
 if (Math.abs(a.length-b.length)>2) return 3;
 let previous=Array.from({length:b.length+1},(_,i)=>i);
 for(let i=1;i<=a.length;i++){const row=[i];for(let j=1;j<=b.length;j++)row[j]=Math.min(row[j-1]+1,previous[j]+1,previous[j-1]+(a[i-1]===b[j-1]?0:1));previous=row;}
 return previous[b.length];
}
export function spellingSuggestions<T extends {name:string;short_name?:string|null;aliases?:string[]}>(query:string,rows:T[]):T[]{
 const tokens=normalizeSearch(query).split(' ').filter(Boolean);if(!tokens.length||tokens.length>5)return [];
 return rows.map(row=>{const words=normalizeSearch([row.name,row.short_name,...(row.aliases||[])].filter(Boolean).join(' ')).split(' ');const distances=tokens.map(t=>Math.min(...words.map(w=>t===w?0:t.length<4?3:typoDistance(t,w))));return {row,cost:distances.reduce((a,b)=>a+b,0),valid:distances.every(d=>d<=1)};}).filter(r=>r.valid&&r.cost>0&&r.cost<=2).sort((a,b)=>a.cost-b.cost||a.row.name.localeCompare(b.row.name)).slice(0,5).map(r=>r.row);
}
