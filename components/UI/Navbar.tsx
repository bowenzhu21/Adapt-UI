import Link from 'next/link';

type NavbarProps = {
  minimal?: boolean;
};

export default function Navbar({ minimal = false }: NavbarProps) {
  const headerClass = minimal ? 'home-nav py-4' : 'glass-nav py-4';
  const brandClass = minimal ? 'glass-brand home-brand' : 'glass-brand';
  const sandboxLinkClass = minimal ? 'home-nav-link' : 'btn-ghost';

  return (
    <header className={headerClass}>
      <Link href="/" className={brandClass}>
        Adapt
      </Link>
      <nav className="flex items-center gap-2">
        <Link className={sandboxLinkClass} href="/sandbox">Sandbox</Link>
      </nav>
    </header>
  );
}
