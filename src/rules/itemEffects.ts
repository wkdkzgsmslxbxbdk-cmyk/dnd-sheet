// Machine-readable effects of SRD magic items that change numbers on the sheet.
// Every entry quotes the SRD 5.1 sentence it encodes. Items not listed here are
// shown with their text only — the app does not guess their math.

import type { Ability } from "./types";

export type ItemMod =
  | { k: "ac"; v: number; when?: "noArmorNoShield" }
  | { k: "acBase"; base: number; label: string } // base AC = base + DEX when no armor
  | { k: "save"; v: number }
  | { k: "check"; v: number }
  | { k: "abilitySet"; ability: Ability; v: number }
  | { k: "abilityAdd"; ability: Ability; v: number; max: number }
  | { k: "prof"; v: number }
  | { k: "spellAttack"; v: number }
  | { k: "spellDc"; v: number }
  /** +N to attack and damage with this weapon */
  | { k: "weapon"; v: number }
  /** extra damage dice with this weapon, conditional text */
  | { k: "weaponExtra"; dice: string; type: string; when: string }
  /** bonus to AC when worn as armor or shield */
  | { k: "armor"; v: number };

export interface ItemEffect {
  mods: ItemMod[];
  /** this item is an armor/shield/weapon variant: the player picks the base item */
  base?: "armor" | "weapon" | "shield" | "ammunition";
  cite: string;
}

const ioun = (ability: Ability, color: string): ItemEffect => ({
  mods: [{ k: "abilityAdd", ability, v: 2, max: 20 }],
  cite: `Your ${color} score increases by 2, to a maximum of 20, while this stone orbits your head.`,
});

