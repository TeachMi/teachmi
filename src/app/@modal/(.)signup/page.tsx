import { SignupPanel } from "@/app/signup/SignupPanel";
import { SignupModal } from "./SignupModal";

export const dynamic = "force-dynamic";

interface InterceptedSignupProps {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}

// Intercepting route — renders `/signup` as an overlay for in-app (soft)
// navigations. A direct visit / hard refresh falls through to the real
// `src/app/signup/page.tsx`. Both share <SignupPanel>.
export default async function InterceptedSignupModal({
  searchParams,
}: InterceptedSignupProps) {
  const params = (await searchParams) ?? {};

  return (
    <SignupModal>
      <SignupPanel params={params} />
    </SignupModal>
  );
}
