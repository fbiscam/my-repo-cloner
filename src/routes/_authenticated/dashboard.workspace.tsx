import { createFileRoute } from "@tanstack/react-router";
import { SavedSignalsList } from "@/components/SavedSignalsList";

export const Route = createFileRoute("/_authenticated/dashboard/workspace")({
  component: WorkspacePage,
});

function WorkspacePage() {
  return (
    <div className="space-y-5">
      <header>
        <h1 className="pl-1 text-[22px] font-semibold tracking-tight text-zinc-900">Workspace</h1>
        <p className="mt-1 text-sm text-zinc-500">Your saved A+ setups and quick trade references.</p>
      </header>
      <div className="overflow-hidden rounded-xl border border-zinc-200 bg-white">
        <div className="bg-white p-5">
          <SavedSignalsList />
        </div>
      </div>
    </div>
  );
}
