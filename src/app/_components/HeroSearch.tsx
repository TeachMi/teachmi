"use client";

// Homepage hero search — a slim subject + lesson-length picker that routes
// the visitor into `/browse`. Deliberately lighter than the full
// `BrowseFiltersBar`: the hero's job is to drop a visitor INTO the
// marketplace with a sensible starting filter; price / day / time / sort
// refinement happens on `/browse`, where a live result count gives
// feedback.
//
// Layout: a single row — the two Selects and the submit button share one
// 48px baseline with no spacer hacks; on mobile the row stacks. The grey
// field labels were dropped (founder direction 2026-05-21): the values
// themselves ("כל המקצועות", "60 דקות") are self-explanatory.

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export interface HeroSearchSubject {
  slug: string;
  displayNameHe: string;
}

interface HeroSearchProps {
  subjects: ReadonlyArray<HeroSearchSubject>;
}

// Radix `Select` items need a non-empty value, so the "no filter" choices
// map to sentinels and get translated away at the URL edge. Exported so
// the unit test can express "no filter" without hardcoding the literals.
export const SUBJECT_ALL = "__all__";
export const LENGTH_ANY = "__any__";

// The four canonical lesson lengths `/browse` filters on (see
// `browse-filters-shared.ts`). Kept as a local list — the hero only needs
// the URL value + a Hebrew label, not the full filter taxonomy.
const LENGTH_OPTIONS = [
  { value: "45", labelHe: "45 דקות" },
  { value: "60", labelHe: "60 דקות" },
  { value: "75", labelHe: "75 דקות" },
  { value: "90", labelHe: "90 דקות" },
] as const;

// Borderless trigger — the white form is the container; each Select reads
// as bold green text + chevron, mirroring the `/browse` filter triggers.
const TRIGGER_CLASS =
  "h-12 w-full border-0 bg-transparent px-0 text-base font-bold text-primary-container shadow-none focus:border-0 focus:ring-0";

/**
 * Build the `/browse` URL the hero search navigates to. The sentinel
 * values (`SUBJECT_ALL` / `LENGTH_ANY`) mean "no filter" and are dropped
 * from the query string. Exported for unit testing.
 */
export function buildHeroSearchUrl(subject: string, length: string): string {
  const params = new URLSearchParams();
  if (subject !== SUBJECT_ALL) params.set("subject", subject);
  if (length !== LENGTH_ANY) params.set("length", length);
  const query = params.toString();
  return query ? `/browse?${query}` : "/browse";
}

export function HeroSearch({ subjects }: HeroSearchProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [subject, setSubject] = useState<string>(SUBJECT_ALL);
  // Length defaults to 60 min — the canonical lesson length — so a visitor
  // who doesn't touch it still lands on a sensible `/browse?length=60`.
  // "כל אורך" stays available as an explicit choice.
  const [length, setLength] = useState<string>("60");

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const url = buildHeroSearchUrl(subject, length);
    startTransition(() => {
      router.push(url);
    });
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="flex flex-col gap-2 rounded-2xl bg-surface-lowest p-2 text-on-surface shadow-xl sm:flex-row sm:items-center"
    >
      <HeroSearchField>
        <Select value={subject} onValueChange={setSubject}>
          <SelectTrigger size="lg" aria-label="מקצוע" className={TRIGGER_CLASS}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={SUBJECT_ALL}>כל המקצועות</SelectItem>
            {subjects.map((s) => (
              <SelectItem key={s.slug} value={s.slug}>
                {s.displayNameHe}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </HeroSearchField>

      <div className="hidden h-8 w-px shrink-0 bg-linen-border sm:block" />

      <HeroSearchField>
        <Select value={length} onValueChange={setLength}>
          <SelectTrigger size="lg" aria-label="משך שיעור" className={TRIGGER_CLASS}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={LENGTH_ANY}>כל אורך</SelectItem>
            {LENGTH_OPTIONS.map((o) => (
              <SelectItem key={o.value} value={o.value}>
                {o.labelHe}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </HeroSearchField>

      <Button
        type="submit"
        variant="primary"
        size="lg"
        loading={isPending}
        className="w-full shrink-0 sm:w-auto"
        iconLeading={
          <span className="material-symbols-outlined text-xl" aria-hidden="true">
            search
          </span>
        }
      >
        מצאו מורה
      </Button>
    </form>
  );
}

// One field = the Select on its own, 48px tall, filling its share of the
// row. The visible label is the selected value itself.
//
// On phone the form stacks vertically: each field gets its own border so
// it reads as a distinct tappable control alongside the full-width submit
// button — three consistent blocks instead of two borderless text rows.
// From `sm:` up the row is inline and the fields are borderless (the white
// form is the frame).
function HeroSearchField({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-12 min-w-0 flex-1 items-center rounded-lg border border-linen-border px-3 sm:rounded-none sm:border-0">
      {children}
    </div>
  );
}
