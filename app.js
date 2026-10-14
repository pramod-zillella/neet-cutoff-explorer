(() => {
  "use strict";
  const $ = id => document.getElementById(id);
  const data = window.NEET_DATA, core = window.NEET_CORE;
  if (!data || !core) {
    $("results-title").textContent = "Allocation data could not be loaded";
    $("results-description").textContent = "Keep index.html, the scripts and the data folder together, then reload the page.";
    $("stats").innerHTML = "";
    return;
  }
  const escape = value => String(value ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#39;"})[c]);
  const format = value => Number(value).toLocaleString("en-IN");
  const colleges = new Map(data.colleges.map(c => [c.id, c]));
  const branches = new Map(data.branches.map(b => [b.id, b]));
  const states = [...new Set(data.colleges.map(c => c.state))].sort();
  const defaultCollege = data.colleges.find(c => /osmania/i.test(c.name)) || data.colleges[0];
  const defaultBranch = data.branches.find(b => b.name === "MD · General Medicine") || data.branches[0];
  const comparison = [defaultCollege, data.colleges.find(c => /gandhi medical college/i.test(c.name) && c.state === defaultCollege.state), data.colleges.find(c => /kakatiya medical/i.test(c.name))].filter(Boolean).map(c => c.id);
  const defaults = () => ({view:"college", year:data.years[0], college:defaultCollege.id, colleges:comparison.slice(), branch:defaultBranch.id, state:defaultCollege.state, branches:[defaultBranch.id], quotas:data.quotas.slice(), category:"Open", metric:"closing", search:"", sort:"name", direction:"asc"});
  let filters = defaults(), rows = [], renderedRows = 0, scrollFrame = 0, toastTimer;
  const rowBatchSize = 100;
  const available = new Map(data.years.map(year => [year, {colleges:new Set(), branches:new Set()}]));
  for (const row of data.rows) {
    available.get(row[0]).colleges.add(data.colleges[row[2]].id);
    available.get(row[0]).branches.add(data.branches[row[3]].id);
  }
  function readHash() {
    const next = defaults(), params = new URLSearchParams(location.hash.slice(1));
    if (["college", "compare", "state"].includes(params.get("view"))) next.view = params.get("view");
    if (data.years.includes(Number(params.get("year")))) next.year = Number(params.get("year"));
    if (colleges.has(params.get("college"))) next.college = params.get("college");
    if (params.has("colleges")) next.colleges = [...new Set(params.get("colleges").split(","))].filter(id => colleges.has(id));
    if (branches.has(params.get("branch"))) next.branch = params.get("branch");
    if (params.has("branches")) next.branches = [...new Set(params.get("branches").split(","))].filter(id => branches.has(id));
    if (["all", ...states].includes(params.get("state"))) next.state = params.get("state");
    // Repeated quota parameters support multiple selections and existing single-quota links.
    const requestedQuotas = params.getAll("quota");
    if (params.has("quota") && !requestedQuotas.includes("all")) next.quotas = data.quotas.filter(quota => requestedQuotas.includes(quota));
    if (["all", ...data.categories].includes(params.get("category"))) next.category = params.get("category");
    if (["closing", "range", "count"].includes(params.get("metric"))) next.metric = params.get("metric");
    if (["name", "round0", "round1", "round2", "round3"].includes(params.get("sort"))) next.sort = params.get("sort");
    if (["asc", "desc"].includes(params.get("direction"))) next.direction = params.get("direction");
    next.search = (params.get("search") || "").slice(0, 300);
    filters = next;
  }
  function writeHash() {
    const params = new URLSearchParams();
    for (const name of ["view", "year", "category", "metric", "sort", "direction"]) params.set(name, filters[name]);
    if (filters.quotas.length === data.quotas.length) params.set("quota", "all");
    else if (!filters.quotas.length) params.set("quota", "none");
    else for (const quota of filters.quotas) params.append("quota", quota);
    if (filters.view === "college") params.set("college", filters.college);
    if (filters.view === "compare") {params.set("colleges", filters.colleges.join(",")); params.set("branch", filters.branch);}
    if (filters.view === "state") {params.set("state", filters.state); params.set("branches", filters.branches.join(","));}
    if (filters.search) params.set("search", filters.search);
    const hash = "#" + params.toString();
    if (location.hash !== hash) {
      try { history.replaceState(null, "", hash); } catch { location.hash = hash; }
    }
  }
  function options(id, items, selected, allLabel) {
    $(id).innerHTML = (allLabel ? `<option value="all">${escape(allLabel)}</option>` : "") + items.map(item => {
      const value = typeof item === "object" ? item.id : item, name = typeof item === "object" ? item.name : item;
      return `<option value="${escape(value)}">${escape(name)}</option>`;
    }).join("");
    $(id).value = selected;
  }
  function toast(message) {
    clearTimeout(toastTimer); $("toast").textContent = message; $("toast").hidden = false;
    toastTimer = setTimeout(() => $("toast").hidden = true, 6000);
  }
  class Picker {
    constructor(id, searchId, placeholder, multiple, items, getSelected, select) {
      this.element = $(id); this.multiple = multiple; this.items = items; this.getSelected = getSelected; this.select = select;
      this.element.innerHTML = `<div class="picker"><div class="selected-items"></div><input id="${searchId}" type="search" placeholder="${placeholder}" autocomplete="off" aria-controls="${id}-options"><div class="picker-list" id="${id}-options" aria-label="Matching options"></div></div>`;
      this.input = this.element.querySelector("input"); this.list = this.element.querySelector(".picker-list");
      this.input.addEventListener("input", () => this.renderOptions());
      this.input.addEventListener("focus", () => this.renderOptions());
      this.element.addEventListener("click", event => {
        const remove = event.target.closest("[data-remove]");
        if (remove) {this.select(this.getSelected().filter(id => id !== remove.dataset.remove)); this.refresh(); return;}
        const choice = event.target.closest("button[data-id]");
        if (choice) {this.select([choice.dataset.id]); this.input.value = ""; this.refresh(); this.input.focus();}
      });
      this.element.addEventListener("change", event => {
        if (!event.target.matches("input[data-id]")) return;
        const id = event.target.dataset.id, selected = this.getSelected();
        this.select(event.target.checked ? [...new Set([...selected, id])] : selected.filter(value => value !== id));
        this.refresh();
      });
      this.input.addEventListener("keydown", event => {
        if (event.key === "ArrowDown") {event.preventDefault(); this.list.querySelector("button, input")?.focus();}
        if (event.key === "Escape") {this.input.value = ""; this.renderOptions();}
      });
    }
    refresh() {
      const items = this.items(), selected = this.getSelected();
      this.element.querySelector(".selected-items").innerHTML = selected.map(id => {
        const item = items.find(i => i.id === id) || colleges.get(id) || branches.get(id);
        if (!item) return "";
        const present = item.state ? available.get(filters.year).colleges.has(id) : available.get(filters.year).branches.has(id);
        return `<div class="selected-item" title="${escape(item.address || item.sourceName || item.name)}"><span>${escape(item.name)}${item.state ? `<small>${escape(item.state)}</small>` : ""}${!present ? `<small>No allotments in ${filters.year}</small>` : ""}</span>${this.multiple ? `<button type="button" class="remove-item" data-remove="${id}" aria-label="Remove ${escape(item.name)}">×</button>` : ""}</div>`;
      }).join("");
      this.renderOptions();
    }
    renderOptions() {
      const search = this.input.value.trim().toLocaleLowerCase(), selected = this.getSelected();
      const matches = this.items().filter(item => [item.name, item.state, item.address, item.sourceName].filter(Boolean).join(" ").toLocaleLowerCase().includes(search));
      // A single selected college needs no long menu until the user searches.
      const hide = !this.multiple && !search && selected.length;
      this.list.hidden = Boolean(hide);
      if (hide) return;
      this.list.innerHTML = matches.slice(0, 35).map(item => {
        const checked = selected.includes(item.id), detail = item.state ? `${item.state} · ${item.address}` : item.sourceName;
        const label = `<span>${escape(item.name)}<small>${escape(detail && detail.length > 155 ? detail.slice(0,155) + "…" : detail || "")}</small></span>`;
        return this.multiple ? `<label class="picker-option ${checked ? "selected" : ""}" title="${escape(detail)}"><input type="checkbox" data-id="${item.id}" ${checked ? "checked" : ""}>${label}</label>` : `<button type="button" class="picker-option ${checked ? "selected" : ""}" data-id="${item.id}" title="${escape(detail)}">${label}</button>`;
      }).join("") || '<p class="picker-empty">No matches. Try a college name, city or another year.</p>';
      if (matches.length > 35) this.list.insertAdjacentHTML("beforeend", `<p class="picker-hint">${format(matches.length)} matches. Type to narrow the list.</p>`);
    }
  }
  const yearColleges = () => data.colleges.filter(c => available.get(filters.year).colleges.has(c.id));
  const yearBranches = () => data.branches.filter(b => available.get(filters.year).branches.has(b.id));
  const collegePicker = new Picker("college-picker", "college-search", "Find a college…", false, yearColleges, () => [filters.college], selected => change("college", selected[0]));
  const comparePicker = new Picker("compare-picker", "compare-search", "Add a college…", true, yearColleges, () => filters.colleges, selected => change("colleges", selected));
  const branchPicker = new Picker("branch-picker", "branch-search", "Find a branch…", true, yearBranches, () => filters.branches, selected => change("branches", selected));
  $("quota-options").innerHTML = data.quotas.map(quota => `<label class="picker-option"><input type="checkbox" name="quota" value="${escape(quota)}"><span>${escape(quota)}</span></label>`).join("");
  function syncQuotas() {
    const selected = new Set(filters.quotas);
    $("quota-selection").textContent = selected.size === data.quotas.length ? "All quotas" : !selected.size ? "Choose quotas" : selected.size === 1 ? filters.quotas[0] : `${selected.size} quotas selected`;
    for (const input of $("quota-options").querySelectorAll("input")) {
      input.checked = selected.has(input.value);
      input.closest("label").classList.toggle("selected", input.checked);
    }
  }
  $("quota-options").addEventListener("change", () => change("quotas", [...$("quota-options").querySelectorAll("input:checked")].map(input => input.value)));
  $("quota-all").addEventListener("click", () => change("quotas", data.quotas.slice()));
  $("quota-clear").addEventListener("click", () => change("quotas", []));
  $("quota-picker").addEventListener("keydown", event => {
    if (event.key === "Escape") {$("quota-picker").open = false; $("quota-summary").focus();}
  });
  document.addEventListener("click", event => {
    if (!$("quota-picker").contains(event.target)) $("quota-picker").open = false;
  });
  function syncControls() {
    options("year", data.years, filters.year);
    options("category", data.categories, filters.category, "All categories (separate rows)");
    syncQuotas();
    options("state", states, filters.state, "All states / union territories");
    options("compare-branch", data.branches, filters.branch);
    $("metric").value = filters.metric; $("result-search").value = filters.search;
    $("year").disabled = false; $("share").disabled = false;
    for (const button of document.querySelectorAll("[data-view]")) {
      const active = button.dataset.view === filters.view;
      button.classList.toggle("active", active); button.setAttribute("aria-pressed", String(active));
    }
    for (const view of ["college", "compare", "state"]) $(`${view}-panel`).hidden = view !== filters.view;
    collegePicker.refresh(); comparePicker.refresh(); branchPicker.refresh();
  }
  function change(name, value) {
    filters[name] = value;
    if (name === "view") {filters.search = ""; filters.sort = "name"; filters.direction = "asc";}
    if (["year", "view"].includes(name)) syncControls();
    if (name === "quotas") syncQuotas();
    render();
  }
  function render() {
    rows = core.sorted(core.query(data, filters), filters.sort, filters.direction, filters.view, filters.metric);
    const collegeCount = new Set(rows.map(r => r.college.id)).size, branchCount = new Set(rows.map(r => r.branch.id)).size;
    const allocationCount = rows.reduce((sum, row) => sum + row.rounds.reduce((n,r) => n + (r?.count || 0), 0), 0);
    $("stats").innerHTML = [["Colleges in view",collegeCount,""],["Branches / courses",branchCount,""],["Allotments",allocationCount,"across 4 rounds"]].map(([name, value, caption]) => `<div class="stat"><span>${name}</span><strong>${format(value)}</strong>${caption ? `<small>${caption}</small>` : ""}</div>`).join("");
    const selectedCollege = colleges.get(filters.college);
    const headings = {college:["COLLEGE OVERVIEW", selectedCollege?.name || "Choose a college", selectedCollege?.address || "Select an institution to view all courses."], compare:["COLLEGE COMPARISON", branches.get(filters.branch)?.name || "Compare colleges", `${filters.colleges.length} selected colleges · ${filters.year} round-by-round cutoffs`], state:["EXPLORE A STATE", filters.state === "all" ? "All states & union territories" : filters.state, `${filters.branches.length ? filters.branches.map(id => branches.get(id)?.name).filter(Boolean).join(" · ") : "All branches / courses"} · ${filters.year}`]};
    const [eyebrow, title, description] = headings[filters.view];
    $("results-eyebrow").textContent = eyebrow; $("results-title").textContent = title; $("results-description").textContent = description;
    const quotaLabels = filters.quotas.length === data.quotas.length ? ["All quotas"] : filters.quotas.length ? filters.quotas : ["No quotas selected"];
    $("active-filters").innerHTML = `<span class="filter-pill year">${filters.year}</span>` + [filters.category === "all" ? "All categories" : filters.category, ...quotaLabels, {closing:"Closing rank",range:"Opening – closing",count:"Allotment count"}[filters.metric]].map(value => `<span class="filter-pill">${escape(value)}</span>`).join("");
    $("export").disabled = !rows.length;
    $("empty").hidden = Boolean(rows.length); $("table-container").hidden = !rows.length;
    $("empty-message").textContent = !filters.quotas.length ? "Choose at least one allotment quota, or use Select all to include every quota." : filters.view === "compare" && !filters.colleges.length ? "Choose at least one college in the filters to start comparing." : "No allotments match these selections in " + filters.year + ". Try all quotas, another allotted category, or a different course. Some institutions appear under separate source addresses.";
    $("clear-result-search").hidden = !filters.search;
    cancelAnimationFrame(scrollFrame); scrollFrame = 0; renderedRows = 0;
    const sortButton = (field, text) => `<button data-sort="${field}" aria-label="Sort by ${text}">${text}<span class="sort-arrow" aria-hidden="true">${filters.sort === field ? (filters.direction === "asc" ? "↑" : "↓") : "↕"}</span></button>`;
    const ariaSort = field => filters.sort === field ? (filters.direction === "asc" ? "ascending" : "descending") : "none";
    const firstHeader = filters.view === "college" ? "Branch / course" : "College / course";
    const metricLabel = {closing:"Closing rank", range:"Opening – closing rank", count:"Allotment count"}[filters.metric];
    $("table-container").innerHTML = `<table class="cutoff-table ${filters.metric === "range" ? "range-table" : ""}" aria-rowcount="${rows.length + 1}"><colgroup><col class="label-column"><col class="quota-column"><col span="4" class="rank-column"></colgroup><caption class="skip-link">${escape(metricLabel)} by counselling round for ${filters.year}</caption><thead><tr aria-rowindex="1"><th scope="col" aria-sort="${ariaSort("name")}">${sortButton("name",firstHeader)}</th><th scope="col">Quota / category</th>${data.rounds.map((name,index) => `<th scope="col" class="round ${index === 3 ? "last" : ""}" aria-sort="${ariaSort("round"+index)}">${sortButton("round"+index,name)}</th>`).join("")}</tr></thead><tbody id="cutoff-rows"></tbody></table>`;
    $("table-container").scrollTop = 0;
    appendRows();
    writeHash();
  }
  function rowMarkup(row, rowIndex) {
      const primary = filters.view === "college" ? row.branch.name : row.college.name;
      const secondary = filters.view === "college" ? "" : row.college.state + (filters.view === "state" ? " · " + row.branch.name : "");
      return `<tr aria-rowindex="${rowIndex + 2}"><td title="${escape(row.college.address)}"><span class="primary-label">${escape(primary)}</span>${secondary ? `<span class="secondary-label">${escape(secondary)}</span>` : ""}</td><td class="group-cell">${escape(row.quota)}<br><span class="category-tag">${escape(row.category)}</span></td>${row.rounds.map((round,index) => {
        if (!round) return `<td class="rank-cell ${index === 3 ? "last" : ""}" aria-label="No matching allotment"><span class="rank-missing">—</span></td>`;
        const value = filters.metric === "count" ? format(round.count) : filters.metric === "range" ? `${format(round.opening)} – ${format(round.closing)}` : format(round.closing);
        const tooltip = `Opening rank ${format(round.opening)}; closing rank ${format(round.closing)}; ${format(round.count)} allotments`;
        const caption = filters.metric === "count" ? `close ${format(round.closing)}` : `${format(round.count)} allotted`;
        return `<td class="rank-cell ${index === 3 ? "last" : ""}" title="${tooltip}"><span class="rank-value">${value}</span><span class="rank-caption">${caption}</span></td>`;
      }).join("")}</tr>`;
  }
  function appendRows() {
    const end = Math.min(renderedRows + rowBatchSize, rows.length);
    $("cutoff-rows").insertAdjacentHTML("beforeend", rows.slice(renderedRows, end).map((row, index) => rowMarkup(row, renderedRows + index)).join(""));
    renderedRows = end;
    $("row-count").textContent = !rows.length ? "0 matching rows" : renderedRows < rows.length ? `Showing ${format(renderedRows)} of ${format(rows.length)} rows` : `${format(rows.length)} matching rows`;
    $("scroll-hint").textContent = !rows.length ? "" : renderedRows < rows.length ? "Scroll for more rows" : "All results loaded";
    $("back-to-top").hidden = $("table-container").scrollTop < 200;
  }
  for (const [id, name] of [["year","year"],["category","category"],["state","state"],["metric","metric"],["compare-branch","branch"]]) $(id).addEventListener("change", event => change(name, id === "year" ? Number(event.target.value) : event.target.value));
  for (const button of document.querySelectorAll("[data-view]")) button.addEventListener("click", () => change("view", button.dataset.view));
  $("result-search").addEventListener("input", event => change("search", event.target.value));
  $("clear-result-search").addEventListener("click", () => {$("result-search").value = ""; change("search", "");});
  $("reset").addEventListener("click", () => {const view = filters.view, year = filters.year; filters = {...defaults(), view, year}; for (const picker of [collegePicker,comparePicker,branchPicker]) picker.input.value = ""; syncControls(); render();});
  $("table-container").addEventListener("scroll", () => {
    if (scrollFrame) return;
    scrollFrame = requestAnimationFrame(() => {
      scrollFrame = 0;
      const container = $("table-container");
      $("back-to-top").hidden = container.scrollTop < 200;
      if (renderedRows < rows.length && container.scrollHeight - container.scrollTop - container.clientHeight < 400) appendRows();
    });
  }, {passive:true});
  $("back-to-top").addEventListener("click", () => {
    $("table-container").scrollTop = 0;
    $("table-container").focus({preventScroll:true});
  });
  $("table-container").addEventListener("click", event => {
    const button = event.target.closest("[data-sort]"); if (!button) return;
    const field = button.dataset.sort; filters.direction = filters.sort === field && filters.direction === "asc" ? "desc" : "asc"; filters.sort = field; render();
  });
  $("export").addEventListener("click", () => {
    const blob = new Blob([core.csv(rows, filters.year)], {type:"text/csv;charset=utf-8"});
    const url = URL.createObjectURL(blob), link = document.createElement("a"); link.href = url; link.download = `neet-pg-${filters.year}-${filters.view}-cutoffs.csv`; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
    toast(`Exported all ${format(rows.length)} matching rows with ranks and counts for every round.`);
  });
  $("share").addEventListener("click", async () => {
    writeHash();
    if (location.protocol === "file:" || ["localhost","127.0.0.1"].includes(location.hostname)) {toast("Publish this folder on GitHub Pages to share it with others. Your selected filters are saved in the address bar."); return;}
    try {await navigator.clipboard.writeText(location.href); toast("View link copied. The link includes your selected filters.");}
    catch {toast("Copy the address from your browser to share this exact view.");}
  });
  window.addEventListener("hashchange", () => {readHash(); syncControls(); render();});
  const quality = data.quality;
  $("data-quality").innerHTML = `<p><strong>Dataset coverage:</strong> ${format(quality.includedAllotments)} allotment events, ${format(data.colleges.length)} institution address records and ${data.branches.length} courses. ${quality.unknownStates.length} institution records have no identifiable state; ${quality.rejected.length} allotment rows were rejected during validation.</p><table class="quality-table"><thead><tr><th scope="col">Year</th><th scope="col">Round</th><th scope="col">Allotments included</th></tr></thead><tbody>${quality.sources.map(s => `<tr><td>${s.year}</td><td>${escape(s.round)}</td><td>${format(s.included)}</td></tr>`).join("")}</tbody></table><p>Sources: <code>2024_Seat_Allocation.xlsx</code> and <code>2025_Seat_Allocation.xlsx</code>, using each workbook’s Round 1, Round 2, Round 3 and Stray sheets.</p>`;
  readHash(); syncControls(); render();
})();
