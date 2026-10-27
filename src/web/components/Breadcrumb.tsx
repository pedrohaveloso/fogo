import { Link } from "../router.tsx";

export function Breadcrumb({ items }: { items: { label: string; href: string }[] }) {
  return (
    <nav className="breadcrumb" aria-label="Você está em">
      <ol>
        {items.map((item) => (
          <li key={item.href}>
            <Link href={item.href}>{item.label}</Link>
          </li>
        ))}
      </ol>
    </nav>
  );
}
