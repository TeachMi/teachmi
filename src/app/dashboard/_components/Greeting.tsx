import { getHebrewGreeting } from "@/lib/hebrew/greeting";

interface GreetingProps {
  now: Date;
  displayName: string | null;
  hasUpcomingLessons: boolean;
}

export function Greeting({ now, displayName, hasUpcomingLessons }: GreetingProps) {
  const greeting = getHebrewGreeting(now, displayName);
  return (
    <div className="mb-6 text-start">
      <h1 className="font-display text-2xl font-extrabold text-primary-container">
        {greeting}
      </h1>
      <p className="text-sm text-secondary">
        {hasUpcomingLessons
          ? "" // Story 5.1 fills this with the countdown to the next lesson.
          : "ברוכים הבאים. בואו נמצא לכם את המורה המתאים."}
      </p>
    </div>
  );
}
