import { expect, type Page } from "@playwright/test";

/** Fails the test on any console error or uncaught exception. */
export function watchErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(`console: ${m.text()}`);
  });
  page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));
  return errors;
}

/** Nothing may stick out of the screen horizontally (no sideways scroll on a phone). */
export async function expectNoOverflow(page: Page, where: string) {
  const offenders = await page.evaluate(() => {
    const w = document.documentElement.clientWidth;
    const out: string[] = [];
    if (document.documentElement.scrollWidth > w + 1) out.push(`page scrollWidth ${document.documentElement.scrollWidth} > ${w}`);
    for (const el of Array.from(document.querySelectorAll<HTMLElement>("body *"))) {
      const r = el.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) continue;
      // ignore things inside horizontally scrollable containers
      let p: HTMLElement | null = el.parentElement;
      let scroller = false;
      while (p) {
        const s = getComputedStyle(p);
        if (s.overflowX === "auto" || s.overflowX === "scroll") scroller = true;
        p = p.parentElement;
      }
      if (!scroller && r.right > w + 1) out.push(`${el.tagName.toLowerCase()}.${el.className} "${(el.textContent ?? "").trim().slice(0, 30)}" right=${Math.round(r.right)}`);
      // content spilling out of its own box (min-content wider than the container)
      const st = getComputedStyle(el);
      // dice fly in with a transform while rolling — transient, not layout
      if (!scroller && !el.closest(".die") && st.overflowX === "visible" && el.scrollWidth > el.clientWidth + 2 && el.clientWidth > 0 && !(el instanceof SVGElement) && st.display !== "inline")
        out.push(`spill ${el.tagName.toLowerCase()}.${el.className} "${(el.textContent ?? "").trim().slice(0, 30)}" ${el.scrollWidth}>${el.clientWidth}`);
    }
    return out.slice(0, 8);
  });
  expect(offenders, `horizontal overflow on ${where}`).toEqual([]);
}

/** Text that should never reach the user */
export async function expectNoGarbage(page: Page, where: string) {
  const text = await page.locator("body").innerText();
  const bad = ["NaN", "undefined", "[object Object]", "null фт", "Infinity"].filter((t) => text.includes(t));
  expect(bad, `garbage text on ${where}`).toEqual([]);
}

export async function tab(page: Page, name: string) {
  await page.locator(".bottomnav button", { hasText: name }).click();
}

export async function closeSheet(page: Page) {
  await page.locator(".sheet button[aria-label='Закрыть']").first().click();
}

export async function waitRoll(page: Page) {
  const box = page.locator(".roll .box");
  await expect(box).toBeVisible();
  await expect(box.locator(".total")).not.toHaveText("…", { timeout: 3000 });
  return box;
}

/** Put a ready-made character straight into storage (for screens, not for the editor flow). */
export async function seedCharacter(page: Page, ch: Record<string, unknown>) {
  await page.goto("/");
  await page.evaluate((c) => {
    const now = Date.now();
    const blank = {
      v: 1, player: "", createdAt: now, updatedAt: now + 1, subraceId: null, backgroundId: null, alignment: null,
      raceBonusChoice: [], hpMethod: "average", asi: {}, skills: [], expertise: [], extraProfs: [], languages: [], choices: {},
      spells: [], inventory: [], money: { cp: 0, sp: 0, ep: 0, gp: 0, pp: 0 }, hp: { current: 10, temp: 0, maxOverride: null },
      hitDiceUsed: {}, deathSaves: { ok: 0, fail: 0 }, slotsUsed: [0, 0, 0, 0, 0, 0, 0, 0, 0], pactUsed: 0, used: {}, conditions: [],
      exhaustion: 0, concentration: null, inspiration: false, toggles: {}, notes: "", log: [],
    };
    const full = { ...blank, ...c };
    const raw = { state: { chars: { [full.id as string]: full }, currentId: full.id, seenHints: {}, history: [], animateDice: true }, version: 0 };
    localStorage.setItem("dnd-sheet-v1", JSON.stringify(raw));
  }, ch);
  await page.reload();
}
