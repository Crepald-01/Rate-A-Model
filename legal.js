(() => {
  const $ = s => document.querySelector(s), $$ = s => [...document.querySelectorAll(s)];
  const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;

  // headline word-by-word
  const h = $("h1[data-split]");
  if (h) h.innerHTML = h.textContent.split(" ").map((w, i) => `<span class="w" style="--i:${i}">${w}</span>`).join(" ");

  // theme toggle (shares the main site's preference)
  const now = () => document.documentElement.dataset.theme || (matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
  const btn = $("#theme");
  btn && btn.addEventListener("click", () => {
    const t = now() === "dark" ? "light" : "dark", r = btn.getBoundingClientRect();
    const apply = () => { document.documentElement.dataset.theme = t; try { localStorage.setItem("rtm_theme", JSON.stringify(t)); } catch {} };
    if (document.startViewTransition && !reduced) {
      document.documentElement.style.setProperty("--tx", r.left + r.width / 2 + "px");
      document.documentElement.style.setProperty("--ty", r.top + r.height / 2 + "px");
      document.startViewTransition(apply);
    } else apply();
  });

  // progress bar, nav border, back-to-top, section reveal, scroll-spy (all driven by scroll position)
  const prog = $("#prog"), nav = $("nav"), top = $("#top"), secs = $$(".sec"), links = $$(".toc a");
  let ticking = false;
  const update = () => {
    ticking = false;
    const max = document.documentElement.scrollHeight - innerHeight;
    prog.style.transform = `scaleX(${max > 0 ? Math.min(1, scrollY / max) : 0})`;
    nav.classList.toggle("s", scrollY > 8);
    top.classList.toggle("show", scrollY > 600);
    let cur = null;
    secs.forEach(s => {
      const r = s.getBoundingClientRect();
      if (r.top < innerHeight * .92) s.classList.add("in");
      if (r.top <= innerHeight * .35) cur = s;
    });
    if (scrollY + innerHeight >= document.documentElement.scrollHeight - 4) cur = secs[secs.length - 1];
    secs.forEach(s => s.classList.toggle("cur", s === cur));
    links.forEach(a => a.classList.toggle("on", !!cur && a.getAttribute("href") === "#" + cur.id));
  };
  const req = () => { if (!ticking) { ticking = true; requestAnimationFrame(update); } };
  addEventListener("scroll", req, { passive: true });
  addEventListener("resize", req);
  update(); setTimeout(update, 300);
  top.addEventListener("click", () => scrollTo({ top: 0 }));
})();