export const ITEM_EFFECTS: Record<string, ItemEffect> = {
  "armor-1": { base: "armor", mods: [{ k: "armor", v: 1 }], cite: "You have a +1 bonus to AC while wearing this armor." },
  "armor-2": { base: "armor", mods: [{ k: "armor", v: 2 }], cite: "You have a +2 bonus to AC while wearing this armor." },
  "armor-3": { base: "armor", mods: [{ k: "armor", v: 3 }], cite: "You have a +3 bonus to AC while wearing this armor." },
  "dwarven-plate": { mods: [{ k: "armor", v: 2 }], cite: "While wearing this armor, you gain a +2 bonus to AC." },
  "weapon-1": { base: "weapon", mods: [{ k: "weapon", v: 1 }], cite: "You have a +1 bonus to attack and damage rolls made with this magic weapon." },
  "weapon-2": { base: "weapon", mods: [{ k: "weapon", v: 2 }], cite: "You have a +2 bonus to attack and damage rolls made with this magic weapon." },
  "weapon-3": { base: "weapon", mods: [{ k: "weapon", v: 3 }], cite: "You have a +3 bonus to attack and damage rolls made with this magic weapon." },
  "ammunition-1": { base: "ammunition", mods: [{ k: "weapon", v: 1 }], cite: "You have a +1 bonus to attack and damage rolls made with this piece of magic ammunition." },
  "ammunition-2": { base: "ammunition", mods: [{ k: "weapon", v: 2 }], cite: "You have a +2 bonus to attack and damage rolls made with this piece of magic ammunition." },
  "ammunition-3": { base: "ammunition", mods: [{ k: "weapon", v: 3 }], cite: "You have a +3 bonus to attack and damage rolls made with this piece of magic ammunition." },
  "luck-blade": {
    base: "weapon",
    mods: [{ k: "weapon", v: 1 }, { k: "save", v: 1 }],
    cite: "You gain a +1 bonus to attack and damage rolls made with this magic weapon. While the sword is on your person, you also gain a +1 bonus to saving throws.",
  },
  defender: { base: "weapon", mods: [{ k: "weapon", v: 3 }], cite: "You gain a +3 bonus to attack and damage rolls made with this magic weapon." },
  "holy-avenger": {
    base: "weapon",
    mods: [{ k: "weapon", v: 3 }, { k: "weaponExtra", dice: "2d10", type: "radiant", when: "по исчадиям и нежити" }],
    cite: "You gain a +3 bonus to attack and damage rolls made with this magic weapon. When you hit a fiend or an undead with it, that creature takes an extra 2d10 radiant damage.",
  },
  "flame-tongue": {
    base: "weapon",
    mods: [{ k: "weaponExtra", dice: "2d6", type: "fire", when: "пока клинок пылает" }],
    cite: "While the sword is ablaze, it deals an extra 2d6 fire damage to any target it hits.",
  },
  "sun-blade": {
    mods: [{ k: "weapon", v: 2 }],
    cite: "You gain a +2 bonus to attack and damage rolls made with this weapon, which deals radiant damage instead of slashing damage.",
  },
  "ring-of-protection": { mods: [{ k: "ac", v: 1 }, { k: "save", v: 1 }], cite: "You gain a +1 bonus to AC and saving throws while wearing this ring." },
  "cloak-of-protection": { mods: [{ k: "ac", v: 1 }, { k: "save", v: 1 }], cite: "You gain a +1 bonus to AC and saving throws while you wear this cloak." },
  "bracers-of-defense": {
    mods: [{ k: "ac", v: 2, when: "noArmorNoShield" }],
    cite: "While wearing these bracers, you gain a +2 bonus to AC if you are wearing no armor and using no shield.",
  },
  "stone-of-good-luck-luckstone": {
    mods: [{ k: "check", v: 1 }, { k: "save", v: 1 }],
    cite: "While this polished agate is on your person, you gain a +1 bonus to ability checks and saving throws.",
  },
  "amulet-of-health": { mods: [{ k: "abilitySet", ability: "con", v: 19 }], cite: "Your Constitution score is 19 while you wear this amulet." },
  "gauntlets-of-ogre-power": { mods: [{ k: "abilitySet", ability: "str", v: 19 }], cite: "Your Strength score is 19 while you wear these gauntlets." },
  "headband-of-intellect": { mods: [{ k: "abilitySet", ability: "int", v: 19 }], cite: "Your Intelligence score is 19 while you wear this headband." },
  "belt-of-giant-strength-hill": { mods: [{ k: "abilitySet", ability: "str", v: 21 }], cite: "Hill Giant | 21" },
  "belt-of-giant-strength-stone": { mods: [{ k: "abilitySet", ability: "str", v: 23 }], cite: "Stone Giant / Frost Giant | 23" },
  "belt-of-giant-strength-frost": { mods: [{ k: "abilitySet", ability: "str", v: 23 }], cite: "Stone Giant / Frost Giant | 23" },
  "belt-of-giant-strength-fire": { mods: [{ k: "abilitySet", ability: "str", v: 25 }], cite: "Fire Giant | 25" },
  "belt-of-giant-strength-cloud": { mods: [{ k: "abilitySet", ability: "str", v: 27 }], cite: "Cloud Giant | 27" },
  "belt-of-giant-strength-storm": { mods: [{ k: "abilitySet", ability: "str", v: 29 }], cite: "Storm Giant | 29" },
  "ioun-stone-of-agility": ioun("dex", "Dexterity"),
  "ioun-stone-of-fortitude": ioun("con", "Constitution"),
  "ioun-stone-of-insight": ioun("wis", "Wisdom"),
  "ioun-stone-of-intellect": ioun("int", "Intelligence"),
  "ioun-stone-of-leadership": ioun("cha", "Charisma"),
  "ioun-stone-of-strength": ioun("str", "Strength"),
  "ioun-stone-of-mastery": { mods: [{ k: "prof", v: 1 }], cite: "Your proficiency bonus increases by 1 while this pale green prism orbits your head." },
  "ioun-stone-of-protection": { mods: [{ k: "ac", v: 1 }], cite: "You gain a +1 bonus to AC while this dusty rose prism orbits your head." },
  "staff-of-power": {
    mods: [{ k: "weapon", v: 2 }, { k: "ac", v: 2 }, { k: "save", v: 2 }, { k: "spellAttack", v: 2 }],
    cite: "This staff can be wielded as a magic quarterstaff that grants a +2 bonus to attack and damage rolls made with it. While holding it, you gain a +2 bonus to Armor Class, saving throws, and spell attack rolls.",
  },
  "robe-of-the-archmagi": {
    mods: [{ k: "acBase", base: 15, label: "Мантия архимага" }, { k: "spellDc", v: 2 }, { k: "spellAttack", v: 2 }],
    cite: "If you aren't wearing armor, your base Armor Class is 15 + your Dexterity modifier. Your spell save DC and spell attack bonus each increase by 2.",
  },
  "wand-of-the-war-mage-1": { mods: [{ k: "spellAttack", v: 1 }], cite: "While holding this wand, you gain a +1 bonus to spell attack rolls." },
  "wand-of-the-war-mage-2": { mods: [{ k: "spellAttack", v: 2 }], cite: "While holding this wand, you gain a bonus to spell attack rolls determined by the wand's rarity: rare (+2)." },
  "wand-of-the-war-mage-3": { mods: [{ k: "spellAttack", v: 3 }], cite: "While holding this wand, you gain a bonus to spell attack rolls determined by the wand's rarity: very rare (+3)." },
};

/** Magic items whose base is quarterstaff (staff of power works as a weapon) */
export const ITEM_BASE_WEAPON: Record<string, string> = {
  "staff-of-power": "quarterstaff",
  "sun-blade": "longsword",
};
