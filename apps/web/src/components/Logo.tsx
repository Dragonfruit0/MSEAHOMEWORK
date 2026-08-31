import logoUrl from '../assets/msea-logo.png';

export function Logo({ className = 'h-9' }: { className?: string }) {
  return <img src={logoUrl} alt="MS Education Academy" className={className} />;
}
