// Character portrait: the player's own picture, or an emblem built from the class
// (icon + class colour) with the race shown as a small badge.
import {
  IconAxe, IconMusic, IconSun, IconLeaf, IconSwords, IconHandStop, IconShield, IconBow, IconMask,
  IconFlame, IconEye, IconBook, IconTool, IconUserCircle, IconMountain, IconTrees, IconFeather,
  IconMoon, IconSparkles, IconPaw, IconSkull, IconCrown, IconHammer, IconWind, IconBrain, IconDragon, IconGhost,
  type Icon,
} from "@tabler/icons-react";
import type { Character } from "../rules/character";

export const CLASS_ICON: Record<string, Icon> = {
  barbarian: IconAxe, bard: IconMusic, cleric: IconSun, druid: IconLeaf, fighter: IconSwords, monk: IconHandStop,
  paladin: IconShield, ranger: IconBow, rogue: IconMask, sorcerer: IconFlame, warlock: IconEye, wizard: IconBook, artificer: IconTool,
};
/** hue per class (HSL) — readable in light and dark themes */
export const CLASS_HUE: Record<string, number> = {
  barbarian: 8, bard: 320, cleric: 45, druid: 110, fighter: 210, monk: 30, paladin: 50, ranger: 140, rogue: 260,
  sorcerer: 350, warlock: 280, wizard: 225, artificer: 180,
};
export const RACE_ICON: Record<string, Icon> = {
  dwarf: IconHammer, elf: IconTrees, halfling: IconFeather, human: IconUserCircle, dragonborn: IconDragon, gnome: IconSparkles,
  "half-elf": IconMoon, "half-orc": IconMountain, tiefling: IconFlame, aasimar: IconSun, aarakocra: IconFeather, genasi: IconWind,
  goliath: IconMountain, firbolg: IconTrees, kenku: IconFeather, lizardfolk: IconPaw, tabaxi: IconPaw, triton: IconWind,
  bugbear: IconSkull, goblin: IconSkull, hobgoblin: IconCrown, kobold: IconDragon, orc: IconMountain, "yuan-ti-pureblood": IconEye,
  gith: IconBrain,
};

export function Avatar({ c, size = 44, ghost }: { c: Pick<Character, "classes" | "raceId" | "portrait" | "name">; size?: number; ghost?: boolean }) {
  const classId = c.classes[0]?.classId ?? "fighter";
  const hue = CLASS_HUE[classId] ?? 220;
  if (c.portrait) {
    return <img src={c.portrait} alt={c.name || "Портрет"} className="avatar" style={{ width: size, height: size }} />;
  }
  const ClassIcon = CLASS_ICON[classId] ?? IconUserCircle;
  const RaceIcon = RACE_ICON[c.raceId] ?? (ghost ? IconGhost : IconUserCircle);
  return (
    <div
      className="avatar emblem"
      role="img"
      aria-label={c.name || "Персонаж"}
      style={{ width: size, height: size, ["--h" as string]: hue } as React.CSSProperties}
    >
      <ClassIcon size={size * 0.55} stroke={1.7} />
      {size >= 40 && (
        <span className="avatar-badge" style={{ width: size * 0.4, height: size * 0.4 }}>
          <RaceIcon size={size * 0.26} stroke={2} />
        </span>
      )}
    </div>
  );
}

/** Downscale a picked image to a 256px square JPEG data URL (fits comfortably in local storage). */
export async function imageToPortrait(file: File, px = 256): Promise<string> {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((ok, fail) => {
      const i = new Image();
      i.onload = () => ok(i);
      i.onerror = () => fail(new Error("Не получилось открыть картинку"));
      i.src = url;
    });
    const side = Math.min(img.width, img.height);
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = px;
    const ctx = canvas.getContext("2d")!;
    // centre crop to a square — faces are usually in the middle
    ctx.drawImage(img, (img.width - side) / 2, (img.height - side) / 2, side, side, 0, 0, px, px);
    return canvas.toDataURL("image/jpeg", 0.82);
  } finally {
    URL.revokeObjectURL(url);
  }
}
