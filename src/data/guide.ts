// Beginner texts written for this app (data/guide). Absent entries are fine:
// the UI falls back to what it can derive from the rules data.
import raw from "./gen/guide.json";
import type { Ability } from "../rules/types";

export interface GuideEntry {
  tagline: string;
  about: string[];
  roles?: string[];
  difficulty?: 1 | 2 | 3;
}
export interface ClassGuide extends GuideEntry {
  primary?: Ability[];
  quickBuild?: { abilities: Ability[]; background?: string; spells?: string[]; note?: string; page?: number };
}
export interface RaceGuide extends GuideEntry {
  age?: { adult: number; max: number };
  body?: { baseIn: number; heightDice: string | null; baseLb: number; weightDice: string | null };
}

interface Guide {
  classes: Record<string, ClassGuide>;
  subclasses: Record<string, GuideEntry>;
  races: Record<string, RaceGuide>;
  backgrounds: Record<string, GuideEntry>;
  glossary: { term: string; text: string }[];
}

export const guide = raw as unknown as Guide;

export const DIFFICULTY_RU = { 1: "Просто", 2: "Средне", 3: "Сложно" } as const;
