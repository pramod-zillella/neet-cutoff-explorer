/* Pure filtering functions, shared by the browser and Node's test runner. */
(function (root) {
  "use strict";
  const ALL = "all";
  function query(data, filters) {
    const collegeIds = new Set(filters.colleges || []);
    const branchIds = new Set(filters.branches || []);
    const quotas = new Set(filters.quotas ?? data.quotas);
    const grouped = new Map();
    for (const row of data.rows) {
      const [year, round, ci, bi, qi, ki, opening, closing, count] = row;
      if (year !== Number(filters.year)) continue;
      if (!quotas.has(data.quotas[qi])) continue;
      if (filters.category !== ALL && data.categories[ki] !== filters.category) continue;
      const college = data.colleges[ci], branch = data.branches[bi];
      if (filters.view === "college" && college.id !== filters.college) continue;
      if (filters.view === "compare" && (!collegeIds.has(college.id) || branch.id !== filters.branch)) continue;
      if (filters.view === "state" && ((filters.state !== ALL && college.state !== filters.state) || (branchIds.size && !branchIds.has(branch.id)))) continue;
      const groupKey = [ci, bi, qi, ki].join(":");
      if (!grouped.has(groupKey)) grouped.set(groupKey, {college, branch, quota: data.quotas[qi], category: data.categories[ki], rounds: [null, null, null, null]});
      grouped.get(groupKey).rounds[round] = {opening, closing, count};
    }
    const search = (filters.search || "").trim().toLocaleLowerCase();
    return [...grouped.values()].filter(row => !search || [row.college.name, row.college.address, row.college.state, row.branch.name, row.quota, row.category].join(" ").toLocaleLowerCase().includes(search));
  }
  function sorted(rows, field = "name", direction = "asc", view = "college", metric = "closing") {
    const sign = direction === "desc" ? -1 : 1;
    const label = row => view === "college" ? row.branch.name : row.college.name;
    return [...rows].sort((a, b) => {
      let difference;
      if (field.startsWith("round")) {
        const round = Number(field.slice(5));
        const av = a.rounds[round]?.[metric === "count" ? "count" : "closing"];
        const bv = b.rounds[round]?.[metric === "count" ? "count" : "closing"];
        if (av == null && bv != null) return 1;
        if (bv == null && av != null) return -1;
        difference = (av ?? 0) - (bv ?? 0);
      } else difference = label(a).localeCompare(label(b));
      return difference * sign || label(a).localeCompare(label(b)) || a.branch.name.localeCompare(b.branch.name) || a.quota.localeCompare(b.quota) || a.category.localeCompare(b.category);
    });
  }
  function csv(rows, year) {
    const fields = ["Year", "College", "State", "Institute address", "Branch", "Allotted quota", "Allotted category"];
    for (const label of ["Round 1", "Round 2", "Round 3", "Stray"]) fields.push(`${label} opening rank`, `${label} closing rank`, `${label} allotments`);
    const safe = value => { const s = String(value ?? ""); return '"' + (/^[=+@\-\t\r]/.test(s) ? "'" : "") + s.replace(/"/g, '""') + '"'; };
    return "\uFEFF" + [fields, ...rows.map(row => [year, row.college.name, row.college.state, row.college.address, row.branch.name, row.quota, row.category, ...row.rounds.flatMap(r => r ? [r.opening, r.closing, r.count] : ["", "", ""])])].map(row => row.map(safe).join(",")).join("\r\n");
  }
  const api = {query, sorted, csv};
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.NEET_CORE = api;
})(typeof window === "undefined" ? globalThis : window);
