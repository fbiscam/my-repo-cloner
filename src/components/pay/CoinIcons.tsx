// Inline brand marks for the crypto top-up page (no external requests).

type P = { className?: string };

export function UsdtIcon({ className = "h-6 w-6" }: P) {
  return (
    <svg viewBox="0 0 32 32" className={className} role="img" aria-label="Tether USDT">
      <circle cx="16" cy="16" r="16" fill="#26A17B" />
      <path
        fill="#fff"
        d="M17.9 17.4v-2h4.6V12H9.5v3.4h4.6v2c-3.8.2-6.6 1-6.6 1.9 0 .9 2.8 1.7 6.6 1.9v6.1h3.8v-6.1c3.8-.2 6.6-1 6.6-1.9 0-.9-2.8-1.7-6.6-1.9Zm0 3.2c-.1 0-.9.1-1.9.1s-1.8 0-1.9-.1c-3.2-.1-5.6-.7-5.6-1.3s2.4-1.2 5.6-1.3v2.1c.1 0 .9.1 1.9.1s1.8 0 1.9-.1v-2.1c3.2.1 5.6.7 5.6 1.3s-2.4 1.2-5.6 1.3Z"
      />
    </svg>
  );
}

export function TronIcon({ className = "h-6 w-6" }: P) {
  return (
    <svg viewBox="0 0 32 32" className={className} role="img" aria-label="Tron">
      <circle cx="16" cy="16" r="16" fill="#EF0027" />
      <path
        fill="#fff"
        d="M23.4 11.6 8.9 8.9l7.2 15.2 9-9.9-1.7-2.6Zm-.6 1.5-1.6 1.8-3.7-3.2 5.3 1.4Zm-6.2-1.6 3.7 3.2-8.1 3.5 4.4-6.7Zm-1-.6L11.4 17l-1-4.9 5.2 1.2Zm-4.5 2.3 1 4.5 6.2 5.9-7.2-10.4Zm7.6 9.7-6-5.7 8.2-3.5-2.2 9.2Z"
      />
    </svg>
  );
}

export function BnbIcon({ className = "h-6 w-6" }: P) {
  return (
    <svg viewBox="0 0 32 32" className={className} role="img" aria-label="BNB Smart Chain">
      <circle cx="16" cy="16" r="16" fill="#F3BA2F" />
      <path
        fill="#fff"
        d="m16 6.5 2.6 2.7-6.6 6.6-2.6-2.6L16 6.5Zm4.6 4.7 2.6 2.6-11.2 11.2-2.6-2.6 11.2-11.2ZM7.1 14.1l2.6 2.6-2.6 2.6-2.6-2.6 2.6-2.6Zm17.8 0 2.6 2.6-8.9 8.9-2.6-2.6 8.9-8.9ZM16 17.9l2.6 2.6L16 23.1l-2.6-2.6 2.6-2.6Z"
      />
    </svg>
  );
}

export function EthIcon({ className = "h-6 w-6" }: P) {
  return (
    <svg viewBox="0 0 32 32" className={className} role="img" aria-label="Ethereum">
      <circle cx="16" cy="16" r="16" fill="#627EEA" />
      <path fill="#fff" fillOpacity=".7" d="M16.1 5v8.1l6.8 3L16.1 5Z" />
      <path fill="#fff" d="M16.1 5 9.3 16.1l6.8-3V5Z" />
      <path fill="#fff" fillOpacity=".7" d="M16.1 21.3V27l6.9-9.6-6.9 3.9Z" />
      <path fill="#fff" d="M16.1 27v-5.7l-6.8-3.9L16.1 27Z" />
      <path fill="#fff" fillOpacity=".5" d="m16.1 20 6.8-3.9-6.8-3V20Z" />
      <path fill="#fff" fillOpacity=".8" d="m9.3 16.1 6.8 3.9v-6.9l-6.8 3Z" />
    </svg>
  );
}

export function NetworkIcon({ id, className }: { id: string; className?: string }) {
  if (id === "trc20") return <TronIcon className={className} />;
  if (id === "bep20") return <BnbIcon className={className} />;
  return <EthIcon className={className} />;
}
