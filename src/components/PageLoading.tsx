type PageLoadingProps = {
  label?: string;
};

export default function PageLoading({ label = "Opening page" }: PageLoadingProps) {
  return (
    <div className="fixed inset-0 z-[9999] grid place-items-center bg-white text-zinc-900">
      <div className="flex flex-col items-center gap-3 text-center">
        <img src="/favicon.png" alt="JENVU AI" className="h-8 w-8 rounded-md object-contain" />
        <div className="h-5 w-5 animate-spin rounded-full border-2 border-zinc-200 border-t-zinc-900" />
        <p className="font-['Google_Sans','Product_Sans','Roboto',system-ui,sans-serif] text-sm font-normal normal-case tracking-normal text-zinc-800">{label}</p>
      </div>
    </div>
  );
}