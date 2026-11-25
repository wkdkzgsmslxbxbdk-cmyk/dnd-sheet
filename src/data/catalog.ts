import type {
  Background, CharClass, Equipment, Feat, Feature, MagicItem, Race, RefData, Spell, Subclass, Subrace, Trait,
} from "../rules/types";
import ref from "./gen/ref.json";
import spells from "./gen/spells.json";
import features from "./gen/features.json";
import classes from "./gen/classes.json";
import subclasses from "./gen/subclasses.json";
import races from "./gen/races.json";
import subraces from "./gen/subraces.json";
import traits from "./gen/traits.json";
import backgrounds from "./gen/backgrounds.json";
import feats from "./gen/feats.json";
import equipment from "./gen/equipment.json";
import magicItems from "./gen/magicItems.json";

function byId<T extends { id: string }>(list: T[]): Record<string, T> {
  return Object.fromEntries(list.map((x) => [x.id, x]));
}

export interface Catalog {
  ref: RefData;
  spells: Record<string, Spell>;
  spellList: Spell[];
  features: Record<string, Feature>;
  classes: Record<string, CharClass>;
  classList: CharClass[];
  subclasses: Record<string, Subclass>;
  races: Record<string, Race>;
  raceList: Race[];
  subraces: Record<string, Subrace>;
  traits: Record<string, Trait>;
  backgrounds: Record<string, Background>;
  feats: Record<string, Feat>;
  equipment: Record<string, Equipment>;
  equipmentList: Equipment[];
  magicItems: Record<string, MagicItem>;
  magicItemList: MagicItem[];
}

const spellList = spells as unknown as Spell[];
const classList = classes as unknown as CharClass[];
const raceList = races as unknown as Race[];
const equipmentList = equipment as unknown as Equipment[];
const magicItemList = magicItems as unknown as MagicItem[];

export const catalog: Catalog = {
  ref: ref as unknown as RefData,
  spells: byId(spellList),
  spellList,
  features: byId(features as unknown as Feature[]),
  classes: byId(classList),
  classList,
  subclasses: byId(subclasses as unknown as Subclass[]),
  races: byId(raceList),
  raceList,
  subraces: byId(subraces as unknown as Subrace[]),
  traits: byId(traits as unknown as Trait[]),
  backgrounds: byId(backgrounds as unknown as Background[]),
  feats: byId(feats as unknown as Feat[]),
  equipment: byId(equipmentList),
  equipmentList,
  magicItems: byId(magicItemList),
  magicItemList,
};

export const skillById = Object.fromEntries(catalog.ref.skills.map((s) => [s.id, s]));
export const abilityById = Object.fromEntries(catalog.ref.abilities.map((a) => [a.id, a]));
export const damageTypeById = Object.fromEntries(catalog.ref.damageTypes.map((d) => [d.id, d]));
export const schoolById = Object.fromEntries(catalog.ref.schools.map((s) => [s.id, s]));
export const conditionById = Object.fromEntries(catalog.ref.conditions.map((c) => [c.id, c]));
