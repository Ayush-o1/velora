import { Logo } from "@/components/ui/Logo";
import { GitHubMark } from "@/components/ui/icons";

const REPO_URL = "https://github.com/Ayush-o1/velora";

export function Footer() {
  return (
    <footer className="border-t border-border">
      <div className="max-w-[1180px] mx-auto px-5 sm:px-8 py-8 flex flex-col sm:flex-row items-center justify-between gap-4 text-sm text-muted">
        <Logo size={20} textClassName="text-[15px] text-ink-secondary" />
        <p className="order-3 sm:order-2 text-center">A considered place to host and book live sessions.</p>
        <a
          href={REPO_URL}
          target="_blank"
          rel="noopener noreferrer"
          aria-label="View the Velora source code on GitHub"
          className="order-2 sm:order-3 inline-flex items-center gap-1.5 text-ink-secondary transition-colors duration-[var(--duration-fast)] hover:text-ink"
        >
          <GitHubMark size={16} />
          Source
        </a>
      </div>
    </footer>
  );
}
