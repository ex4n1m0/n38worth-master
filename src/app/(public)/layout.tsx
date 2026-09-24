import { LanguageSwitcher } from "@/components/LanguageSwitcher";

export default function PublicLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <>
      <div className="fixed top-4 right-4 z-50">
        <LanguageSwitcher variant="pill" />
      </div>
      {children}
    </>
  );
}
