export function RouteSpinner() {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-white">
      <svg
        aria-label="Loading"
        role="status"
        className="h-12 w-12 -rotate-90"
        viewBox="0 0 50 50"
      >
        <circle
          cx="25"
          cy="25"
          r="22"
          fill="none"
          stroke="#0b57d0"
          strokeOpacity="0.15"
          strokeWidth="3"
        />
        <circle
          cx="25"
          cy="25"
          r="22"
          fill="none"
          stroke="#0b57d0"
          strokeWidth="3"
          strokeLinecap="round"
          strokeDasharray="138.23"
          className="route-spinner-fill"
        />
      </svg>
      <style>{`
        @keyframes route-spinner-fill {
          0% { stroke-dashoffset: 138.23; }
          100% { stroke-dashoffset: 0; }
        }
        .route-spinner-fill {
          animation: route-spinner-fill 1.1s ease-in-out infinite;
        }
      `}</style>
    </div>
  );
}
